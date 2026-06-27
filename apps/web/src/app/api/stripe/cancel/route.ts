import { NextResponse } from "next/server";
import { z } from "zod";
import { getStripe } from "@/lib/stripe";
import { requireUser } from "@/lib/user";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const Body = z.object({
  action: z.enum(["check", "accept_offer", "cancel"]),
});

const RETENTION_DISCOUNTS: Record<string, { percent: number; months: number }> = {
  pro:   { percent: 25, months: 2 },
  elite: { percent: 50, months: 2 },
};

export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const supabase = createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("tier, stripe_subscription_id, billing_interval, retention_offer_used")
    .eq("id", user.id)
    .single();

  if (!profile?.stripe_subscription_id) {
    return NextResponse.json({ error: "No active subscription" }, { status: 400 });
  }

  const tier = (profile.tier ?? "free") as string;
  const interval = profile.billing_interval as string;
  const alreadyUsedOffer = !!profile.retention_offer_used;

  // Only offer retention on monthly plans, and only once per account
  const eligibleForOffer =
    !alreadyUsedOffer &&
    interval === "month" &&
    tier in RETENTION_DISCOUNTS;

  const discount = RETENTION_DISCOUNTS[tier];
  const stripe = getStripe();

  switch (parsed.data.action) {
    case "check": {
      return NextResponse.json({
        eligible: eligibleForOffer,
        discount: eligibleForOffer && discount
          ? { percent: discount.percent, months: discount.months }
          : null,
        tier,
      });
    }

    case "accept_offer": {
      if (!eligibleForOffer || !discount) {
        return NextResponse.json({ error: "Offer not available" }, { status: 400 });
      }

      // Create a Stripe coupon for this retention offer
      const coupon = await stripe.coupons.create({
        percent_off: discount.percent,
        duration: "repeating",
        duration_in_months: discount.months,
        name: `${tier.toUpperCase()} retention - ${discount.percent}% off ${discount.months}mo`,
      });

      // Apply the coupon to the existing subscription
      await stripe.subscriptions.update(profile.stripe_subscription_id, {
        coupon: coupon.id,
      });

      // Mark offer as used so they can't do this again
      const admin = createAdminClient();
      await (admin as any)
        .from("profiles")
        .update({ retention_offer_used: true })
        .eq("id", user.id);

      return NextResponse.json({ ok: true, discount: discount.percent });
    }

    case "cancel": {
      const sub = await stripe.subscriptions.retrieve(profile.stripe_subscription_id);

      if (sub.status === "trialing") {
        // Trial: immediate cancellation, no access
        await stripe.subscriptions.cancel(profile.stripe_subscription_id);
        const admin = createAdminClient();
        await (admin as any)
          .from("profiles")
          .update({ tier: "free", stripe_subscription_id: null, billing_interval: null })
          .eq("id", user.id);
      } else {
        // Paid: cancel at period end so they keep access for what they paid
        await stripe.subscriptions.update(profile.stripe_subscription_id, {
          cancel_at_period_end: true,
        });
      }

      return NextResponse.json({ ok: true });
    }
  }
}
