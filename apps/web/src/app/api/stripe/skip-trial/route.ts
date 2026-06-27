import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { requireUser } from "@/lib/user";
import { createClient } from "@/lib/supabase/server";

const SKIP_TRIAL_DISCOUNT_PERCENT = 20;
const SKIP_TRIAL_DISCOUNT_MONTHS = 3;

export async function POST() {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const supabase = createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_subscription_id, tier, billing_interval")
    .eq("id", user.id)
    .single();

  if (!profile?.stripe_subscription_id) {
    return NextResponse.json({ error: "No active subscription" }, { status: 400 });
  }

  const stripe = getStripe();
  const sub = await stripe.subscriptions.retrieve(profile.stripe_subscription_id);

  if (sub.status !== "trialing") {
    return NextResponse.json({ error: "Not currently on a trial" }, { status: 400 });
  }

  // Create a coupon for the early conversion reward
  const coupon = await stripe.coupons.create({
    percent_off: SKIP_TRIAL_DISCOUNT_PERCENT,
    duration: "repeating",
    duration_in_months: SKIP_TRIAL_DISCOUNT_MONTHS,
    name: `Early convert - ${SKIP_TRIAL_DISCOUNT_PERCENT}% off ${SKIP_TRIAL_DISCOUNT_MONTHS}mo`,
  });

  // End the trial immediately and apply the discount
  await stripe.subscriptions.update(profile.stripe_subscription_id, {
    trial_end: "now",
    coupon: coupon.id,
  });

  return NextResponse.json({
    ok: true,
    discount: SKIP_TRIAL_DISCOUNT_PERCENT,
    months: SKIP_TRIAL_DISCOUNT_MONTHS,
  });
}
