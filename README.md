# Plebs.io

Trading intelligence platform for retail traders. AI signals across stocks, crypto, and prediction markets, refreshed throughout the trading day — plus live prices.

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, TypeScript, Tailwind CSS |
| Backend | Python 3.11, APScheduler, Pandas-TA |
| Database | Supabase (Postgres + Auth + RLS) |
| AI | Claude via Instructor (structured output) |
| Payments | Stripe |
| Hosting | Vercel (web) + Railway (data service) |

## Monorepo Structure

```
apps/
├── web/              # Next.js 14 frontend
└── data-service/     # Python ingestion + scoring service
supabase/
└── migrations/       # SQL migrations
```

## Setup

### Web app
```bash
cd apps/web
cp .env.local.example .env.local
npm install
npm run dev
```

### Data service
```bash
cd apps/data-service
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python scheduler.py
```

### Supabase
Apply migrations in order via Supabase CLI or dashboard.

## Tiers

There is no free-standing plan — "free" in the schema means expired trial /
cancelled subscription, not a usable tier (0 watchlist assets, no alerts, no
portfolio, no performance page). Signup goes straight to Stripe checkout
before any dashboard access.

| Tier | Price | Key features |
|---|---|---|
| Pro | $40/mo ($100/quarter, $299 lifetime) | AI signals (refreshed throughout the day), unlimited watchlist, options flow, congressional trades, briefing email |
| Elite | $80/mo ($200/quarter, $399 lifetime) | Pro + prediction markets + Pleby AI analyst |

14-day free trial (credit card required, monthly plans only) for Pro and Elite.
Quarterly, annual, and lifetime plans start billing immediately, no trial.
