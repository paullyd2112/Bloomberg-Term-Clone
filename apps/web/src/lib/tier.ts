export type Tier = "free" | "pro" | "elite";

export const TRIAL_DAYS = 7;

export const WATCHLIST_LIMIT: Record<Tier, number> = {
  free:  0,
  pro:   Infinity,
  elite: Infinity,
};

// free tier is not a marketed plan — it's the expired/unsubscribed state
export const TIER_FEATURES: Record<"pro" | "elite", string[]> = {
  pro: [
    "Real-time signals — stocks, crypto & predictions",
    "Unlimited watchlist",
    "Full options flow + dark pool",
    "Morning briefing email (8:45am ET)",
    "Portfolio tracker",
    "Price & signal alerts",
    "Congressional trades tracker",
    "Per-asset AI accuracy tracking",
  ],
  elite: [
    "Everything in Pro",
    "Pleby — your AI trading analyst",
    "Ask Pleby about any asset anytime",
    "Personalised morning briefing",
    "Priority signal delivery",
  ],
};

export function canAccessFeature(tier: Tier, feature: "pleby" | "portfolio" | "alerts" | "real_time"): boolean {
  if (feature === "pleby")     return tier === "elite";
  if (feature === "portfolio") return tier === "pro" || tier === "elite";
  if (feature === "alerts")    return tier === "pro" || tier === "elite";
  if (feature === "real_time") return tier === "pro" || tier === "elite";
  return false;
}

export function isPaidTier(tier: Tier): boolean {
  return tier === "pro" || tier === "elite";
}
