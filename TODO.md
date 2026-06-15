# Pre-launch checklist

## Before going live

- [ ] Set `PLAYWRIGHT_BASE_URL` in GitHub repo variables (Settings → Variables → Actions) to the Vercel deployment URL
- [ ] Re-add `push` trigger to `.github/workflows/e2e.yml` so E2E runs on every push to `main`:
  ```yaml
  on:
    push:
      branches: ["main"]
    pull_request:
      branches: ["main"]
  ```
  (Removed temporarily to stop notification spam during development)

## API keys to add at deploy time

### Vercel environment variables
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_PRICE_MONTHLY` (Pro monthly $40)
- `STRIPE_PRICE_QUARTERLY` (Pro quarterly $108)
- `STRIPE_PRICE_ELITE_MONTHLY` (Elite monthly $80)
- `STRIPE_PRICE_ELITE_QUARTERLY` (Elite quarterly $216)
- `STRIPE_PRICE_LIFETIME` (Lifetime Pro $399 — one-time)
- `STRIPE_PRICE_LIFETIME_ELITE` (Lifetime Elite $649 — one-time)
- `ANTHROPIC_API_KEY`
- `ADMIN_EMAILS` (comma-separated list of admin email addresses)
- `NEXT_PUBLIC_APP_URL` (https://plebs.finance)

### Railway environment variables (data-service)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`
- `RESEND_API_KEY`
- `QUIVER_API_KEY` (congressional trades — get free tier at quiverquant.com)
- `BINANCE_API_KEY` (optional — public endpoints work without it)
- `BINANCE_API_SECRET` (optional)
- `SENTRY_DSN` (optional — error monitoring)

## Post-launch (after 30+ days of live data)
- [ ] Backtesting — internal script only, not user-facing. Pull historical yfinance + Polymarket data, apply signal logic, output win rate / avg return / Sharpe ratio. Use stats on landing page and in pitch decks. Sidebar link already removed.

## Remaining prompts
- [ ] Prompt 31: Pricing / AppSumo
- [ ] Prompt 32: Pleby AI agent
