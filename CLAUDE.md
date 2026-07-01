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
- [x] Table permissions audit: the "RLS policy exists, base `GRANT` missing" bug above showed up on 4 tables total (`newsletter_sends`, `corporate_actions`, `push_subscriptions`, `on_demand_scoring_log`), all created via ad-hoc migrations outside whatever path granted the other ~20 tables their defaults automatically. Audited every table in the project and fixed all 4. Also found and closed the root mechanism: an `rls_auto_enable()` event trigger was already auto-enabling RLS on every new table but never auto-granting privileges — extended it to also grant `service_role` full CRUD on table creation, so this whole bug class can't recur. Separately found and fixed a real IDOR: `get_dashboard_signals(p_user_id, ...)` was a `SECURITY DEFINER` function publicly callable with no `auth.uid()` check — revoked public execute (nothing in the codebase called it).
- [ ] Predictive markets: still 0 rows in production. Ruled out the "missing credentials" theory (keys confirmed present) and fixed a deprecated Kalshi base URL plus a pagination bug that could hang the job forever — none of that fixed the underlying zero-rows issue. Root cause narrowed but not found; likely a live Kalshi auth/signing failure and/or Polymarket hitting the wrong API (`clob.polymarket.com` vs. the Gamma API, which may be the correct one for bulk market listing). Needs Railway log access or another diagnostic pass before counting this feature as live.
- [ ] Congressional trades / insider trades: Senate Stock Watcher's feed was dead (stale since ~Dec 2020) — replaced with a direct `efdsearch.senate.gov` scraper (#35). First live run came back `efd(0)` with no visibility into why (bootstrap failure vs. search-format mismatch vs. genuinely zero PTRs) — adding better diagnostics before the next attempt. Insider trades (separate source chain, SEC EDGAR/Finnhub/FMP) still untouched.
- [ ] `send_elite_briefings` isn't wired into `/run-job/`'s manual-trigger map, so it can't be smoke-tested on demand — only fires on its 7:20am ET cron. One elite subscriber with a watchlist exists, so it's testable once wired up.
- [ ] Web UI: everything verified this session was backend/DB-level. No browser click-testing done on the new corporate actions dashboard card, push-notification subscribe/unsubscribe flow, or on-demand scoring flow.

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
- [ ] **Kalshi (predictive markets)**: once credentials are sorted and the feature is actually live, check
      whether Kalshi's API has its own tier considerations at higher request volume.
