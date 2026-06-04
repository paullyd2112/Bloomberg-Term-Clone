# Plebs.finance — Product Roadmap

---

## Phase 1 — Launch (current)
- [x] Live scrolling price ticker (stocks + crypto)
- [x] AI signal scoring engine
- [x] Pleby AI assistant
- [x] Portfolio allocation engine
- [x] Daily AI-generated newsletter + briefings
- [x] Prediction markets ingestion
- [x] Congressional trades, options flow, short interest
- [x] Stripe billing (Pro + Elite, monthly/annual/quarterly/lifetime)
- [x] Referral system with $50 credit reward
- [x] Watchlist, alerts, backtesting
- [x] Supabase auth + tiered access
- [x] Railway data service (Python scheduler)
- [x] Beehiiv integration (newsletter + briefings) — *pending*

---

## Phase 2 — Community & Social

- **Portfolio sharing** — users can make their allocation public and share a link
- **Trade comments** — comment on signals and trades, react with conviction
- **Stock of the week** — editorially highlighted pick with AI rationale, shown on dashboard
- **Trade of the week** — top-performing signal from the previous week, surfaced prominently
- **Community feed** — see what other Plebs users are watching and acting on (opt-in)
- **Leaderboard** — ranked by backtest win rate or portfolio performance (anonymized option)

---

## Phase 3 — API & Automation

- **API access** — REST API for signals, prices, and portfolio data so users can plug into Alpaca, IBKR, or any broker programmatically
- **Alpaca integration** — direct connect: signal fires → Alpaca executes the trade (user-controlled automation)
- **Strategy builder** — define rules ("if signal confidence > 80% and direction = BUY, buy X shares") without code
- **Paper trading mode** — test automations against live data before committing real money
- **Audit log** — full record of every automated action Pleby takes on a user's behalf

> **Note:** Phase 3 has regulatory considerations (potential RIA/broker-dealer classification depending on framing). Requires legal review, guardrails, kill switches, and likely insurance before shipping. Target when revenue supports proper compliance infrastructure.

---

## Backlog / Future

- Mobile app (React Native)
- Earnings call transcript analysis
- Insider trading alerts (Form 4 filings)
- Options chain visualizer
- Dark pool flow
- Kalshi + Polymarket deeper integration
