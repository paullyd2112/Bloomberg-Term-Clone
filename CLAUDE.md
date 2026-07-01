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
- [x] Options flow: Alpaca snapshots migration confirmed working in production (3,303 rows/run, 0 errors). Backtest still only scores `stock`/`crypto` — no historical win-rate validation for options-driven signals before they reach paying users.
- [x] Corporate actions (splits/dividends/spinoffs/mergers): feature confirmed working end-to-end — ingestion, field mapping (`ca_type` normalized to singular to match the dashboard), and DB permissions all verified live.
- [x] Table permissions audit: the "RLS policy exists, base `GRANT` missing" bug above showed up on 4 tables total (`newsletter_sends`, `corporate_actions`, `push_subscriptions`, `on_demand_scoring_log`), all created via ad-hoc migrations outside whatever path granted the other ~20 tables their defaults automatically. Audited every table in the project and fixed all 4. Going forward, pair every new RLS policy with an explicit `GRANT` — Postgres won't warn you if you don't.
- [ ] Predictive markets: still 0 rows in production. Ruled out the "missing credentials" theory (keys confirmed present) and fixed a deprecated Kalshi base URL plus a pagination bug that could hang the job forever — none of that fixed the underlying zero-rows issue. Root cause narrowed but not found; likely a live Kalshi auth/signing failure and/or Polymarket hitting the wrong API (`clob.polymarket.com` vs. the Gamma API, which may be the correct one for bulk market listing). Needs Railway log access or another diagnostic pass before counting this feature as live.
- [ ] Congressional trades / insider trades: 0 rows, always — not just recently. Table permissions are fine (checked, not the grants bug), so the Senate Stock Watcher → Finnhub → FMP / SEC EDGAR ingestion chain itself has never once succeeded in production. Not yet investigated.
- [ ] `send_elite_briefings` isn't wired into `/run-job/`'s manual-trigger map, so it can't be smoke-tested on demand — only fires on its 7:20am ET cron. One elite subscriber with a watchlist exists, so it's testable once wired up.
- [ ] Web UI: everything verified this session was backend/DB-level. No browser click-testing done on the new corporate actions dashboard card, push-notification subscribe/unsubscribe flow, or on-demand scoring flow.
