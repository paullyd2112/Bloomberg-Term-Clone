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
- [x] **Backtest status:** executed on Sonnet 5, crypto-only (13 coins), conviction floor 60%,
      date range 2026-03-01 to 2026-07-21.
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

1. **Confidence gate** (`risk_engine.CONFIDENCE_MINIMUM = 60`): BUY/SELL below 60% → HOLD
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
- CORE_CRYPTO (BTC, ETH, SOL, XRP, ADA): scored directly with Sonnet (always high-signal)
- TIER1_CRYPTO (48 coins): Haiku prescreen filters ~70-80%, only 65+ confidence escalates
- Lower-tier coins: only scored if >5% daily move (`CRYPTO_MOVER_THRESHOLD = 5.0`)
- Stock prescreen: core 9 tickers always Sonnet, rest Haiku-first

## Key constants
- `ENGINE_CUTOFF = "2026-07-04T11:00:00Z"` — signals before this are unreliable (data bugs)
- `SIGNAL_COOLDOWN_H = 4` — skip if signal generated within 4 hours
- `CRYPTO_SIGNAL_COOLDOWN_H = 1` — shorter cooldown for 24/7 crypto markets
- `MAX_STOCK_SIGNALS_PER_DAY = 3` — hard cap on stock signals per calendar day
- `CRYPTO_SOFT_CAP = 6` — after 6 signals/day, confidence threshold escalates (70%+ for 7-10, 80%+ for 11-15)
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
- `analysis/claude_backtest.py` — backtesting engine (Sonnet 5, crypto-only by default, conviction floor 60%)

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
- Crypto scoring: every 2h (12x/day) — CORE_CRYPTO (BTC, ETH, SOL, XRP, ADA) scored directly,
  TIER1_CRYPTO (48 coins) prescreened with Haiku first, lower-tier coins only if >5% daily move
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
to crypto-only default (13 coins: 5 CORE + 8 TIER1), conviction floor 60%, date range 2026-03-01 to
2026-07-21, 6 sample dates post-indicator-fix.

**Cost impact (crypto-only, Sonnet 5 introductory pricing through Aug 31 2026):**
- Introductory: $2/M input, $10/M output (vs Sonnet 4.6 standard $3/$15)
- Sonnet 5 tokenizer produces ~1.0-1.35x more tokens for same content
- Net effect: roughly break-even to slightly cheaper than Sonnet 4.6 during intro period
- Estimated daily cost: ~$0.15-0.30/day (~$6-12/month) for crypto+predictions+briefings+newsletter
- After intro period (post Aug 31): $3/$15 (same as Sonnet 4.6 was), so no cost increase

**Two-stage scoring pipeline (cost optimization):**
- CORE_CRYPTO (BTC, ETH, SOL, XRP, ADA): scored directly with Sonnet 5 (always high-signal)
- TIER1_CRYPTO (48 coins): Haiku prescreen (~$0.001/call) filters ~70-80%, only 65+ confidence
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

Prediction resolver (`scoring/resolver.py`): settlement-based, queries Polymarket CLOB settlement API
(`closed=True`, `tokens[].winner=True/False`). Verified working against real settled markets. No code
changes needed — distinct from price-based stock/crypto resolution.

Constants: `MAX_PREDICTION_SIGNALS_PER_DAY = 10`, `PREDICTION_CANDIDATE_LIMIT = 30`,
`ADAPTIVE_HAIKU_BASE_THRESHOLD = 65`, `ADAPTIVE_HAIKU_TIGHT_THRESHOLD = 80`.

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
- [ ] **Polymarket WebSocket feed (v2)**: Polymarket offers a real-time WebSocket feed (RTDS) for live
      order book and price updates. Current v1 uses 30-min Gamma API polling which is fine for discovery,
      but live-updating probabilities would make the predictions tab feel more alive. Not needed at
      launch; add once user engagement with the tab justifies the connection management complexity.
