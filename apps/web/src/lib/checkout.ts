import { z } from "zod";
import { getStripe, getPriceId, type PlanKey } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";

export const PlanParam = z.enum([
  "pro_monthly", "pro_quarterly", "pro_annual",
  "elite_monthly", "elite_quarterly", "elite_annual",
  "lifetime_pro", "lifetime_elite", "founding_pro", "founding_elite",
]);

export type CheckoutResult =
  | { url: string }
  | { error: string; status: number };

/**
 * Creates (or reuses) a Stripe customer for this user and opens a Checkout
 * session for the given plan. Shared between the authenticated /api/stripe/checkout
 * endpoint and the post-signup redirect in /auth/callback, so both paths stay
 * in sync on trial eligibility, upgrade handling, and success/cancel routing.
 */
export async function createCheckoutSession(params: {
  userId: string;
  email: string;
  plan: PlanKey;
  ref?: string | null;
}): Promise<CheckoutResult> {
  const { userId, email, plan, ref } = params;
  const priceId = getPriceId(plan);
  const stripe  = getStripe();
  const appUrl  = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const supabase = createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id, tier, stripe_subscription_id, billing_interval, onboarding_completed")
    .eq("id", userId)
    .single();

  let customerId = profile?.stripe_customer_id as string | undefined;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email,
      metadata: { supabase_user_id: userId },
    });
    customerId = customer.id;
    const { error: updateErr } = await supabase
      .from("profiles")
      .update({ stripe_customer_id: customerId })
      .eq("id", userId);
    if (updateErr) {
      console.error("Failed to save stripe_customer_id:", updateErr.message);
    }
  }

  const existingSubId = profile?.stripe_subscription_id as string | null;
  const currentTier    = (profile?.tier ?? "free") as string;
  const alreadyOnboarded = !!profile?.onboarding_completed;

  if (currentTier !== "free" && profile?.billing_interval === "lifetime") {
    return { error: "You already have a lifetime membership :) There is no further upgrade.", status: 400 };
  }

  if (!priceId) {
    console.error("Missing price ID for plan:", plan);
    return { error: `Price not configured for ${plan}`, status: 500 };
  }

  const isLifetime = plan === "lifetime_pro"   || plan === "lifetime_elite";
  const isMonthly  = plan === "pro_monthly"    || plan === "elite_monthly";
  const hasTrial   = isMonthly;
  const isUpgrade  = currentTier !== "free" && !!existingSubId;

  const baseMetadata: Record<string, string> = {
    supabase_user_id: userId,
    plan,
    ...(ref ? { influencer_ref: ref } : {}),
    // The old subscription is cancelled once the *new* one is confirmed active
    // by the webhook, not here — cancelling up front means an abandoned
    // checkout costs the user their existing paid access for nothing.
    ...(existingSubId ? { previous_subscription_id: existingSubId } : {}),
  };

  // Send first-time subscribers into onboarding after payment; send existing
  // users who are just changing plans back to the dashboard.
  const successPath = alreadyOnboarded ? "/dashboard?upgrade=success" : "/onboarding?upgrade=success";

  const sessionConfig: Parameters<typeof stripe.checkout.sessions.create>[0] = {
    customer:             customerId,
    mode:                 isLifetime ? "payment" : "subscription",
    payment_method_types: ["card"],
    line_items:           [{ price: priceId, quantity: 1 }],
    success_url:           `${appUrl}${successPath}`,
    cancel_url:            `${appUrl}/dashboard/upgrade?canceled=1`,
    allow_promotion_codes: true,
  };

  if (!isLifetime) {
    sessionConfig.subscription_data = {
      ...(hasTrial && !isUpgrade ? { trial_period_days: 14 } : {}),
      metadata: baseMetadata,
    };
  } else {
    sessionConfig.metadata = baseMetadata;
    sessionConfig.payment_intent_data = { metadata: baseMetadata };
  }

  try {
    const session = await stripe.checkout.sessions.create(sessionConfig);
    if (!session.url) {
      return { error: "Stripe did not return a checkout URL", status: 500 };
    }
    return { url: session.url };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Stripe error";
    console.error("Stripe checkout error:", msg);
    return { error: msg, status: 500 };
  }
}
