export type Tier = "free" | "pro" | "elite";

export const SIGNAL_DELAY_MINUTES = 30;

export const WATCHLIST_LIMIT: Record<Tier, number> = {
  free:  5,
  pro:   Infinity,
  elite: Infinity,
};

export const TIER_FEATURES: Record<Tier, string[]> = {
  free: [
    "Signals with 30-minute delay",
    "5-asset watchlist",
    "Basic market overview",
    "Congressional trades tracker",
    "Public signal history",
  ],
  pro: [
    "Real-time signals — all markets",
    "Unlimited watchlist",
    "Full options flow + dark pool",
    "Morning briefing email",
    "Portfolio tracker",
    "Alerts & notifications",
    "Cross-market correlation",
    "Per-asset AI accuracy tracking",
  ],
  elite: [
    "Everything in Pro",
    "Pleby — your AI trading analyst",
    "Ask Pleby about any asset anytime",
    "Pleby morning briefing personalisation",
    "Priority signal delivery",
  ],
};

export function getSignalDelayFilter(tier: Tier) {
  if (tier === "free") {
    const cutoff = new Date(Date.now() - SIGNAL_DELAY_MINUTES * 60 * 1000);
    return cutoff.toISOString();
  }
  return null; // no delay for pro/elite
}

export function canAccessFeature(tier: Tier, feature: "pleby" | "portfolio" | "alerts" | "real_time"): boolean {
  if (feature === "pleby")     return tier === "elite";
  if (feature === "portfolio") return tier === "pro" || tier === "elite";
  if (feature === "alerts")    return tier === "pro" || tier === "elite";
  if (feature === "real_time") return tier === "pro" || tier === "elite";
  return false;
}
