export type Tier = "free" | "pro" | "elite";

// Self-reported at onboarding (dashboard/settings lets users change it later).
// Drives how much explanation vs. raw density the UI shows by default —
// beginner gets inline plain-English captions, advanced gets fuller reasoning
// text up front, intermediate gets the plain default either way.
export type ExperienceLevel = "beginner" | "intermediate" | "advanced";

export const TRIAL_DAYS = 14;

// Single source of truth for displayed pricing — landing page, upgrade page,
// founding page, and transactional emails all read from this. Keep in sync
// with the actual Stripe price objects (STRIPE_PRICE_* env vars); this file
// doesn't validate against Stripe, it's just where copy should stop drifting
// from what the app (and Stripe) actually charge.
export const PRICING = {
  pro: {
    monthly:   40,
    quarterly: 100,
    lifetime:  299,
  },
  elite: {
    monthly:   80,
    quarterly: 200,
    lifetime:  399,
  },
} as const;

export const WATCHLIST_LIMIT: Record<Tier, number> = {
  free:  0,
  pro:   Infinity,
  elite: Infinity,
};

// free tier is not a marketed plan — it's the expired/unsubscribed state
export const TIER_FEATURES: Record<"pro" | "elite", string[]> = {
  pro: [
    "AI signals — stocks & crypto",
    "Customisable signal screener",
    "Unlimited watchlist",
    "Unusual options flow",
    "Congressional trade tracker",
    "Morning briefing email (7am ET)",
    "Portfolio tracker + P&L",
    "Performance analytics + equity curve",
    "Email alerts when signals fire",
    "Per-asset AI accuracy tracking",
  ],
  elite: [
    "Everything in Pro",
    "On-demand AI analysis — score any ticker instantly",
    "Pleby — AI trading analyst chat",
    "Ask Pleby about any asset anytime",
    "Personalised morning briefing",
  ],
};

export function canAccessFeature(tier: Tier, feature: "pleby" | "portfolio" | "alerts" | "real_time" | "on_demand_scoring" | "screener" | "performance" | "congress"): boolean {
  if (feature === "pleby")               return tier === "elite";
  if (feature === "on_demand_scoring")   return tier === "elite";
  if (feature === "portfolio")           return tier === "pro" || tier === "elite";
  if (feature === "alerts")              return tier === "pro" || tier === "elite";
  if (feature === "real_time")           return tier === "pro" || tier === "elite";
  if (feature === "screener")            return tier === "pro" || tier === "elite";
  if (feature === "performance")         return tier === "pro" || tier === "elite";
  if (feature === "congress")            return tier === "pro" || tier === "elite";
  return false;
}

export function isPaidTier(tier: Tier): boolean {
  return tier === "pro" || tier === "elite";
}
