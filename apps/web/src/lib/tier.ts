export type Tier = "free";

export function canAccessFeature(_tier: Tier, _feature: string): boolean {
  return true;
}

export function isPaidTier(_tier: Tier): boolean {
  return true;
}
