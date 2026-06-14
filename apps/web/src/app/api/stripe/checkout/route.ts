import { NextResponse } from "next/server";
import { z } from "zod";
import { getStripe, getPriceId, type PlanKey } from "@/lib/stripe";
import { requireUser } from "@/lib/user";
import { createClient } from "@/lib/supabase/server";

const Body = z.object({
  plan: z.enum(["pro_monthly", "pro_quarterly", "pro_annual", "elite_monthly", "elite_quarterly", "elite_annual", "lifetime_pro", "lifetime_elite"]),
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
    const { error: updateErr } = await supabase
      .from("profiles")
      .update({ stripe_customer_id: customerId })
      .eq("id", user.id);
    if (updateErr) {
      console.error("Failed to save stripe_customer_id:", updateErr.message);
    }
  }

  const isLifetime = plan === "lifetime_pro" || plan === "lifetime_elite";
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
    sessionConfig.subscription_data = {
      trial_period_days: 14,
      metadata: { supabase_user_id: user.id, plan },
    };
  } else {
    // Set metadata on the session itself so checkout.session.completed webhook can read it
    sessionConfig.metadata = { supabase_user_id: user.id, plan };
    sessionConfig.payment_intent_data = {
      metadata: { supabase_user_id: user.id, plan },
    };
  }

  const session = await stripe.checkout.sessions.create(sessionConfig);

  return NextResponse.json({ url: session.url });
}
