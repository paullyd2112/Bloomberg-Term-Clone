# Plebs.io

Trading intelligence platform for retail traders. Real-time signals across stocks, crypto, and prediction markets — powered by AI.

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

| Tier | Price | Key features |
|---|---|---|
| Free | $0 | 30-min delayed signals, 5 watchlist assets |
| Pro | $50/mo | Real-time everything, unlimited watchlist, briefing email |
| Elite | $99/mo | Pro + Pleby AI analyst |

7-day free trial (credit card required) for Pro and Elite.
