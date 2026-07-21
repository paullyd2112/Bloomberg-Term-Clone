export type Tier = "free" | "pro" | "elite";

export const TRIAL_DAYS = 14;

export const WATCHLIST_LIMIT: Record<Tier, number> = {
  free:  0,
  pro:   Infinity,
  elite: Infinity,
};

export const FREE_TIER_SIGNAL_LIMIT = 3;
export const FREE_TIER_DELAY_HOURS = 4;

export const TIER_FEATURES: Record<Tier, string[]> = {
  free: [
    "3 delayed signals per day (4h delay)",
    "Weekly Monday newsletter recap",
    "Dashboard access (view-only)",
    "Track record & accuracy stats",
  ],
  pro: [
    "Unlimited real-time AI signals",
    "Customisable signal screener",
    "Unlimited watchlist",
    "Whale alert tracker",
    "Congressional trade tracker",
    "Daily morning briefing email",
    "Portfolio tracker + P&L",
    "Performance analytics + equity curve",
    "Push + Telegram + email alerts",
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

type Feature = "pleby" | "portfolio" | "alerts" | "real_time" | "on_demand_scoring" | "screener" | "performance" | "trade" | "signals_full";

export function canAccessFeature(tier: Tier, feature: Feature): boolean {
  if (feature === "pleby")               return tier === "elite";
  if (feature === "on_demand_scoring")   return tier === "elite";
  if (feature === "portfolio")           return tier === "pro" || tier === "elite";
  if (feature === "alerts")              return tier === "pro" || tier === "elite";
  if (feature === "real_time")           return tier === "pro" || tier === "elite";
  if (feature === "screener")            return tier === "pro" || tier === "elite";
  if (feature === "performance")         return tier === "pro" || tier === "elite";
  if (feature === "trade")               return tier === "pro" || tier === "elite";
  if (feature === "signals_full")        return tier === "pro" || tier === "elite";
  return false;
}

export function isPaidTier(tier: Tier): boolean {
  return tier === "pro" || tier === "elite";
}

export function applyFreeDelay(signals: { created_at: string }[]): typeof signals {
  const cutoff = new Date(Date.now() - FREE_TIER_DELAY_HOURS * 60 * 60 * 1000).toISOString();
  return signals.filter((s) => s.created_at <= cutoff);
}

export function applyFreeLimit<T>(signals: T[]): T[] {
  return signals.slice(0, FREE_TIER_SIGNAL_LIMIT);
}
