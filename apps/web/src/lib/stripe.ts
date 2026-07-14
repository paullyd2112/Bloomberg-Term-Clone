import Stripe from "stripe";
import { STRIPE_SECRET_KEY } from "@/lib/env";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(STRIPE_SECRET_KEY(), {
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
  elite_monthly:   { priceEnvKey: "STRIPE_PRICE_ELITE_MONTHLY",   tier: "elite" as const },
  elite_quarterly: { priceEnvKey: "STRIPE_PRICE_ELITE_QUARTERLY", tier: "elite" as const },
  elite_annual:    { priceEnvKey: "STRIPE_PRICE_ELITE_ANNUAL",    tier: "elite" as const },
  lifetime_pro:   { priceEnvKey: "STRIPE_PRICE_LIFETIME",       tier: "pro"   as const },
  lifetime_elite: { priceEnvKey: "STRIPE_PRICE_LIFETIME_ELITE", tier: "elite" as const },
  // Founding plans — same price as monthly, no trial, price-locked forever
  founding_pro:   { priceEnvKey: "STRIPE_PRICE_MONTHLY",       tier: "pro"   as const },
  founding_elite: { priceEnvKey: "STRIPE_PRICE_ELITE_MONTHLY", tier: "elite" as const },
} as const;

export type PlanKey = keyof typeof PLANS;

export function getPriceId(plan: PlanKey): string {
  const val = process.env[PLANS[plan].priceEnvKey];
  if (!val) throw new Error(`Missing env var: ${PLANS[plan].priceEnvKey}`);
  return val;
}

export function getTierForPlan(plan: string): "pro" | "elite" | "free" {
  return (PLANS[plan as PlanKey]?.tier) ?? "free";
}
