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
