@AGENTS.md

# DATA SERVICE
- **Railway URL**: `https://bloomberg-term-clone-production.up.railway.app`

# LAUNCH CHECKLIST
- [x] `ENABLE_SCHEDULER=true` set in Railway env vars — scheduler is on
- [x] Anthropic API credits loaded
- [x] All required API keys set in Railway env vars — verified live via `/pipeline-check`: `ALPACA_API_KEY`, `ALPACA_API_SECRET`, `ANTHROPIC_API_KEY`, `FMP_API_KEY`, `KALSHI_API_KEY`, `KALSHI_PRIVATE_KEY` all present. `RESEND_API_KEY` confirmed valid (real newsletter sends succeeding). `NEWS_API_KEY` is missing — only silences prediction-markets' per-market news enrichment, not core ingestion.
- [x] Data sources are Alpaca-first (stocks, crypto, options) — news sources and predictive markets are the only non-Alpaca sources
- [x] Confirm Railway is deploying from `main` branch
- [x] Newsletter: fixed two independent root causes of "newsletter never sent" — `RESEND_API_KEY` was being clobbered every 5 min by the uptime-check job, and `newsletter_sends` (the dedup-tracking table) had a correct RLS policy but no underlying `GRANT`, so writes silently failed. Both fixed; confirmed live with a real send that's now correctly tracked.
- [x] Options flow: Alpaca snapshots migration confirmed working in production (3,303 rows/run, 0 errors). Deliberately not building historical backtesting for it — the existing backtest re-scores continuous OHLCV history, which doesn't apply to event-driven options flow, and there's no historical options-chain data pipeline to backtest against (real separate project, not a launch task). Instead, `/accuracy` now exposes a live `options_flow` breakdown querying `signals` directly for the `"[Options flow] "` reasoning-tagged subset — forward-tracked accuracy through the existing resolver, not a backtest. Confirmed live: 11 signals tracked, currently all `PENDING` (too new to have resolved yet).
- [x] Corporate actions (splits/dividends/spinoffs/mergers): feature confirmed working end-to-end — ingestion, field mapping (`ca_type` normalized to singular to match the dashboard), and DB permissions all verified live.
- [x] Table permissions audit: the "RLS policy exists, base `GRANT` missing" bug above showed up on 4 tables total (`newsletter_sends`, `corporate_actions`, `push_subscriptions`, `on_demand_scoring_log`), all created via ad-hoc migrations outside whatever path granted the other ~20 tables their defaults automatically. Audited every table in the project and fixed all 4. Also found and closed the root mechanism: an `rls_auto_enable()` event trigger was already auto-enabling RLS on every new table but never auto-granting privileges — extended it to also grant `service_role` full CRUD on table creation, so this whole bug class can't recur. Separately found and fixed a real IDOR: `get_dashboard_signals(p_user_id, ...)` was a `SECURITY DEFINER` function publicly callable with no `auth.uid()` check — revoked public execute (nothing in the codebase called it).
- [x] Predictive markets: live via Polymarket, Kalshi deliberately disabled. Kalshi's RSA-PSS signing kept failing with credentials confirmed present and no server-side log access to diagnose further — rather than keep guessing blind, disabled it (`KALSHI_ENABLED = False` in `prediction_markets.py`, code kept intact, one-line flip to re-enable later) and switched Polymarket from the CLOB API (order-book/trading, wrong tool for bulk listing, and was hitting 0 rows) to the Gamma API (public, no auth, the actual market-listing API). Verified live: `2072 raw_prices written (Kalshi: disabled, 2072 Polymarket)`. Spot-checked rows — real markets (2026 World Cup futures, Senate seat count), `yes_price`/`no_price` correctly summing to ~1.0 across every row checked.
- [x] Congressional trades: Senate Stock Watcher's feed was dead (stale since ~Dec 2020) — replaced with a direct `efdsearch.senate.gov` scraper (#35). First live run 403'd on the CSRF agreement POST (missing `Referer`/`Origin` headers); fixed in #36. Re-verified live: `/run-job/ingest_congressional` now returns `54 inserted [efd(73)]` on a cold run and `0 inserted (all duplicates) [efd(71)]` on a repeat, confirming the scraper and dedup both work correctly. Spot-checked 2 rows against capitoltrades.com/Benzinga (McConnell WFC buy, Boozman TLH-family sells) — trade date, report date, and amount range all matched exactly. Data is real but disclosure-lagged (STOCK Act gives 30-45 days to file), so `last_30d` counts will look sparse — that's expected, not a bug. Insider trades (separate source chain, SEC EDGAR/Finnhub/FMP) still untouched.
- [x] `send_elite_briefings` manual smoke test: this was already wired into `/run-job/`'s manual-trigger map by #39 (checklist just hadn't been updated). Verified live via `POST /run-job/send_elite_briefings` → `1 sent, 0 failed, 0 skipped`.
- [x] Web UI click-testing: corporate actions/insider trades card and on-demand scoring ("Generate AI Signal") confirmed working live by user. Push-notification subscribe/unsubscribe surfaced a real bug while investigating: `push_subscriptions` had RLS enabled with SELECT/INSERT/DELETE policies+grants but no UPDATE policy or grant for `authenticated` — the frontend's `.upsert(..., {onConflict:"endpoint"})` compiles to `INSERT ... ON CONFLICT DO UPDATE`, which Postgres requires UPDATE privilege to even plan, so every subscribe attempt failed regardless of whether a conflict actually occurred (confirmed via 0 rows in the table). Added the missing UPDATE grant + policy (`auth.uid() = user_id`, matching the existing pattern). Swept all tables for the same "upsert without UPDATE grant" pattern — only one other hit (`on_demand_scoring_log`), which only ever does plain `.insert()` so no fix needed there.
- [x] Newsletter Outlook rendering: fixed the `/send-newsletter-now` tier bug (was hardcoded to `"free"`, ignored `tier` param — #43) and added `data-ogsc`/`data-ogsb` CSS overrides for Outlook.com/New-Outlook-for-Windows' dark-mode auto-recolor of near-black backgrounds (#45). Verified via local Chromium render that signals/options cards render correctly. Confirmed via real inbox screenshot that Outlook mobile app (iOS/Android) still shows a washed-out gray background instead of near-black — that client uses a different, more aggressive dark-mode engine that doesn't expose the `data-ogsc` hook and is documented to largely ignore `color-scheme`/`supported-color-schemes` meta tags. No reliable CSS-only fix exists for this client; user explicitly decided to accept it as a known Outlook-mobile-only limitation rather than chase it further. Gmail, Apple Mail, and OWA/New-Outlook-desktop all confirmed rendering correctly.

# ALGO / SIGNAL QUALITY (July 4 session — the "why was live underperforming" investigation)
- [x] **ROOT CAUSE FOUND — live stock scoring was blind.** Three stacked data bugs meant production stock
      signals never saw RSI/MACD/Bollinger data while every backtest did (explains live stock SELLs 0/20
      vs 50-61% in backtests): (1) `ingestion/stocks.py` matched pandas_ta column names case-sensitively
      (`rsi_` vs `RSI_14`) — every ta-derived indicator ingested as null since the matcher was introduced
      (17d309a, near project start); crypto's matcher was always case-insensitive, which is why crypto
      cited real RSI and stocks never did (#57). (2) The multi-source OHLCV merge added in #14 (June 29)
      crashed on tz-aware Alpaca vs tz-naive fallback indexes (`pd.concat().sort_index()` TypeError,
      outside every try) — ingestion failed for most of the watchlist for a week; funnel diagnostics
      (#58) pinpointed it, fixed in #59, verified live: 80/80 ingested. (3) `streaming/alpaca_ws.py`
      flushes thin `{source, updated_at}` rows every 60s that shadowed indicator rows for naive
      newest-row queries — new `scoring/price_data.get_scoring_price_row()` merges freshest price with
      newest indicator-bearing row; also crypto never wrote `prev_macd_hist` so the BTC regime gate had
      no data (#57). Verified end-to-end: scanner qualifies stocks again (16 vs 0), signals cite real
      indicator values, `[Validated pattern]` annotations firing live.
- [x] **Deterministic gates (code-enforced, not just prompt text)** in `scoring/engine.py` (#53): SPY
      regime gate (no BUYs when SPY < SMA-50, no SELLs when SPY >5% above — that asymmetry caused the
      0/20 SELL streak), BTC regime gate for alt-coins, breadth cap (max 4 extended BUYs per run —
      targets the 2026-04-17 correlated 5-stop cluster), data-quality skip (no technicals → no signal,
      no Claude spend), evidence gate from factor study (below).
- [x] **Factor discovery** (`analysis/factor_discovery.py`, #55; `POST /factor-discovery`): model-free
      empirical study, 62 stocks, ~9,800 observations, ~10 months, train/test split at 2026-03-15.
      Robust out-of-sample findings encoded + enforced in `scoring/validated_factors.py` (#56), only
      buckets with test n≥~100: don't fade strength (>15% above SMA-50 or RSI>70 with expanding MACD =
      BUY-favorable ~57-63%); positive-but-CONTRACTING MACD is an early SELL tell (~56-61% down)
      EXCEPT in deep uptrends where it's a buyable pause; RSI 30-45 with positive MACD bleeds.
      Signals contradicting validated patterns get downgraded to HOLD (`[Evidence gate]`); aligned ones
      annotated (`[Validated pattern: ...]`) so /accuracy can compare later.
- [x] **Backtest status:** executed on Sonnet 5, crypto-only (13 coins), conviction floor 64%,
      date range 2026-03-01 to 2026-07-21. Floor raised from 60→64 based on backtest analysis:
      conf 60-63 signals had 31.8% win rate (PF 0.71, net negative); conf 64+ had 68.8% WR, PF 3.23.
- [x] **Risk management recalibrated:** position sizing, stop discipline, and prop-firm-style
      limits addressed. Drawdown circuit breaker no longer tripping.
- [x] Newsletter generation silent-failure gap: added `_alert_generation_failure()` email alert (mirrors
      the uptime-check pattern) fired from both the Claude-call-failure and DB-write-failure branches of
      `generate_newsletter()`, plus a real regeneration retry (`job_send_newsletter_retry()`) instead of
      the old 7:45am job just re-sending nothing.

# SCORING ENGINE ARCHITECTURE (current state, July 2026)

The scoring engine has been extensively tuned across multiple sessions. This section documents the
complete architecture so future sessions can pick up without re-deriving it.

## Deterministic gate stack (`scoring/engine.py`, lines ~934-1153)
Every signal Claude produces passes through these gates **in order**, any of which can downgrade
a BUY/SELL to HOLD (saving the signal write + preventing bad calls). Gates are code-enforced —
they override the model regardless of what the prompt says.

1. **Confidence gate** (`risk_engine.CONFIDENCE_MINIMUM = 64`): BUY/SELL below 64% → HOLD
2. **Circuit breaker** (±8% change_24h): no SELLs after >8% gap up, no BUYs after >8% gap down
3. **SPY regime gate** (stocks only): SPY below SMA-50 → no BUYs; SPY >5% above SMA-50 → no SELLs
4. **SPY 1h SMA-20 gate** (stocks only): SPY below 20-period SMA on 1h candles → no BUYs
5. **RVOL gate** (stocks only): relative volume < 2.5x → HOLD (3.5x for high-beta watchlist)
6. **High-beta sector alignment** (AMD/NVDA/COIN/SMCI/AVGO): QQQ must be green for BUYs
7. **BTC regime gate** (crypto, non-BTC): BTC MACD bearish+deepening → no alt-coin BUYs
8. **Crypto correlation cap** (crypto BUYs): max 2 concurrent open crypto longs, and ≤1 alt
   alongside an open BTC/ETH major. Ports the stock breadth cap to crypto — which needs it more,
   since alts track BTC so a basket of longs is one directional bet. Pure decision in
   `_crypto_correlation_block_reason()`, open positions from `_open_crypto_buy_positions()`.
9. **Breadth cap** (stocks only): max 4 extended BUYs (>8% above SMA-50) per scoring run
10. **Evidence gate** (stocks only): checked against `validated_factors.py` — if indicators match
    a validated pattern favoring the OPPOSITE direction, signal is downgraded to HOLD

After gates, the signal hits the **risk engine** (`scoring/risk_engine.py`) which computes
stop/target/position sizing across 4 prop-firm-modeled profiles. Signals where position resolves
to zero units or R:R is below minimum are suppressed.

## Accuracy penalty (`_apply_accuracy_penalty`, engine.py ~487-514)
Assets with 3+ resolved signals since `ENGINE_CUTOFF` and <15% win rate get capped at 55%
confidence; <30% win rate capped at 60%. Prevents the engine from repeatedly signaling losers.

## Hybrid rules engine (`scoring/rules_engine.py`)
Parallel scoring path — SELLs handled entirely by deterministic pattern-matching ($0 cost), BUYs
escalated to Claude for confirmation. Uses the same gate stack as engine.py. Drop-in replacement
for `score_stocks()` / `score_crypto()`.

## Validated factors (`scoring/validated_factors.py`)
Empirically derived from `analysis/factor_discovery.py` — 10-month study, 62 stocks, ~9,800
observations, train/test split at 2026-03-15. Only patterns with test n>=100 are enforced.

**Empirically validated (n>=100 out-of-sample):**
- BUY: deep uptrend + MACD expanding, RSI>70 + MACD expanding, deep uptrend pullback,
  RSI>70 + MACD contracting, healthy RSI + MACD recovering
- SELL: fading momentum below SMA-50, fading momentum in flat trend, weak RSI + MACD
  contracting, neutral RSI + MACD contracting, weak RSI + MACD expanding,
  shallow recovery in flat trend

**Theoretical (expanded BUY coverage, July 2026):** 6 additional moderate-condition BUY patterns
(MACD crossovers, moderate uptrend continuation, oversold bounce). Not yet at n>=100 — marked
"theoretical" and escalated to Claude for confirmation via hybrid engine.

## Risk engine (`scoring/risk_engine.py`)
Multi-profile prop-firm-modeled position sizing:
- 4 profiles: retail_standard ($10k), 25k_prop_conservative, 50k_prop_moderate (default),
  150k_prop_boss ($150k)
- 10% slippage friction buffer on all sizing
- Per-profile daily kill switches
- Asset-class-specific R:R configs (stocks 2:1-3:1, crypto 2:1-3:1, options 2.5:1-3:1,
  predictions 2:1-5:1)
- ETF-to-futures translation (SPY→ES/MES, QQQ→NQ/MNQ)
- Subscription tier gating (Pro: stocks+crypto, Elite: all)
- 3:30 PM EST market cutoff for stock signals

## Two-stage cost optimization (Haiku prescreen)
- `scoring/haiku_prescreen.py` uses `claude-haiku-4-5-20251001` (~$0.001/call)
- CORE_CRYPTO (BTC, ETH, SOL, XRP, ADA, DOGE, BNB, AVAX, LINK, UNI): scored directly with Sonnet (always high-signal)
- TIER1_CRYPTO (53 coins): Haiku prescreen filters ~70-80%, only 64+ confidence escalates
- Lower-tier coins: only scored if >5% daily move (`CRYPTO_MOVER_THRESHOLD = 5.0`)
- Stock prescreen: core 9 tickers always Sonnet, rest Haiku-first

## Key constants
- `ENGINE_CUTOFF = "2026-07-15T00:00:00Z"` — v2 engine launch; signals before this are from a fundamentally different product
- `SIGNAL_COOLDOWN_H = 4` — skip if signal generated within 4 hours
- `CRYPTO_SIGNAL_COOLDOWN_H = 1` — shorter cooldown for 24/7 crypto markets
- `MAX_STOCK_SIGNALS_PER_DAY = 3` — hard cap on stock signals per calendar day
- `CRYPTO_SOFT_CAP = 8` — after 8 signals/day, confidence threshold escalates (70%+ for 9-12, 80%+ for 13-15)
- `CRYPTO_HARD_CAP = 15` — absolute ceiling on crypto signals per UTC day
- `MAX_CONCURRENT_CRYPTO_BUYS = 2` — max simultaneous open crypto longs
- `CRYPTO_MAJORS = {BTC, ETH}` — correlated majors; ≤1 alt allowed alongside an open major
- `STOCK_RVOL_MINIMUM = 2.5` / `HIGH_BETA_RVOL_MINIMUM = 3.5`
- `HIGH_BETA_VOLATILITY_WATCHLIST = {AMD, NVDA, COIN, SMCI, AVGO}`

## Crypto portfolio defense (July 2026)
Ported the stock-only guardrails to crypto so the correlated-drawdown cluster that blew the stock
sims can't recur on a more-correlated asset class:
- **ATR stops**: `ingestion/crypto.py` now computes `atr_14` (1h candles); risk engine uses 1.5×ATR
  (clamped 1–5%) as the stop instead of a flat 3%. Model `invalidation_price` still takes precedence
  when provided; ATR is the volatility-adaptive fallback.
- **Correlation cap**: gate #8 above (max 2 concurrent longs, ≤1 alt with a major).
- **Escalating daily cap**: soft cap at 6 signals/day (base 60% floor), escalating to 70% for
  signals 7-10 and 80% for 11-15, hard ceiling at 15. Enforced in `score_crypto()` and
  `score_crypto_rules()`. Strong setups always pass; marginal ones filter out as the day fills.
- Verified deterministically (no API spend): cap truth table passes; worst-case correlated single-day
  drawdown cluster drops 67% (6→2 concurrent longs). A paid Claude backtest was NOT rerun.

## Files map
- `scoring/engine.py` — main AI scoring, all gates, batch scoring functions
- `scoring/rules_engine.py` — hybrid deterministic + AI escalation engine
- `scoring/validated_factors.py` — empirical pattern table + evidence gate logic
- `scoring/risk_engine.py` — position sizing, stop/target, prop profiles, kill switches
- `scoring/haiku_prescreen.py` — cheap Haiku first-pass filter
- `scoring/scanner.py` — stock/crypto screening (which tickers to score)
- `scoring/price_data.py` — indicator-merging helper (fixes thin live-stream row problem)
- `scoring/accuracy.py` — win rate tracking + `/accuracy` endpoint
- `scoring/resolver.py` — signal outcome resolution (WIN/LOSS/EXPIRED)
- `scoring/alert_evaluator.py` — price alert evaluation
- `analysis/factor_discovery.py` — the empirical study that produced validated_factors
- `analysis/claude_backtest.py` — backtesting engine (Sonnet 5, crypto-only by default, conviction floor 64%)

# CRYPTO-ONLY PIVOT (July 2026)
Platform pivoted from stocks+crypto to **crypto-only** to focus on what's working and reduce costs.
Stock features are **disabled and hidden, NOT deleted** — code stays intact for potential future re-enable.

**What changed:**
- Stock scoring scheduler jobs: wrap in `ENABLE_STOCK_SCORING=true` env var check (default off)
- Sidebar nav: hide Congress and Insiders links (stock-only features)
- SignalFeed TABS: remove "Stocks" tab from the filter bar
- Screener: hide stock-specific filters
- Stock code (ingestion, scoring, prompts) stays intact — just not scheduled or visible

**What stays active:**
- Crypto scoring: every 2h (12x/day) — CORE_CRYPTO (BTC, ETH, SOL, XRP, ADA, DOGE, BNB, AVAX, LINK, UNI) scored directly,
  TIER1_CRYPTO (53 coins) prescreened with Haiku first, lower-tier coins only if >5% daily move
- Prediction markets: 2x/day via Polymarket, up to 10 signals/day, 30 candidate pool
- News ingestion: continues (serves crypto + predictions + world coverage)
- Congressional trades: stays active (still useful context, low cost)
- Newsletter/briefings: continue 7 days/week, content covers world broadly (see NEWSLETTER section)

**Rationale:** Crypto signals were consistently strong in backtests (88-94% win rate, small n). Stock
signals had fundamental data pipeline bugs (see ALGO section) and BUY-side edge was unproven (31-37%).
$30 API budget constraint makes crypto-only the right call — revisit stocks when revenue supports it.

# MODEL: SONNET 5 (switched July 2026)
All Claude API calls (scoring, briefings, newsletter, elite briefing) switched from `claude-sonnet-4-6`
to `claude-sonnet-5`. Haiku prescreen stays on `claude-haiku-4-5-20251001` (unchanged).

**Files changed:** `scoring/engine.py`, `briefing/generator.py`, `briefing/newsletter.py`,
`briefing/elite_briefing.py`, `analysis/claude_backtest.py`. All on Sonnet 5. Backtest also updated
to crypto-only default (13 coins: 5 CORE + 8 TIER1), conviction floor 64%, date range 2026-03-01 to
2026-07-21, 6 sample dates post-indicator-fix.

**Cost impact (crypto-only, Sonnet 5 introductory pricing through Aug 31 2026):**
- Introductory: $2/M input, $10/M output (vs Sonnet 4.6 standard $3/$15)
- Sonnet 5 tokenizer produces ~1.0-1.35x more tokens for same content
- Net effect: roughly break-even to slightly cheaper than Sonnet 4.6 during intro period
- Estimated daily cost: ~$0.15-0.30/day (~$6-12/month) for crypto+predictions+briefings+newsletter
- After intro period (post Aug 31): $3/$15 (same as Sonnet 4.6 was), so no cost increase

**Two-stage scoring pipeline (cost optimization):**
- CORE_CRYPTO (BTC, ETH, SOL, XRP, ADA, DOGE, BNB, AVAX, LINK, UNI): scored directly with Sonnet 5 (always high-signal)
- TIER1_CRYPTO (53 coins): Haiku prescreen (~$0.001/call) filters ~70-80%, only 64+ confidence
  escalates to Sonnet 5 for full scoring
- Lower-tier coins: only scored if >5% daily move (CRYPTO_MOVER_THRESHOLD = 5.0)

# PREDICTION SIGNAL GUARDRAILS (July 2026)
Prediction markets pass through a guardrail stack before any signal is written:

1. **Category gate** (`prediction_filters.is_allowed_category`): title-based inference since Polymarket
   Gamma API returns empty categories. Allowed: politics, elections, geopolitics, economics, macro, fed,
   finance, crypto, web3, technology, science. Sports blocked unless verified cross-exchange arb >= 7%.
2. **Pricing bracket** (`check_pricing_bracket`): both YES and NO must be in $0.10-$0.90 range. Blocks
   penny meme markets and near-certain outcomes with no upside.
3. **Volume gate**: 24h volume >= $10,000. Liquidity proxy since CLOB depth check is disabled.
4. **Ground-truth mismatch** (`check_ground_truth_mismatch`): >= 7% mismatch vs Kalshi/PredictIt/CME
   FedWatch implied probability. Fails open if no reference data available.
5. **CLOB liquidity check**: DISABLED. Polymarket's CLOB API returns $0.001-$0.999 spreads on every
   token regardless of actual liquidity, making spread/depth checks useless (blocked 100% of markets).
   Volume gate serves as liquidity proxy. Function kept intact for future use.

Pass rate: ~22% of Polymarket markets (110/500 tested). Pricing bracket blocks the most (347 penny/meme),
category blocks sports (29), volume blocks illiquid (14).

Prediction resolver (`scoring/resolver.py`): two-tier resolution system:
1. **Settlement-based** (authoritative): queries Polymarket CLOB settlement API (`closed=True`,
   `tokens[].winner=True/False`). Takes priority when market has settled.
2. **Price-drift** (fast feedback): if YES price moves >=15pp from entry, resolve as WIN/LOSS
   without waiting for settlement. After 30 days, threshold relaxes to 10pp so old signals
   don't stay PENDING indefinitely. Constants: `PREDICTION_DRIFT_THRESHOLD = 0.15`,
   `PREDICTION_AGED_DRIFT_THRESHOLD = 0.10`, `PREDICTION_AGED_DAYS = 30`.

Constants: `MAX_PREDICTION_SIGNALS_PER_DAY = 10`, `PREDICTION_CANDIDATE_LIMIT = 30`,
`ADAPTIVE_HAIKU_BASE_THRESHOLD = 64`, `ADAPTIVE_HAIKU_TIGHT_THRESHOLD = 80`.

**Risk engine profile mismatch bug (fixed July 21 2026):** `score_setup()` always checked
`DEFAULT_PROFILE` (`50k_prop_moderate`) for the final go/no-go, but prediction markets are
`PROP_EXCLUDED` — `50k_prop_moderate`'s allocation is always suppressed ("Prop firms do not
support prediction contracts"). Every prediction signal was silently converted to HOLD/0 at
write time. Fix: use `retail_standard` as the effective profile for prop-excluded asset classes.
Also fixed confidence gate to check `("YES", "NO")` in addition to `("BUY", "SELL")`.
Diagnostics: added `prediction_signals` section to `/pipeline-check` with counts, win rate,
and recent signal detail.

# NEWSLETTER & BRIEFING (July 2026 overhaul)
Newsletter shifted from stock-heavy finance recap to a **full world morning brief**:

**Coverage scope** — stories can span any domain based on what's newsworthy:
- Crypto markets (primary focus, 1-2 stories per issue)
- Prediction markets (Polymarket probabilities as narrative anchors)
- Geopolitics/diplomacy (wars, sanctions, trade policy, energy)
- AI/tech (model releases, product launches, industry moves)
- Health/science (pandemics, FDA, breakthroughs, climate)
- Sports/culture (championships, records, cultural moments)
- US domestic (Fed, inflation, jobs, policy, Supreme Court)

**Prediction markets integration:**
- `_fetch_prediction_markets()` queries top Polymarket markets by volume, deduplicates, filters
  sports, joins AI signals from the `signals` table
- Prediction data passed to Claude prompt as structured section with YES probabilities, volume, signals
- Stored in `content_json.predictions` for frontend access

**Weekend edition** — newsletter generates and sends 7 days/week (not just weekdays). Weekend editions
get a lighter prompt: 3-4 stories instead of 4-5, lean into crypto (24/7), prediction markets, sports,
world events. More relaxed tone.

**Elite briefing** — `_get_prediction_highlights()` fetches top 5 prediction markets globally (not
per-watchlist), included in every subscriber's AI summary prompt.

# NEWS FEED INFRASTRUCTURE (July 2026)
All RSS feeds — zero API cost. Scheduled at 6:45am ET before newsletter generation at 7am.

| Module | Sources | Identifier | Schedule |
|--------|---------|-----------|----------|
| `ingestion/news.py` | Finnhub API | `market` | Weekdays |
| `ingestion/crypto_news.py` | CoinDesk, Decrypt, The Block | `CRYPTO_GENERAL` | With crypto ingestion |
| `ingestion/tech_news.py` | TechCrunch, Ars Technica, The Verge (AI-filtered) | `AI` | Weekdays |
| `ingestion/geopolitics_news.py` | Al Jazeera, Defense News | `GEOPOLITICS` | Weekdays |
| `ingestion/sports_news.py` | ESPN, BBC Sport | `SPORTS` | Daily (7d/week) |
| `ingestion/health_science_news.py` | NPR Health, STAT News | `HEALTH_SCIENCE` | Daily (7d/week) |
| `ingestion/world_news.py` | BBC World, NPR, NYT World | `WORLD` | Daily (7d/week) |

**Cross-feed dedup** — `rss_utils.py` queries existing `news_items` headlines before inserting.
Same story from two feeds won't produce duplicate rows.

**Feed health monitor** — `check_feed_health()` runs daily at 8am ET. Checks which RSS sources have
zero articles in the last 72 hours. Sends email alert listing dead feeds. Available via
`POST /run-job/check_feed_health`.

**Trusted sources** (`ingestion/trusted_sources.py`): whitelist of ~40 vetted outlets. New feeds must
be added here before they'll be ingested.

# POST-LAUNCH UPGRADE CHECKLIST (trigger: 10 paying users, not free signups)
Everything below is currently on a free/cheapest tier to keep costs at zero pre-revenue. Once there are
10 real paying subscribers, revisit each of these — the free-tier constraints (rate limits, delayed data,
volume caps) stop being acceptable at that point.

- [x] **Supabase**: already on a paid plan — no action needed.
- [ ] **Alpaca**: upgrade from IEX feed (free, used everywhere via `feed: "iex"` in `alpaca_client.py`) to
      a paid SIP/real-time market data plan — IEX is a single exchange's view, not the full consolidated tape.
- [~] **Finnhub**: moving to the $5/mo hobby tier independently of the 10-user trigger (currently free).
      Used for news (`ingestion/news.py`) and as a fallback for congressional/insider trades. NOTE: unverified
      whether the $5 tier actually includes congressional/insider trading data — Finnhub's own pricing page
      wasn't reachable to confirm, and other sources suggest that data may sit behind a pricier tier. Double
      check before assuming Finnhub alone replaces the need for the Senate PTR scraper.
- [ ] **Sentry**: upgrade from free error-tracking tier — already hit quota once during this session
      (blocked debugging a production incident); free tier's volume cap is too low for a live app.
- [ ] **Claude/Anthropic**: upgrade personal Claude Code plan to Max for faster/more capable usage on this
      project. (Separate from the app's own `ANTHROPIC_API_KEY` scoring costs, which are already
      pay-as-you-go and scale with usage automatically — no action needed there.)
- [ ] **Congressional trades data source**: swap the self-built Senate PTR scraper (free stopgap, built
      because Lambda Finance/QuiverQuant/FMP all gate this behind $30-79/mo) for a paid API — more reliable
      than a scraper we maintain ourselves, worth the cost once there's revenue. (Confirm first whether the
      Finnhub $5 tier above already covers this — see note.)
- [ ] **Resend**: low priority — too early to be anywhere near the free-tier volume cap. Revisit once
      subscriber count actually approaches it, not just at the 10-paying-user mark.
- [ ] **Railway**: confirm/upgrade to a paid compute tier if still on a hobby-level plan — more reliability
      headroom as scheduled jobs and traffic grow.
- [x] **Kalshi (predictive markets)**: staying disabled by policy, not a tier issue and not a debugging
      backlog item — Kalshi is a CFTC-regulated exchange and not a fit for this platform, so the RSA-PSS
      signing bug is not being pursued further. Polymarket (Gamma API) carries prediction markets alone
      going forward; no re-enable planned.
- [x] **Dedicated Polymarket-style predictions tab**: built (July 2026). Browse/discovery tab at
      `/dashboard/predictions` showing ALL ingested Polymarket markets (up to 150 active) with big
      probability numbers, sparklines (from `prediction_price_history` table, 48h rolling window),
      category chips, volume badges, and AI signal badges overlaid on scored markets. Category filter
      tabs, search, and sort. Added to sidebar and mobile bottom nav for all tiers.
- [ ] **Polymarket WebSocket feed (v2)**: Replace 30-min Gamma API polling with Polymarket's real-time
      WebSocket feed (RTDS) for live-updating probabilities on the predictions tab. Free (no API cost),
      but significant engineering + maintenance overhead. **Trigger: paying users actively using the
      predictions tab** (check analytics — if median session time on `/dashboard/predictions` is >2 min,
      users care about freshness).

      **Implementation (1-2 sessions):**
      - Connect to Polymarket RTDS WebSocket for price tick stream
      - Write incoming ticks to `prediction_price_history` and update `raw_prices.metadata.yes_price`
      - Auto-reconnect with exponential backoff (disconnects, heartbeats, Railway container restarts)
      - Health monitor: detect stale connections that look alive but stopped sending data
      - Keep Gamma API polling as fallback (if WS is down >5 min, poll catches up)
      - Frontend: swap Supabase query on page load to Supabase Realtime subscription for live updates

      **Ongoing maintenance:**
      - Monitor reconnection frequency in logs — if Railway recycles containers often, the WS will
        churn. May need a dedicated long-lived worker service separate from the Flask scheduler.
      - Memory leak watch on long-lived connections
      - Polymarket can change their WS protocol without notice (undocumented API) — may break

      **What it enables:**
      - Predictions tab feels like a live trading terminal (sub-second price updates)
      - Momentum context in scoring prompt uses real-time data instead of 30-min snapshots
      - Better expiry fade detection (near-close markets reprice fast, polling misses it)
      - Trade modal (#9) shows live prices instead of potentially stale quotes

# POLYMARKET SMART MONEY, TRADING INTELLIGENCE & NON-CUSTODIAL EXECUTION (must-have, target: July 24 2026)

Ten features that add wallet intelligence, strategy refinement, cross-platform data, and
non-custodial Polymarket trading to the prediction markets pipeline. Inspired by open-source
Polymarket trading tools; implemented as native features within Plebs, not external bots.
Zero ongoing API cost — all data sources are free/public.

**Product thesis:** Signal → conviction → execution in one interface. Users currently see
"AI YES 78%" and have to context-switch to Polymarket to act on it. With non-custodial
trading, the signal and the trade are one click apart. Smart money data (#1-3) enriches
the trade modal so users aren't just trading on AI alone — they see what the best wallets
are doing alongside the AI recommendation.

**Critical path:** Three independent Day 1 roots: #1 (wallet profiling, backend), #5
(cross-platform ground truth, backend), and #8 (wallet connection, frontend/web3). The main
chain is #1 → #2 → #3, which merges with #8 at #7 (unified frontend: smart money UI + trade
modal). #9 and #10 extend trading after wallet connection is live. #4 and #6 slot in anywhere.

## Feature #1: Wallet Profiling (`ingestion/polymarket_wallets.py`)
**Priority: HIGHEST — foundation for #2, #3, #7**
**Sessions: 3-4 | Cost: $0/month**

Scrape trading history for top Polymarket wallets, compute per-wallet stats (PnL, win rate, ROI,
avg size, category specialization), store in a `wallet_profiles` table.

### Data source
Polymarket CLOB API `GET /trades` supports filtering by `maker` (wallet address). No auth required.
Rate limits undocumented — use 1-2 req/sec with exponential backoff on 429s.

### Wallet discovery
Seed from existing `whale_alerts` table — extract unique wallet addresses from trades already
captured by `whale_sentinel.py`. The CLOB `/trades` endpoint returns `maker` and `taker` addresses
on each trade. Currently `whale_sentinel.py` does NOT store wallet addresses (only `tx_hash`,
`asset_id`, `market_title`). **Step 1 is extending whale_sentinel to capture `maker`/`taker`.**

### DB schema (migration `015_wallet_profiles.sql`)
```sql
CREATE TABLE wallet_profiles (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    address         text NOT NULL UNIQUE,
    display_name    text,              -- optional human label
    total_trades    integer DEFAULT 0,
    total_volume_usd numeric(14,2) DEFAULT 0,
    realized_pnl_usd numeric(14,2) DEFAULT 0,
    win_rate        numeric(5,4),       -- 0.0000-1.0000
    avg_trade_size  numeric(12,2),
    top_categories  jsonb DEFAULT '[]', -- [{category, count, win_rate}]
    first_seen_at   timestamptz,
    last_active_at  timestamptz,
    stats_updated_at timestamptz DEFAULT now(),
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_wallet_profiles_pnl ON wallet_profiles (realized_pnl_usd DESC);
CREATE INDEX idx_wallet_profiles_win_rate ON wallet_profiles (win_rate DESC)
    WHERE total_trades >= 20;

-- Trade-level history for pattern analysis (#6)
CREATE TABLE wallet_trades (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    wallet_address  text NOT NULL REFERENCES wallet_profiles(address),
    condition_id    text NOT NULL,
    market_title    text,
    direction       text,              -- YES/NO
    price           numeric(8,4),
    size            numeric(14,4),
    usd_value       numeric(14,2),
    tx_hash         text UNIQUE,
    traded_at       timestamptz,
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_wallet_trades_wallet ON wallet_trades (wallet_address, traded_at DESC);
CREATE INDEX idx_wallet_trades_market ON wallet_trades (condition_id, traded_at DESC);

-- RLS + grants (follow the rls_auto_enable pattern, but explicit here)
ALTER TABLE wallet_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_trades ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON wallet_profiles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON wallet_trades TO service_role;
GRANT SELECT ON wallet_profiles TO authenticated;
GRANT SELECT ON wallet_trades TO authenticated;
```

### Implementation plan
**File: `apps/data-service/ingestion/polymarket_wallets.py`**

1. `discover_wallets()` — query `whale_alerts` for distinct wallet addresses (requires
   whale_sentinel extension first), deduplicate, insert into `wallet_profiles` with address only.
2. `backfill_wallet_history(address)` — paginate CLOB `/trades?maker={address}` (100 per page),
   store in `wallet_trades`, deduplicate by `tx_hash`.
3. `compute_wallet_stats(address)` — aggregate `wallet_trades` for the wallet: total trades,
   volume, PnL (requires matching against settlement outcomes from `signals` or CLOB settlement
   API), win rate, avg size, top categories (join market titles against `infer_category()`).
4. `ingest_wallet_profiles()` — orchestrator: discover new wallets, backfill any with
   `stats_updated_at` older than 24h, recompute stats. Return summary string.

**Scheduler registration:**
- Job: `job_ingest_wallet_profiles` — daily at 4:00 AM ET (off-peak, before any scoring)
- Manual trigger: add to `job_map` as `"ingest_wallet_profiles"`
- Initial backfill: run manually via `POST /run-job/ingest_wallet_profiles` — first run will
  take longer (hours) as it paginates history for all discovered wallets. Subsequent runs
  are incremental (only new trades since last check).

**whale_sentinel.py changes:**
- Add `maker_address` and `taker_address` columns to whale alert inserts (CLOB `/trades`
  already returns these fields — they're just not being captured today).
- Migration: `ALTER TABLE whale_alerts ADD COLUMN maker_address text, ADD COLUMN taker_address text;`
  (or include in `015_wallet_profiles.sql`).

### Risk & mitigations
- **CLOB API reliability**: the CLOB's `/book` endpoint returned garbage data (reason CLOB
  liquidity check is disabled). The `/trades` endpoint may be more reliable since it returns
  historical facts, not live state — but test with a single wallet first before building the
  full pipeline. If `/trades` is also unreliable, fall back to Polygonscan/Dune Analytics
  on-chain queries (free tier, slower).
- **Rate limiting**: start at 1 req/sec. If 429s appear, back off to 0.5 req/sec. The initial
  backfill for ~50-100 wallets with ~500 trades each is ~500 requests — at 1/sec that's
  ~8 minutes, very manageable.
- **PnL computation**: requires knowing whether a position was ultimately profitable. Two
  approaches: (a) match `wallet_trades` against CLOB settlement API outcomes (same API the
  resolver uses), or (b) compute from trade pairs (buy at X, sell at Y). Approach (a) is
  simpler and uses existing code.

---

## Feature #2: Smart Money Consensus Signal (`scoring/smart_money.py`)
**Priority: HIGHEST — the actual alpha**
**Sessions: 2 | Cost: $0/month | Depends on: #1**

For each market being scored, compute what the best wallets are doing — a weighted consensus
metric passed to Claude as a new context section in the prediction scoring prompt.

### Implementation plan
**File: `apps/data-service/scoring/smart_money.py`**

1. `get_smart_money_consensus(condition_id) -> dict | None`
   - Query `wallet_profiles` for wallets with `win_rate >= 0.55` AND `total_trades >= 20`
     AND `realized_pnl_usd > 0` (profitable, experienced wallets).
   - Query `wallet_trades` for those wallets' recent trades on this `condition_id`
     (last 72 hours).
   - Compute weighted consensus: each wallet's position (YES/NO) weighted by their
     `realized_pnl_usd` (richer wallets = more weight). Return:
     ```python
     {
         "consensus_direction": "YES" | "NO" | "SPLIT",
         "consensus_strength": 0.0-1.0,  # 1.0 = all smart money on same side
         "wallet_count": 5,
         "total_volume_usd": 45000,
         "top_wallet_pnl": 120000,  # best wallet's PnL for credibility
         "breakdown": {"YES": 3, "NO": 2},
     }
     ```
   - Return `None` if fewer than 2 qualifying wallets have traded this market (insufficient signal).

2. **Scoring prompt integration** — modify `score_prediction_markets()` in `engine.py`:
   - After guardrail pass, before Haiku prescreen, call `get_smart_money_consensus(condition_id)`.
   - If consensus data exists, append to the market context passed to both Haiku and Sonnet:
     ```
     SMART MONEY: 5 top wallets (>55% win rate, >$10K PnL) — 3 YES / 2 NO,
     consensus 65% YES, $45K total volume. Top wallet: $120K cumulative PnL.
     ```
   - ~50-80 extra tokens per market — negligible cost impact.

3. **Prompt update** — add guidance to `prompts/prediction_markets.py`:
   - Smart money consensus is a supporting factor, not a primary signal.
   - Strong consensus (>80%, 5+ wallets) with matching model conviction = conviction boost.
   - Strong consensus opposing model view = flag for extra scrutiny, do not auto-override.
   - Absence of smart money data = neutral (no penalty).

### New deterministic gate (optional, evaluate after 2 weeks of data)
**Smart money contradiction gate**: if smart money consensus is >80% on one side and the model
wants to signal the opposite side, downgrade to HOLD. Only enable after confirming smart money
consensus has predictive value from the forward-tracked signals. NOT an initial launch gate —
add it as an evidence-gate-style annotation first (`[Smart money aligned]` / `[Smart money
opposing]`), then promote to a hard gate if the data supports it.

---

## Feature #3: Whale Alert Enhancement (`scoring/whale_sentinel.py`)
**Priority: MEDIUM-HIGH**
**Sessions: 1-2 | Cost: $0/month | Depends on: #1**

Upgrade whale_sentinel from a passive log to an active signal input by detecting whale clusters
and enriching with wallet profile data.

### Implementation plan
**Changes to `scoring/whale_sentinel.py`:**

1. **Wallet enrichment** — after `_parse_whale_trades()`, join each whale trade against
   `wallet_profiles` to attach win rate and PnL to the alert row. New columns on `whale_alerts`:
   `maker_win_rate numeric(5,4)`, `maker_pnl_usd numeric(14,2)`.

2. **Cluster detection** — new function `detect_whale_clusters()`:
   - Query `whale_alerts` for the last 4 hours, grouped by `condition_id` + `outcome`.
   - A "cluster" = 3+ whale trades on the same side of the same market within 4 hours.
   - Store clusters in a new `whale_clusters` table or as a Supabase view:
     ```sql
     CREATE VIEW whale_clusters AS
     SELECT
         asset_id,
         market_title,
         outcome,
         count(*) as whale_count,
         sum(usd_value) as total_usd,
         avg(maker_win_rate) as avg_whale_win_rate,
         max(created_at) as latest_trade
     FROM whale_alerts
     WHERE created_at > now() - interval '4 hours'
         AND maker_win_rate IS NOT NULL
     GROUP BY asset_id, market_title, outcome
     HAVING count(*) >= 3;
     ```

3. **Scoring integration** — pass whale cluster data alongside smart money consensus in the
   prediction scoring prompt:
   ```
   WHALE ACTIVITY: 4 whale trades (>$5K each) on YES side in last 4h,
   total $82K, avg whale win rate 62%.
   ```

4. **Scheduler**: `detect_whale_clusters()` runs inline with `ingest_whale_alerts()` (every 5 min)
   — the view is live, no separate job needed.

---

## Feature #4: Strategy Catalog Mining (research + implementation) — COMPLETE
**Status: DONE (July 24 2026)**

Researched CloddsBot (github.com/alsk1992/CloddsBot) — 4 core strategies in
`src/strategies/crypto-hft/strategies.ts` targeting Polymarket crypto binary options,
plus HFT divergence and copy-trading systems. Extracted 5 patterns, implemented 4.

### Research findings & implementation status

1. **Penny Clipper** — CloddsBot operates at $0.08 floor (vs our original $0.10). Our
   `MIN_ENTRY_PRICE` was already lowered to $0.08 in a previous session. CloddsBot also
   checks for oscillating/mean-reverting behavior (3+ reversals in 30s) before penny-clipping.
   **Status: Already aligned** — our $0.08 floor matches. Oscillation filter not applicable
   (we poll every 30 min, not sub-second).

2. **Expiry Fade** — markets within 48h of close with skewed pricing get priority boost.
   CloddsBot: activate within 300s of expiry, min $0.15 skew from midpoint, calm-spot filter.
   **Status: Already implemented** — `_prediction_candidate_score()` in `engine.py` boosts
   near-expiry markets (1.5x for skew >= 10pp, 2x for <=6h, 1.3x for <=24h). Calm-spot filter
   implicit in our 24h momentum check — markets with large recent moves already get flagged.

3. **Momentum / Binance-Polymarket latency** — CloddsBot uses sub-second spot-vs-prediction
   divergence. Not applicable at our 30-min polling cadence, but the confidence formula is
   portable: `min(1, |spot_move| / 0.30) * 0.7 + freshness * 0.3`.
   **Status: Already implemented** — `_get_prediction_momentum()` in `engine.py` computes 24h
   YES price delta from `prediction_price_history`, passed to Claude as `PRICE MOMENTUM` context.

4. **Copy-Trading / Smart Money thresholds** — CloddsBot: min $1K trade size, 55% category win
   rate after 5+ trades, max 2% slippage, $500 max position.
   **Status: Already aligned** — `smart_money.py` uses `MIN_WIN_RATE = 0.55`, `MIN_TRADES = 20`
   (more conservative than CloddsBot's 5). Risk controls in `risk.ts` enforce $500 max position.

5. **Ratchet Resolution (Position Management)** — CloddsBot's 9-level exit hierarchy includes a
   progressive giveback table where confirmed highs lock in partial gains. Key insight: once
   peak reaches a trigger level, don't let the position round-trip to a loss.
   **Status: Implemented** — `resolver.py` now has ratchet constants:
   `PREDICTION_RATCHET_TRIGGER = 0.20` (20pp peak favorable drift),
   `PREDICTION_RATCHET_FLOOR = 0.15` (15pp WIN floor after trigger hit).
   Uses `prediction_price_history` to compute peak since signal entry.
   Tagged as "ratchet" in logs to track separately from standard "price-drift" resolutions.

### CloddsBot thresholds reference (for future use)
- Quarter-Kelly sizing: `edge * confidence * 0.25`, max 25% of bankroll
- Drawdown scaling: halve size at 15% drawdown
- Win-streak boost: 1.25x after 3 consecutive wins
- Copy delay: 5s (anti-front-running)
- Depth collapse exit: order book depth drops 60%+ while price declining → exit immediately
- Stale profit exit: best bid unchanged 7+ seconds while in profit → exit

---

## Feature #5: Cross-Platform Ground Truth (`ingestion/prediction_reference.py`)
**Priority: MEDIUM**
**Sessions: 2-3 | Cost: $0/month | Depends on: nothing**

Improve `check_ground_truth_mismatch()` in `prediction_filters.py`, which currently fails open
100% of the time because no reference data is ever populated. Add Metaculus, Manifold Markets,
and (optionally) PredictIt as reference probability sources.

### Data sources (all free, public, no auth)
1. **Metaculus API** — `https://www.metaculus.com/api2/questions/` — returns community median
   probability. Good for politics, science, geopolitics. JSON API, no auth.
2. **Manifold Markets API** — `https://api.manifold.markets/v0/markets` — returns probability
   based on automated market maker. Good for tech, crypto, politics. JSON API, no auth.
3. **PredictIt** — `https://www.predictit.org/api/marketdata/all/` — returns YES/NO prices.
   Politics-focused. JSON API, no auth. May sunset — check availability.

### The hard problem: market matching
Matching "Will Biden run in 2028?" on Polymarket to the equivalent question on Metaculus is
fuzzy text matching. Approaches, in order of reliability:

1. **Embedding similarity** — use a small embedding model to encode market titles, cosine
   similarity > 0.85 = probable match. Could use Haiku for this (~$0.001/comparison) or a
   free local model if available.
2. **Keyword extraction + overlap** — extract named entities and key terms, compute Jaccard
   similarity. Free, no API cost, less accurate.
3. **Manual mapping table** — for the ~30 markets that actually get scored, maintain a mapping
   of Polymarket condition_id → Metaculus question_id. Highest accuracy, doesn't scale, but
   at 30 markets it's fine.
4. **Hybrid** — start with keyword overlap for automated discovery, confirm with Haiku for
   borderline cases, build manual mapping for high-volume markets.

**Recommendation**: Start with approach 3 (manual mapping) for the MVP — you only score 30
markets per run, so a manually curated mapping table of ~50-100 cross-platform pairs covers
the most important markets. Automate with approach 4 later.

### DB schema (add to `015_wallet_profiles.sql` or separate `016_cross_platform.sql`)
```sql
CREATE TABLE prediction_cross_platform (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    polymarket_condition_id text NOT NULL,
    platform        text NOT NULL,      -- 'metaculus', 'manifold', 'predictit'
    external_id     text NOT NULL,      -- platform-specific question/market ID
    external_prob   numeric(5,4),       -- 0.0000-1.0000
    external_volume numeric(14,2),
    last_fetched_at timestamptz DEFAULT now(),
    created_at      timestamptz DEFAULT now(),
    UNIQUE (polymarket_condition_id, platform)
);

CREATE INDEX idx_cross_platform_lookup
    ON prediction_cross_platform (polymarket_condition_id);
```

### Implementation plan
**File: `apps/data-service/ingestion/prediction_reference.py`**

1. `fetch_metaculus_probabilities()` — paginate Metaculus API for open questions, store in
   `prediction_cross_platform`.
2. `fetch_manifold_probabilities()` — same pattern for Manifold Markets.
3. `match_to_polymarket(external_title, external_id, platform)` — fuzzy match against
   `raw_prices` prediction markets. Start with keyword overlap, graduate to embeddings.
4. `ingest_prediction_references()` — orchestrator, runs all sources, matches, stores.

**Scheduler**: daily at 5:00 AM ET (before ingestion + scoring windows).
**Manual trigger**: `POST /run-job/ingest_prediction_references`.

**Guardrail integration** — modify `check_ground_truth_mismatch()` in `prediction_filters.py`:
- Query `prediction_cross_platform` for the market's `condition_id`.
- Compare Polymarket YES price against each platform's probability.
- If any platform shows >= 7% mismatch, return `(True, "verified edge")`.
- If all platforms agree within 7%, return `(False, "insufficient edge")`.
- If no cross-platform data, continue failing open (current behavior).

---

## Feature #6: Trader Behavior Patterns (`analysis/wallet_patterns.py`)
**Priority: LOW-MEDIUM**
**Sessions: 2 | Cost: $0/month | Depends on: #1**

Beyond raw wallet stats, detect behavioral patterns in `wallet_trades` data: momentum fading,
dip buying, scale-in/out, time-of-day preferences, category specialization.

### Implementation plan
**File: `apps/data-service/analysis/wallet_patterns.py`**

All analysis is deterministic (no Claude API cost). Compute from `wallet_trades` table:

1. **Trading style classification** — for each wallet in `wallet_profiles`:
   - `momentum_trader`: >60% of trades follow 24h price direction
   - `contrarian`: >60% of trades oppose 24h price direction
   - `scalper`: avg hold time < 4 hours
   - `swing_trader`: avg hold time > 48 hours
   - `category_specialist`: >70% of trades in one category

2. **Timing patterns**:
   - Preferred trading hours (UTC buckets)
   - Day-of-week distribution
   - Trades-before-expiry pattern (do they trade close to market close?)

3. **Position sizing patterns**:
   - Fixed size vs. conviction-scaled (variance in trade sizes)
   - Avg size by category
   - Size vs. outcome correlation (do bigger bets win more?)

4. Store computed patterns in `wallet_profiles.trading_patterns jsonb` column (add via ALTER).

### How this feeds the scoring pipeline
- The `trading_style` classification enriches the smart money consensus (#2):
  ```
  SMART MONEY: 5 wallets — 3 YES (2 momentum traders, 1 contrarian) / 2 NO (both swing traders)
  ```
- Contrarian wallets opposing momentum wallets on the same market = interesting signal.
- Category specialists' opinions weighted higher for markets in their specialty.

### Not a launch priority
This is a "nice to have" refinement on top of #1-2. Build it after #1-2 are live and
generating data. The wallet_trades table needs at least 2 weeks of data before pattern
analysis is meaningful.

---

## Feature #7: Frontend — Smart Money UI + Trade Modal (unified)
**Priority: HIGH (convergence point for intelligence + execution)**
**Sessions: 3-4 | Cost: $0/month | Depends on: #1, #2, #3, #8**

Single frontend pass: smart money badges, whale indicators, AND the trade modal on
PredictionCard. Building these together avoids touching the same components twice.

### PredictionCard.tsx changes

1. Extend `PredictionMarket` type:
   ```typescript
   smart_money?: {
       consensus_direction: "YES" | "NO" | "SPLIT";
       consensus_strength: number;   // 0-1
       wallet_count: number;
       total_volume_usd: number;
   } | null;
   whale_activity?: {
       whale_count: number;
       total_usd: number;
       direction: "YES" | "NO" | "MIXED";
   } | null;
   ```

2. **Smart money badge** — display below the AI signal badge when `smart_money` is present
   and `consensus_strength >= 0.6`:
   - Color: blue theme (distinct from green AI signal)
   - Format: `SMART MONEY: 73% YES (5 wallets)`
   - Only show when wallet_count >= 3 (below that it's not meaningful)

3. **Whale activity indicator** — subtle icon + tooltip when `whale_activity` is present:
   - Small whale icon with USD volume
   - Tooltip: "4 whale trades ($82K) on YES in last 4h"

4. **Trade button** — appears when wallet is connected (#8). Opens trade modal (see below).

### Trade modal (`components/predictions/TradeModal.tsx`)
Full-context trade dialog showing everything the user needs to decide and execute:
```
┌─────────────────────────────────────────────┐
│ Buy YES — "Will Fed cut rates in Sept?"     │
│                                             │
│ AI Signal: YES 78% confidence               │
│ Smart Money: 5 wallets — 4 YES / 1 NO      │
│ Whale Activity: $82K on YES in last 4h      │
│                                             │
│ Current YES price:  $0.43                   │
│ Implied edge:       35pp vs AI conviction   │
│                                             │
│ Amount:  [____] USDC                        │
│ Type:    ○ Market  ○ Limit                  │
│ Price:   [____] (limit only)                │
│                                             │
│ Est. payout:  $X.XX if YES resolves         │
│ Max loss:     $X.XX (your cost basis)       │
│                                             │
│        [ Cancel ]    [ Confirm Trade ]      │
└─────────────────────────────────────────────┘
```

The trade modal calls the CLOB API via the user's EIP-712 derived credentials (#8).
All signing happens client-side — Plebs backend never touches the user's wallet.

### predictions/page.tsx changes
1. **New sort option**: `{ value: "smart_money", label: "Smart Money" }` — sort by
   `consensus_strength * wallet_count` descending.
2. **New stat in stats row**: "Smart Money Active" — count of markets with smart money data.
3. **Data fetching**: add a 4th Supabase query for smart money data. Use pre-computed
   `prediction_smart_money` table populated during scoring (approach b — faster reads).
4. **Wallet connection status** — show connected wallet address + USDC balance in header
   when wallet is connected. "Connect Wallet" button when not.

---

## Feature #8: Wallet Connection & CLOB Auth
**Priority: HIGH — Day 1 parallel start (frontend/web3, no backend dependencies)**
**Sessions: 2-3 | Cost: $0/month**

Connect the user's Polygon wallet and derive Polymarket CLOB API credentials. This is the
foundation for all trading features (#9, #10) and feeds user context back to the intelligence
features (user's own wallet address for personalized stats).

### Architecture
Plebs is a **non-custodial interface**. The user's wallet (MetaMask, WalletConnect, Coinbase
Wallet, etc.) holds their funds. Polymarket's smart contracts on Polygon hold collateral when
trading. Plebs is the UI layer — it never touches private keys or holds funds.

### Implementation plan

**New dependencies** (`apps/web/package.json`):
```
wagmi ^2.x          — React hooks for Ethereum wallet connection
viem ^2.x           — TypeScript Ethereum library (wagmi's transport layer)
@rainbow-me/rainbowkit ^2.x  — polished wallet connection modal (optional, can use wagmi's
                                built-in connectors instead for a lighter bundle)
```

**wagmi config** (`apps/web/src/lib/wagmi.ts`):
```typescript
import { createConfig, http } from "wagmi";
import { polygon } from "wagmi/chains";

export const wagmiConfig = createConfig({
    chains: [polygon],
    transports: { [polygon.id]: http() },  // uses public Polygon RPC by default
    connectors: [
        injected(),           // MetaMask, Brave, etc.
        walletConnect({ projectId: "..." }),  // WalletConnect v2
        coinbaseWallet({ appName: "Plebs" }),
    ],
});
```

**CLOB credential derivation** (`apps/web/src/lib/polymarket/auth.ts`):
- Polymarket uses EIP-712 typed data signatures to derive API credentials.
- Flow: user connects wallet → Plebs prompts a signature (no transaction, no gas) →
  signature is sent to CLOB API to get an API key + secret bound to that wallet address.
- The CLOB credentials are stored in memory (session-only) or encrypted in localStorage.
- The backend NEVER sees these credentials — all CLOB API calls happen from the browser.

**Wallet context provider** (`apps/web/src/providers/WalletProvider.tsx`):
- Wraps the app with wagmi's `WagmiProvider` + `QueryClientProvider`.
- Provides `useAccount()`, `useBalance()`, `useSignTypedData()` hooks to child components.
- Add to `apps/web/src/app/layout.tsx` (wrap existing providers).

**USDC balance display**:
- Query USDC balance on Polygon for the connected wallet address.
- USDC on Polygon: contract `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` (bridged USDC).
- Show in predictions page header and trade modal.

### What this unlocks
- **Trade modal** (#7): the "Confirm Trade" button calls CLOB `POST /order` with the
  user's credentials. Signing happens in the browser via the wallet extension.
- **User's own stats**: connected wallet address can be looked up in `wallet_profiles`
  to show "Your stats: 23 trades, 68% win rate, $4.2K volume" — personalization for free.
- **Position tracking** (#10): query CLOB API for the user's open positions.

### Risk & mitigations
- **Public Polygon RPC reliability**: the default public RPC is fine for balance queries
  and read calls. If it becomes flaky, add Alchemy/Infura free tier as fallback
  (both offer 100M+ compute units/month free — more than enough).
- **CLOB credential security**: credentials derived from wallet signature should be
  session-scoped (cleared on tab close). Never persist API secrets in plain localStorage.
  Consider encrypting with the wallet's public key or using `sessionStorage`.
- **wagmi bundle size**: wagmi + viem add ~100-150KB gzipped. Acceptable for a trading app.
  If needed, code-split and lazy-load the wallet provider only on predictions pages.

---

## Feature #9: Order Placement via CLOB API
**Priority: HIGH**
**Sessions: 3-4 | Cost: $0/month | Depends on: #8**

Place limit and market orders on Polymarket through the CLOB API using the user's
wallet-derived credentials. All execution happens client-side — Plebs is the interface.

### Polymarket CLOB order flow
1. User selects YES/NO and amount in the trade modal (#7).
2. Frontend builds an order object: `{tokenID, price, size, side, feeRateBps, nonce, expiration}`.
3. Order is signed with the user's wallet (EIP-712 typed data).
4. Signed order is submitted to CLOB `POST /order`.
5. CLOB matches it against the order book. If limit order, it sits until filled or cancelled.

### Implementation plan

**CLOB client** (`apps/web/src/lib/polymarket/clob.ts`):
```typescript
export class PolymarketCLOB {
    constructor(private apiKey: string, private apiSecret: string, private funder: string) {}

    async createOrder(params: {
        tokenId: string;
        side: "BUY" | "SELL";
        price: number;      // 0-1
        size: number;        // in outcome tokens
        orderType: "GTC" | "FOK" | "GTD";
    }): Promise<OrderResult> { ... }

    async cancelOrder(orderId: string): Promise<void> { ... }
    async cancelAll(): Promise<void> { ... }
    async getOpenOrders(): Promise<Order[]> { ... }
    async getTradeHistory(limit?: number): Promise<Trade[]> { ... }
}
```

**Token ID resolution**: Polymarket markets have two tokens (YES and NO), each with a unique
`clobTokenId`. These are available from the Gamma API response we already fetch — add
`clobTokenIds` to the `raw_prices.metadata` field during ingestion in `prediction_markets.py`.
Migration: no schema change needed, just store additional fields in the existing JSONB metadata.

**Risk controls** (`apps/web/src/lib/polymarket/risk.ts`):
- **Max position size**: configurable per-user cap (default: $500 per market). Enforced
  client-side before order submission.
- **Slippage protection**: for market orders, estimate fill price from order book depth
  (query CLOB `/book`). Warn if slippage > 2%.
- **Confirmation dialog**: always require explicit confirmation. No one-click trading on
  first use — add a "skip confirmation" toggle after 5+ successful trades.
- **Daily loss limit**: track cumulative daily loss in sessionStorage. Warn at $100, hard
  block at $500 (configurable). Reset at midnight UTC.

**Order status tracking**: after placing an order, poll CLOB `GET /orders?id=...` every 5s
for fill status. Show real-time status in a toast/notification: "Order placed → Partially
filled (40/100) → Filled". Use `setInterval` with cleanup, not WebSocket (simpler, and
order status changes aren't high-frequency).

### Monetization opportunity
Consider a small spread markup on orders placed through Plebs (0.5-1% on top of CLOB price).
This is how most non-custodial frontends monetize. Completely transparent — show the markup
in the trade modal. Alternative: subscription-only feature (Elite tier gets trading).

---

## Feature #10: Position Tracking & P&L
**Priority: MEDIUM-HIGH**
**Sessions: 2-3 | Cost: $0/month | Depends on: #8, #9**

Live portfolio view showing the user's open Polymarket positions, unrealized P&L,
trade history, and performance stats.

### Implementation plan

**New page**: `apps/web/src/app/dashboard/positions/page.tsx`
- Query CLOB API for connected wallet's open positions (`GET /positions`).
- For each position: show market title, direction (YES/NO), entry price, current price,
  unrealized P&L, quantity, and time held.
- Color-code by P&L (green/red).
- Allow closing positions directly (creates a SELL order via #9).

**Position data shape** (from CLOB API):
```typescript
type Position = {
    asset_id: string;        // token ID
    condition_id: string;    // links to PredictionMarket
    size: number;
    avg_price: number;
    current_price: number;   // from raw_prices
    unrealized_pnl: number;  // computed
    direction: "YES" | "NO";
    market_title: string;    // joined from metadata
};
```

**Performance stats** (computed client-side from trade history):
- Total realized P&L
- Win rate (settled positions)
- Average hold time
- Best/worst trade
- Performance by category

**Integration with existing Plebs features**:
- The user's Polymarket wallet address feeds into `wallet_profiles` (#1) — if the user
  is a top wallet, their own stats show up in the smart money data.
- Position page can show AI signals for markets where the user has open positions:
  "You're holding YES at $0.43 — AI now says 78% YES" (conviction reinforcement or
  "AI disagrees with your position" warning).

**Supabase integration** (optional, for persistence across sessions):
- Store trade history in a `user_trades` table linked to the user's Supabase profile.
- This lets the user see historical performance even after clearing browser storage.
- Migration: `016_user_trades.sql` with RLS policy `auth.uid() = user_id`.

---

## Dependency Graph (integrated)

```
                     BACKEND (data-service)                          FRONTEND (Next.js/web3)
                     ─────────────────────                          ──────────────────────────

Pass 1:  #1 Wallet Profiling ──────────────────┐                   #8 Wallet Connection ────────┐
         #5 Cross-Platform GT ─────────┐       │                                                │
                                       │       │                                                │
Pass 2:  #2 Smart Money Consensus ◄────┼───────┤                                                │
         #3 Whale Enhancement ◄────────┘       │                                                │
                                               │                                                │
Pass 3:                                        └──────► #7 Smart Money UI + Trade Modal ◄───────┘
                                                                        │
Pass 4:  #4 Strategy Mining ──────────────────────────────►            │
                                                        #9 Order Placement ◄────────────────────┘
                                                                        │
Pass 5:                                                 #10 Position Tracking & P&L
                                                                        │
Deferred: #6 Trader Behavior (needs 2+ weeks of wallet data)
```

## Execution Order (target: July 24 2026)

**Pass 1** (three parallel starts — Day 1):
- #1 Wallet Profiling — whale_sentinel extension → DB migration → ingestion pipeline
- #5 Cross-Platform Ground Truth — Metaculus/Manifold fetchers → market matching → guardrail integration
- #8 Wallet Connection — wagmi/viem setup → wallet provider → CLOB credential derivation

**Pass 2** (depends on #1):
- #2 Smart Money Consensus — scoring prompt integration
- #3 Whale Alert Enhancement — cluster detection + wallet enrichment

**Pass 3** (convergence — depends on #2, #3, #8):
- #7 Frontend: Smart Money UI + Trade Modal (single pass, both features on PredictionCard)

**Pass 4** (depends on #8):
- #9 Order Placement — CLOB order flow, risk controls, order status tracking
- #4 Strategy Catalog Mining — research CloddsBot, implement findings in guardrails + execution

**Pass 5** (depends on #9):
- #10 Position Tracking & P&L — portfolio page, performance stats

**Deferred** (needs 2+ weeks of wallet data):
- #6 Trader Behavior Patterns

## Summary table

| # | Feature | Sessions | Cost | Depends on | Signal value |
|---|---------|----------|------|------------|-------------|
| 1 | Wallet Profiling | 3-4 | $0/mo | — | Foundation |
| 2 | Smart Money Consensus | 2 | $0/mo | #1 | **Highest** — new alpha |
| 3 | Whale Alert Enhancement | 1-2 | $0/mo | #1 | Medium-high |
| 4 | Strategy Catalog Mining | 2-3 | $0/mo | — | Medium |
| 5 | Cross-Platform Ground Truth | 2-3 | $0/mo | — | Medium |
| 6 | Trader Behavior Patterns | 2 | $0/mo | #1 | Low-medium (deferred) |
| 7 | Smart Money UI + Trade Modal | 3-4 | $0/mo | #1-3, #8 | **Highest** — UX convergence |
| 8 | Wallet Connection & CLOB Auth | 2-3 | $0/mo | — | Foundation |
| 9 | Order Placement | 3-4 | $0/mo | #8 | **High** — execution |
| 10 | Position Tracking & P&L | 2-3 | $0/mo | #8, #9 | High — retention |

**Total: ~22-30 sessions. Ongoing cost: $0/month.** All APIs are free/public. New frontend
dependencies (wagmi, viem) are open source. Polygon gas fees for trading are negligible
(fractions of a cent per transaction).

## Verification checklist
- [ ] `POST /run-job/ingest_wallet_profiles` returns wallet count + trade count
- [ ] `wallet_profiles` table has wallets with computed win_rate and PnL
- [ ] `wallet_trades` table populating with historical trades
- [ ] `score_prediction_markets()` includes smart money context in Claude prompt
- [ ] Signal reasoning mentions smart money data when present
- [ ] `whale_alerts` now includes `maker_address` and wallet stats
- [ ] Whale clusters detected and surfaced in scoring prompt
- [ ] `prediction_cross_platform` table populated from Metaculus/Manifold
- [ ] `check_ground_truth_mismatch()` no longer fails open 100% of the time
- [ ] Wallet connects via MetaMask/WalletConnect on predictions page
- [ ] CLOB API credentials derived from wallet signature (no backend involvement)
- [ ] USDC balance displayed for connected wallet
- [ ] Trade modal shows AI signal + smart money + whale activity + order form
- [ ] Limit and market orders execute through CLOB API
- [ ] Order status updates in real-time (polling)
- [ ] Risk controls enforced: max position, slippage warning, daily loss limit
- [ ] Positions page shows open positions with unrealized P&L
- [ ] Trade history with performance stats (win rate, total P&L)
- [ ] PredictionCard shows smart money badge + whale indicator + trade button
- [ ] "Smart Money" sort option works on predictions page
- [x] CloddsBot strategy research documented with findings
- [ ] All new tables have RLS enabled + service_role grants
- [ ] All new scheduler jobs have manual trigger entries in job_map
- [ ] `/pipeline-check` includes smart money and cross-platform diagnostics
