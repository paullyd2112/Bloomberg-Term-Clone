# Plebs.finance Launch Checklist

## 1. Stripe (Payment Processing)

### In Stripe Dashboard (dashboard.stripe.com)
- [ ] Create products and prices:
  - **Pro Monthly** — $40/mo recurring
  - **Pro Quarterly** — price TBD, recurring
  - **Pro Annual** — price TBD, recurring
  - **Elite Monthly** — $80/mo recurring
  - **Elite Quarterly** — price TBD, recurring
  - **Elite Annual** — price TBD, recurring
  - **Lifetime Pro** — one-time payment, price TBD
  - **Lifetime Elite** — one-time payment, price TBD
- [ ] Copy each price ID (starts with `price_...`)
- [ ] Set up webhook endpoint:
  - URL: `https://plebs.finance/api/stripe/webhook`
  - Events to listen for:
    - `checkout.session.completed`
    - `customer.subscription.created`
    - `customer.subscription.updated`
    - `customer.subscription.deleted`
    - `invoice.payment_failed`
- [ ] Copy the webhook signing secret (starts with `whsec_...`)

### In Vercel Environment Variables
- [ ] `STRIPE_SECRET_KEY` — your Stripe secret key (`sk_live_...`)
- [ ] `STRIPE_WEBHOOK_SECRET` — webhook signing secret (`whsec_...`)
- [ ] `STRIPE_PRICE_MONTHLY` — Pro monthly price ID
- [ ] `STRIPE_PRICE_QUARTERLY` — Pro quarterly price ID
- [ ] `STRIPE_PRICE_ANNUAL` — Pro annual price ID
- [ ] `STRIPE_PRICE_ELITE_MONTHLY` — Elite monthly price ID
- [ ] `STRIPE_PRICE_ELITE_QUARTERLY` — Elite quarterly price ID
- [ ] `STRIPE_PRICE_ELITE_ANNUAL` — Elite annual price ID
- [ ] `STRIPE_PRICE_LIFETIME` — Lifetime Pro price ID
- [ ] `STRIPE_PRICE_LIFETIME_ELITE` — Lifetime Elite price ID

---

## 2. Vercel Environment Variables

### Already set (verify these exist)
- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `NEXT_PUBLIC_APP_URL` — should be `https://plebs.finance`

### Need to add
- [ ] All Stripe vars (see above)
- [ ] `ANTHROPIC_API_KEY` — for Pleby chat
- [ ] `FMP_API_KEY` — for live stock price fallback on landing page
- [ ] `ADMIN_EMAILS` — `paulsolomonaqua@gmail.com`
- [ ] `VAPID_PUBLIC_KEY` — for web push (generate with `npx web-push generate-vapid-keys`)
- [ ] `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — same public key, exposed to client
- [ ] `UPSTASH_REDIS_REST_URL` — for distributed rate limiting (recommended)
- [ ] `UPSTASH_REDIS_REST_TOKEN` — for distributed rate limiting (recommended)
- [ ] `RESEND_API_KEY` — for transactional emails (briefings, alerts, welcome)

### Optional
- [ ] `COINGECKO_API_KEY` — improves crypto price reliability
- [ ] `BEEHIIV_API_KEY` — when ready for Beehiiv newsletter integration

---

## 3. Railway (Data Service)

### Environment Variables
- [ ] `ENABLE_SCHEDULER=true` — **THIS STARTS EVERYTHING**
- [ ] `SUPABASE_URL`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `ANTHROPIC_API_KEY`
- [ ] `FMP_API_KEY` — stock data
- [ ] `ALPHA_VANTAGE_API_KEY` — additional stock data
- [ ] `FINNHUB_API_KEY` — news + options flow
- [ ] `FRED_API_KEY` — macro indicators (get free at fred.stlouisfed.org)
- [ ] `RESEND_API_KEY` — for newsletter + briefing emails
- [ ] `VAPID_PRIVATE_KEY` — for sending web push notifications
- [ ] `VAPID_PUBLIC_KEY` — must match the one in Vercel
- [ ] `VAPID_SUBJECT` — `mailto:support@plebs.finance`
- [ ] `NEXT_PUBLIC_APP_URL` — `https://plebs.finance` (used for links in emails)
- [ ] `ALERT_EMAIL` — your email for uptime alerts

### Verify
- [ ] Data service does NOT have a public Railway domain (security — use private networking)
- [ ] Deploy is set to `main` branch

---

## 4. Supabase

- [ ] Verify RLS is enabled on all tables
- [ ] Verify auth providers are configured (email + any OAuth you want)
- [ ] Verify email templates are customized (confirmation, password reset)
- [ ] Check that `profiles` table has a trigger to auto-create on signup

---

## 5. Domain / DNS

- [ ] `plebs.finance` pointing to Vercel
- [ ] `www.plebs.finance` redirecting to `plebs.finance`
- [ ] SSL certificate active (Vercel handles this automatically)

---

## 6. Beehiiv (Newsletter — can set up after launch)

- [ ] Create Beehiiv publication
- [ ] Set up RSS feed for Substack cross-posting
- [ ] Get API key and add to Vercel as `BEEHIIV_API_KEY`
- [ ] Connect custom sending domain if desired

---

## 7. Pre-Launch Smoke Test

After all env vars are set:
- [ ] Sign up with a test email
- [ ] Verify onboarding flow works
- [ ] Go to upgrade page, start a Pro subscription (use Stripe test mode first)
- [ ] Verify webhook fires and tier updates to "pro" in your profile
- [ ] Check that signals appear on the dashboard
- [ ] Check that the ticker bar shows all prices (stocks + crypto)
- [ ] Check that the clock ticks on the landing page signal feed
- [ ] Send a test alert and verify web push notification arrives
- [ ] Cancel the test subscription and verify tier reverts to "free"
- [ ] Test on mobile (Safari + Chrome)

---

## 8. Go Live

- [ ] Switch Stripe from test mode to live mode
- [ ] Update all Stripe env vars to live keys (both Vercel + Railway)
- [ ] Update webhook endpoint to use live signing secret
- [ ] Set `ENABLE_SCHEDULER=true` on Railway
- [ ] Redeploy data service
- [ ] Hard refresh plebs.finance and verify everything works
- [ ] Post on Reddit
