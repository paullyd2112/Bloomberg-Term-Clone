import { NextResponse } from "next/server";
import { z } from "zod";
import { getStripe, getPriceId, type PlanKey } from "@/lib/stripe";
import { requireUser } from "@/lib/user";
import { createClient } from "@/lib/supabase/server";

const Body = z.object({
  plan: z.enum(["pro_monthly", "pro_quarterly", "pro_annual", "elite_monthly", "elite_quarterly", "elite_annual", "lifetime_pro", "lifetime_elite", "founding_pro", "founding_elite"]),
  ref:  z.string().max(64).optional(),
});

export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const plan    = parsed.data.plan as PlanKey;
  const ref     = parsed.data.ref ?? null;
  const priceId = getPriceId(plan);
  const stripe  = getStripe();
  const appUrl  = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const supabase = createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single();

  let customerId = profile?.stripe_customer_id as string | undefined;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email:    user.email ?? "",
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;
    const { error: updateErr } = await supabase
      .from("profiles")
      .update({ stripe_customer_id: customerId })
      .eq("id", user.id);
    if (updateErr) {
      console.error("Failed to save stripe_customer_id:", updateErr.message);
    }
  }

  // ── Guard: one membership at a time ──────────────────────────────────────
  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("tier, stripe_subscription_id, billing_interval")
    .eq("id", user.id)
    .single();

  const existingSubId = currentProfile?.stripe_subscription_id as string | null;
  const currentTier   = (currentProfile?.tier ?? "free") as string;

  // Block if user already has a lifetime plan
  if (currentTier !== "free" && currentProfile?.billing_interval === "lifetime") {
    return NextResponse.json(
      { error: "You already have a lifetime membership :) There is no further upgrade." },
      { status: 400 },
    );
  }

  // If they have an active subscription, cancel it before creating the new one.
  // This handles upgrades (pro→elite), downgrades, and interval changes.
  if (existingSubId) {
    try {
      await stripe.subscriptions.cancel(existingSubId, {
        prorate: true,
      });
    } catch (e) {
      console.warn("Could not cancel existing subscription:", existingSubId, e);
    }
  }

  if (!priceId) {
    console.error("Missing price ID for plan:", plan);
    return NextResponse.json({ error: `Price not configured for ${plan}` }, { status: 500 });
  }

  const isLifetime  = plan === "lifetime_pro"   || plan === "lifetime_elite";
  const isMonthly   = plan === "pro_monthly"    || plan === "elite_monthly";
  const hasTrial    = isMonthly;
  const baseMetadata = {
    supabase_user_id: user.id,
    plan,
    ...(ref ? { influencer_ref: ref } : {}),
  };
  const sessionConfig: Parameters<typeof stripe.checkout.sessions.create>[0] = {
    customer:             customerId,
    mode:                 isLifetime ? "payment" : "subscription",
    payment_method_types: ["card"],
    line_items:           [{ price: priceId, quantity: 1 }],
    success_url:           `${appUrl}/dashboard?upgrade=success`,
    cancel_url:            `${appUrl}/dashboard/upgrade?canceled=1`,
    allow_promotion_codes: true,
  };

  if (!isLifetime) {
    const isUpgrade = currentTier !== "free" && existingSubId;
    sessionConfig.subscription_data = {
      ...(hasTrial && !isUpgrade ? { trial_period_days: plan.startsWith("elite") ? 14 : 7 } : {}),
      metadata: baseMetadata,
    };
  } else {
    sessionConfig.metadata = baseMetadata;
    sessionConfig.payment_intent_data = { metadata: baseMetadata };
  }

  try {
    const session = await stripe.checkout.sessions.create(sessionConfig);
    return NextResponse.json({ url: session.url });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Stripe error";
    console.error("Stripe checkout error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
