# Plebs Open Source Plan

**Branch:** `claude/plebs-open-source-lp36rg`
**Repo renamed to:** Plebs.Finance (on GitHub)
**Status:** Commercialization stripped (committed + pushed). Remaining work below.

---

## DONE

- Removed Stripe integration (5 API routes, client lib, env vars, package dep)
- Removed tier-gating from all 12+ dashboard pages and 8+ API routes
- Removed upgrade/pricing page, founding member page, referral system
- Removed SkipTrialBanner, SubscribeGate, FreeSignalGate components
- Removed admin tier management
- Updated landing page (no pricing section, updated FAQ)
- Updated privacy policy, terms of service (no Stripe/billing/trial refs)
- Updated auth callback (removed referral code wiring)
- Updated onboarding (no trial language)
- Simplified welcome emails (3-email sequence, no trial conversion email)
- Gutted tier.ts to always return true

---

## REMAINING — Code Cleanup

### Small fixes (< 30 min total)

1. **`apps/web/src/app/page.tsx`** — `homeJsonLd()` function (~line 790) still references a `PLANS` array for structured data offers. The Pricing section was deleted but this JSON-LD function may still reference it. Verify and fix — either remove the offers block or replace with a single free offer.

2. **`apps/web/src/app/page.tsx`** (~line 439) — "Free tier included" copy. Change to "100% free and open source" or similar.

3. **`apps/web/src/app/page.tsx`** (~line 509) — "Priced for retail" copy. Update.

4. **`apps/web/src/app/signal/[id]/page.tsx`** (~line 301) — "Free tier available · No credit card needed" text. Change to "Free and open source".

5. **`apps/web/src/app/api/score-on-demand/route.ts`** (~line 78) — still passes `subscription: tier` to the data service. Remove the `tier` param (data service may ignore it, but clean it up).

6. **`apps/web/src/app/api/watchlist/route.ts`** — still imports `type { Tier }` from `@/lib/tier`. Remove the import if unused.

7. **`apps/web/src/lib/tier.ts`** — delete entirely and remove all imports across the codebase, since everything returns true/free now.

### Database (optional, non-breaking)

The Supabase database still has commercial columns and tables. These are harmless (unused code paths were removed) but could be cleaned up later:

- `profiles` table columns: `stripe_customer_id`, `stripe_subscription_id`, `tier` (check constraint), `billing_interval`, `trial_ends_at`, `referral_code`, `referred_by`
- Tables: `referrals`, `redemption_codes`
- `get_dashboard_signals()` function in `001_initial_schema.sql` has tier-based signal delay logic

**Recommendation:** Leave the DB alone for now — migrations are additive and these columns don't hurt anything.

---

## REMAINING — Open Source Assets

### 1. MIT LICENSE file (root of repo)

Create `LICENSE` with standard MIT text. Copyright holder: "Plebs.Finance contributors" or Paul's name.

### 2. README.md — full rewrite

**Decisions made:**
- Repo renamed to Plebs.Finance on GitHub
- Audience: mix of developers who want to self-host AND portfolio piece
- Document all tools/APIs needed for self-hosting
- Pull screenshots from the landing page (it's live at plebs.finance)
- Call out Supabase dependency prominently (need a project + ~15 migrations)

**The story (use this voice in the README):**
The founder wanted to figure out if there's a way to invest without paying tens of thousands
for tools like a Bloomberg terminal. The conclusion: for stocks, not really — the data costs
are too high. But for crypto and prediction markets, it IS possible. That's what Plebs is.

**README structure:**
- **What is Plebs** — one paragraph with the story above. "A Bloomberg-style terminal for
  crypto and prediction markets, built for retail traders who can't afford a $24K/year terminal."
- **Screenshots** — pull from the live landing page or dashboard
- **What's inside** — list all the tools/features:
  - AI-powered crypto signals (Claude Sonnet 5 scoring engine with deterministic gates)
  - Prediction markets (Polymarket integration with AI-scored YES/NO signals)
  - Daily morning briefing email (world news, crypto, predictions)
  - Portfolio tracker, watchlist, alerts
  - Screener, backtesting engine
  - On-demand AI scoring for any asset
  - Pleby AI chat assistant
  - Congressional trades tracker
- **Tech stack table** — Next.js, Python, Supabase, Claude, Alpaca, Polymarket, Vercel, Railway
- **Self-hosting guide** — detailed, with:
  - **Supabase setup first** (prominent callout: you need a Supabase project, run migrations)
  - Required env vars for both apps (list every single one with comments)
  - `apps/web/` setup
  - `apps/data-service/` setup
  - What each external API is for and whether it's free/paid
- **Architecture overview** — monorepo structure, data flow (ingestion → scoring → signals → frontend)
- **Crypto-only note** — explain stocks are disabled but code is intact, and why
- **Contributing** — basic guidelines
- **License** — MIT
- **Not financial advice** disclaimer

### 3. CLAUDE.md cleanup

- Keep architecture sections (scoring engine, risk engine, newsletter, news feeds)
- Remove personal debugging history and launch checklist items
- Remove hardcoded Railway URL
- Remove references to personal API keys/billing
- Trim the Polymarket trading features roadmap (or move to a ROADMAP.md)

### 4. Remove hardcoded personal references

Grep for and remove/generalize:
- `paul@plebs.finance` — in welcome_emails.py FROM_ADDRESS
- `support@plebs.finance` — in privacy/terms pages (fine to keep as project email)
- Any hardcoded Railway URLs
- Check for any API keys accidentally committed (unlikely but verify)

### 5. .env.example files

Create `apps/web/.env.example` and `apps/data-service/.env.example` listing all required
env vars with placeholder values and comments explaining what each one is for.

### 6. Make the GitHub repo public

Final step — flip visibility on GitHub after everything above is done.

---

## Execution Order for Next Session

1. Fix the 7 small code cleanup items above
2. Delete `apps/web/src/lib/tier.ts` and remove all imports
3. Create MIT `LICENSE` file
4. Create `.env.example` files
5. Rewrite `README.md` (full rewrite per decisions above)
6. Clean up `CLAUDE.md`
7. Generalize personal references (FROM_ADDRESS, etc.)
8. Commit, push
9. (Manual) Make repo public on GitHub
