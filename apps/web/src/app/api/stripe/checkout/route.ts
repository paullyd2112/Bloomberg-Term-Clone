import { NextResponse } from "next/server";
import { z } from "zod";
import { getStripe, getPriceId, type PlanKey } from "@/lib/stripe";
import { requireUser } from "@/lib/user";
import { createClient } from "@/lib/supabase/server";

const Body = z.object({
  plan: z.enum(["pro_monthly", "pro_quarterly", "pro_annual", "elite_monthly", "elite_annual"]),
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
      email:    user.email!,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;
    await supabase
      .from("profiles")
      .update({ stripe_customer_id: customerId })
      .eq("id", user.id);
  }

  const session = await stripe.checkout.sessions.create({
    customer:             customerId,
    mode:                 "subscription",
    payment_method_types: ["card"],
    line_items:           [{ price: priceId, quantity: 1 }],
    subscription_data: {
      trial_period_days: 7,
      metadata: { supabase_user_id: user.id, plan },
    },
    success_url:           `${appUrl}/dashboard?upgrade=success`,
    cancel_url:            `${appUrl}/dashboard/upgrade?canceled=1`,
    allow_promotion_codes: true,
  });

  return NextResponse.json({ url: session.url });
}
