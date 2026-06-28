export type Tier = "free" | "pro" | "elite";

export const TRIAL_DAYS = 14;

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

export function canAccessFeature(tier: Tier, feature: "pleby" | "portfolio" | "alerts" | "real_time" | "prediction_markets" | "on_demand_scoring" | "screener" | "performance"): boolean {
  if (feature === "pleby")               return tier === "elite";
  if (feature === "prediction_markets")  return tier === "elite";
  if (feature === "on_demand_scoring")   return tier === "elite";
  if (feature === "portfolio")           return tier === "pro" || tier === "elite";
  if (feature === "alerts")              return tier === "pro" || tier === "elite";
  if (feature === "real_time")           return tier === "pro" || tier === "elite";
  if (feature === "screener")            return tier === "pro" || tier === "elite";
  if (feature === "performance")         return tier === "pro" || tier === "elite";
  return false;
}

export function isPaidTier(tier: Tier): boolean {
  return tier === "pro" || tier === "elite";
}
