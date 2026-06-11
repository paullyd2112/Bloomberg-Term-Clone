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
- `STRIPE_PRICE_MONTHLY` (Pro monthly price ID)
- `STRIPE_PRICE_QUARTERLY` (Pro quarterly price ID)
- `STRIPE_PRICE_ANNUAL` (Pro annual price ID)
- `STRIPE_PRICE_ELITE_MONTHLY` (Elite monthly price ID)
- `STRIPE_PRICE_ELITE_ANNUAL` (Elite annual price ID)
- `STRIPE_PRICE_LIFETIME` (Lifetime Pro price ID — one-time $299 charge)
- `ANTHROPIC_API_KEY`
- `ADMIN_EMAILS` (comma-separated list of admin email addresses)

### Railway environment variables (data-service)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`
- `RESEND_API_KEY`
- `QUIVER_API_KEY` (optional — congressional trades only; app works without it)
- `BINANCE_API_KEY` (optional — public endpoints work without it)
- `BINANCE_API_SECRET` (optional)
- `SENTRY_DSN` (optional — error monitoring)

## Remaining prompts
- [ ] Prompt 30: Backtesting
- [ ] Prompt 31: Pricing / AppSumo
- [ ] Prompt 32: Pleby AI agent
