@AGENTS.md

# DATA SERVICE
- **Railway URL**: `https://bloomberg-term-clone-production.up.railway.app`

# LAUNCH CHECKLIST
- [x] `ENABLE_SCHEDULER=true` set in Railway env vars — scheduler is on
- [x] Anthropic API credits loaded
- [x] All required API keys set in Railway env vars
- [x] Data sources are Alpaca-first (stocks, crypto, options) — news sources and predictive markets are the only non-Alpaca sources
- [ ] Confirm Railway is deploying from `main` branch
- [ ] Predictive markets: ingestion exists but zero rows in production (`raw_prices`/`signals`) — likely missing/invalid `KALSHI_API_KEY`/`KALSHI_PRIVATE_KEY`; needs diagnosis before counting this feature as live
- [ ] Options flow: just migrated from yfinance to Alpaca snapshots — not yet run in production or covered by the backtest (backtest only scores `stock`/`crypto`); smoke-test before launch or defer the feature for v1

# POST-LAUNCH UPGRADE CHECKLIST (trigger: 10 paying users, not free signups)
Everything below is currently on a free/cheapest tier to keep costs at zero pre-revenue. Once there are
10 real paying subscribers, revisit each of these — the free-tier constraints (rate limits, delayed data,
volume caps) stop being acceptable at that point.

- [ ] **Alpaca**: upgrade from IEX feed (free, used everywhere via `feed: "iex"` in `alpaca_client.py`) to
      a paid SIP/real-time market data plan — IEX is a single exchange's view, not the full consolidated tape.
- [ ] **Finnhub**: upgrade from free tier — currently used for news (`ingestion/news.py`) and as a fallback
      for congressional/insider trades, both of which are premium-gated on the free plan.
- [ ] **Sentry**: upgrade from free error-tracking tier — already hit quota once during this session
      (blocked debugging a production incident); free tier's volume cap is too low for a live app.
- [ ] **Claude/Anthropic**: upgrade personal Claude Code plan to Max for faster/more capable usage on this
      project. (Separate from the app's own `ANTHROPIC_API_KEY` scoring costs, which are already
      pay-as-you-go and scale with usage automatically — no action needed there.)
- [ ] **Congressional trades data source**: swap the self-built Senate PTR scraper (free stopgap, built
      because Lambda Finance/QuiverQuant/FMP all gate this behind $30-79/mo) for a paid API — more reliable
      than a scraper we maintain ourselves, worth the cost once there's revenue.
- [ ] **Supabase**: upgrade from free tier to Pro — more DB storage, daily backups, better performance
      guarantees as real user data volume grows.
- [ ] **Resend**: upgrade sending tier — free tier has a monthly send-volume cap that a real subscriber
      base will hit.
- [ ] **Railway**: confirm/upgrade to a paid compute tier if still on a hobby-level plan — more reliability
      headroom as scheduled jobs and traffic grow.
- [ ] **Kalshi (predictive markets)**: once credentials are sorted and the feature is actually live, check
      whether Kalshi's API has its own tier considerations at higher request volume.
