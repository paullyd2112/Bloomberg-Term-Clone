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
