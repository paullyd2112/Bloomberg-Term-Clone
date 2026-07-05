@AGENTS.md

# DATA SERVICE
- **Railway URL**: `https://bloomberg-term-clone-production.up.railway.app`

# LAUNCH CHECKLIST
- [x] `ENABLE_SCHEDULER=true` set in Railway env vars — scheduler is on
- [x] Anthropic API credits loaded
- [x] All required API keys set in Railway env vars — verified live via `/pipeline-check`: `ALPACA_API_KEY`, `ALPACA_API_SECRET`, `ANTHROPIC_API_KEY`, `FMP_API_KEY`, `KALSHI_API_KEY`, `KALSHI_PRIVATE_KEY` all present. `RESEND_API_KEY` confirmed valid (real newsletter sends succeeding). `NEWS_API_KEY` is missing — only silences prediction-markets' per-market news enrichment, not core ingestion.
- [x] Data sources are Alpaca-first (stocks, crypto, options) — news sources and predictive markets are the only non-Alpaca sources
- [ ] Confirm Railway is deploying from `main` branch
- [x] Newsletter: fixed two independent root causes of "newsletter never sent" — `RESEND_API_KEY` was being clobbered every 5 min by the uptime-check job, and `newsletter_sends` (the dedup-tracking table) had a correct RLS policy but no underlying `GRANT`, so writes silently failed. Both fixed; confirmed live with a real send that's now correctly tracked.
- [x] Options flow: Alpaca snapshots migration confirmed working in production (3,303 rows/run, 0 errors). Deliberately not building historical backtesting for it — the existing backtest re-scores continuous OHLCV history, which doesn't apply to event-driven options flow, and there's no historical options-chain data pipeline to backtest against (real separate project, not a launch task). Instead, `/accuracy` now exposes a live `options_flow` breakdown querying `signals` directly for the `"[Options flow] "` reasoning-tagged subset — forward-tracked accuracy through the existing resolver, not a backtest. Confirmed live: 11 signals tracked, currently all `PENDING` (too new to have resolved yet).
- [x] Corporate actions (splits/dividends/spinoffs/mergers): feature confirmed working end-to-end — ingestion, field mapping (`ca_type` normalized to singular to match the dashboard), and DB permissions all verified live.
- [x] Table permissions audit: the "RLS policy exists, base `GRANT` missing" bug above showed up on 4 tables total (`newsletter_sends`, `corporate_actions`, `push_subscriptions`, `on_demand_scoring_log`), all created via ad-hoc migrations outside whatever path granted the other ~20 tables their defaults automatically. Audited every table in the project and fixed all 4. Also found and closed the root mechanism: an `rls_auto_enable()` event trigger was already auto-enabling RLS on every new table but never auto-granting privileges — extended it to also grant `service_role` full CRUD on table creation, so this whole bug class can't recur. Separately found and fixed a real IDOR: `get_dashboard_signals(p_user_id, ...)` was a `SECURITY DEFINER` function publicly callable with no `auth.uid()` check — revoked public execute (nothing in the codebase called it).
- [x] Predictive markets: live via Polymarket, Kalshi deliberately disabled. Kalshi's RSA-PSS signing kept failing with credentials confirmed present and no server-side log access to diagnose further — rather than keep guessing blind, disabled it (`KALSHI_ENABLED = False` in `prediction_markets.py`, code kept intact, one-line flip to re-enable later) and switched Polymarket from the CLOB API (order-book/trading, wrong tool for bulk listing, and was hitting 0 rows) to the Gamma API (public, no auth, the actual market-listing API). Verified live: `2072 raw_prices written (Kalshi: disabled, 2072 Polymarket)`. Spot-checked rows — real markets (2026 World Cup futures, Senate seat count), `yes_price`/`no_price` correctly summing to ~1.0 across every row checked.
- [x] Congressional trades: Senate Stock Watcher's feed was dead (stale since ~Dec 2020) — replaced with a direct `efdsearch.senate.gov` scraper (#35). First live run 403'd on the CSRF agreement POST (missing `Referer`/`Origin` headers); fixed in #36. Re-verified live: `/run-job/ingest_congressional` now returns `54 inserted [efd(73)]` on a cold run and `0 inserted (all duplicates) [efd(71)]` on a repeat, confirming the scraper and dedup both work correctly. Spot-checked 2 rows against capitoltrades.com/Benzinga (McConnell WFC buy, Boozman TLH-family sells) — trade date, report date, and amount range all matched exactly. Data is real but disclosure-lagged (STOCK Act gives 30-45 days to file), so `last_30d` counts will look sparse — that's expected, not a bug. Insider trades (separate source chain, SEC EDGAR/Finnhub/FMP) still untouched.
- [x] `send_elite_briefings` manual smoke test: this was already wired into `/run-job/`'s manual-trigger map by #39 (checklist just hadn't been updated). Verified live via `POST /run-job/send_elite_briefings` → `1 sent, 0 failed, 0 skipped`.
- [ ] Web UI: everything verified this session was backend/DB-level. No browser click-testing done on the new corporate actions dashboard card, push-notification subscribe/unsubscribe flow, or on-demand scoring flow.
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
- [ ] **Backtest status (pre-data-fix numbers, rerun after a week of clean live data):** best run 61.5%
      win rate / profit factor 1.59 / +18.4% sim (202 calls); larger 342-call run regressed to 48.5% /
      0.99 — BUT all these ran against backtest-computed indicators, on prompts whose live inputs were
      broken, so treat them as measuring the prompt, not the product. Crypto was consistently strong
      across both runs (94.1%, 88.9% — small n=17/18, don't oversell). BUY-side edge still unproven
      (31-37% in backtests). ~$5.50 of the $6 backtest budget spent.
- [ ] **Risk management not yet recalibrated:** every portfolio sim tripped its 15% drawdown circuit
      breaker (15.1-16.1% max DD). Position sizing / stop discipline is a separate, unaddressed workstream
      — signal quality fixes alone don't solve it. Prop-firm-style limits would have failed all sims.
- [x] Newsletter generation silent-failure gap: added `_alert_generation_failure()` email alert (mirrors
      the uptime-check pattern) fired from both the Claude-call-failure and DB-write-failure branches of
      `generate_newsletter()`, plus a real regeneration retry (`job_send_newsletter_retry()`) instead of
      the old 7:45am job just re-sending nothing.

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
- [ ] **Kalshi (predictive markets)**: disabled, not a tier issue — its RSA-PSS signing handshake fails with
      credentials confirmed present in Railway. Needs actual debugging (likely requires server-side log
      access this session didn't have) before re-enabling, not just a plan upgrade. Polymarket (Gamma API)
      is carrying prediction markets alone in the meantime.
- [ ] **Dedicated Polymarket-style predictions tab**: the July 5 fix (#68 era) made prediction-market
      signals render correctly, but it reuses the same dense stock/crypto components — it does not look
      like Polymarket (big percentage as focal point, probability sparkline, colored Yes/No buy buttons,
      volume/category chip). Also scope-different from the current signal-only view: this would be a
      browse/discovery tab across ALL live Polymarket markets we ingest (dozens-hundreds), not just the
      subset we've generated an AI signal for — same tier of effort as Congress Tracker was. Not a tier
      upgrade, a real feature build; revisit once past initial launch.
