# Plebs Open Source Plan

**Branch:** `claude/plebs-open-source-lp36rg`
**Status:** Commercialization stripped (committed + pushed). Remaining work below.

---

## DONE (this session)

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

7. **`apps/web/src/lib/tier.ts`** — consider deleting entirely and removing all imports across the codebase, since everything returns true/free now.

### Database (optional, non-breaking)

The Supabase database still has commercial columns and tables. These are harmless (unused code paths were removed) but could be cleaned up:

- `profiles` table columns: `stripe_customer_id`, `stripe_subscription_id`, `tier` (check constraint), `billing_interval`, `trial_ends_at`, `referral_code`, `referred_by`
- Tables: `referrals`, `redemption_codes`
- `get_dashboard_signals()` function in `001_initial_schema.sql` has tier-based signal delay logic

**Recommendation:** Leave the DB alone for now — migrations are additive and these columns don't hurt anything. Clean up later if desired.

---

## REMAINING — Open Source Assets

### 1. MIT LICENSE file (root of repo)

Create `LICENSE` with standard MIT text. Copyright holder: "Plebs.Finance contributors" or your name.

### 2. README.md rewrite

Current README is likely minimal or product-focused. Rewrite for open source:

- What Plebs is (1 paragraph)
- Screenshot or demo link
- Tech stack (Next.js, Python, Supabase, Anthropic Claude)
- Self-hosting guide:
  - Required env vars (list them all — Supabase, Anthropic, Alpaca, Resend, etc.)
  - `apps/web/` setup (npm install, next dev)
  - `apps/data-service/` setup (pip install, python main.py)
  - Supabase project setup (run migrations)
- Architecture overview (monorepo structure, data flow)
- Contributing guidelines (basic)
- License (MIT)

### 3. CLAUDE.md cleanup

Current CLAUDE.md has ~800 lines of internal project history, launch checklists, debugging notes, and planned features. For open source:

- Keep the architecture sections (scoring engine, risk engine, newsletter, news feeds)
- Remove personal debugging history and launch checklist items
- Remove hardcoded Railway URL
- Remove references to personal API keys/billing
- Trim the Polymarket trading features roadmap (or move to a ROADMAP.md)

### 4. Remove hardcoded personal references

Grep for and remove/generalize:
- `paul@plebs.finance` — in welcome_emails.py FROM_ADDRESS
- `support@plebs.finance` — in privacy/terms pages (this one's fine to keep as a project email)
- Any hardcoded Railway URLs
- Check for any API keys accidentally committed (unlikely but verify)

### 5. .env.example file

Create `apps/web/.env.example` and `apps/data-service/.env.example` listing all required env vars with placeholder values and comments.

### 6. Make the GitHub repo public

This is the final step — flip the repo visibility on GitHub settings after everything above is done.

---

## Execution Order for Next Session

1. Fix the 7 small code cleanup items above
2. Delete `apps/web/src/lib/tier.ts` and remove all imports
3. Create MIT `LICENSE` file
4. Create `.env.example` files
5. Rewrite `README.md`
6. Clean up `CLAUDE.md`
7. Generalize personal references (FROM_ADDRESS, etc.)
8. Commit, push
9. (Manual) Make repo public on GitHub
