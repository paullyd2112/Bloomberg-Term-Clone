import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2026-04-22.dahlia",
      typescript: true,
    });
  }
  return _stripe;
}

export const PLANS = {
  pro_monthly:   { priceEnvKey: "STRIPE_PRICE_MONTHLY",       tier: "pro"   as const },
  pro_quarterly: { priceEnvKey: "STRIPE_PRICE_QUARTERLY",     tier: "pro"   as const },
  pro_annual:    { priceEnvKey: "STRIPE_PRICE_ANNUAL",        tier: "pro"   as const },
  elite_monthly: { priceEnvKey: "STRIPE_PRICE_ELITE_MONTHLY", tier: "elite" as const },
  elite_annual:  { priceEnvKey: "STRIPE_PRICE_ELITE_ANNUAL",  tier: "elite" as const },
  lifetime_pro:   { priceEnvKey: "STRIPE_PRICE_LIFETIME",       tier: "pro"   as const },
  lifetime_elite: { priceEnvKey: "STRIPE_PRICE_LIFETIME_ELITE", tier: "elite" as const },
} as const;

export type PlanKey = keyof typeof PLANS;

export function getPriceId(plan: PlanKey): string {
  return process.env[PLANS[plan].priceEnvKey]!;
}

export function getTierForPlan(plan: string): "pro" | "elite" {
  return (PLANS[plan as PlanKey]?.tier) ?? "pro";
}
