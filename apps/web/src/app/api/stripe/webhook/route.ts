import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, getTierForPlan } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function getRawBody(req: Request): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  const reader = req.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

async function updateUserTier(
  supabaseUserId: string,
  tier: "free" | "pro" | "elite",
  subscriptionId: string | null,
  billingInterval: string | null,
) {
  const supabase = createClient();
  await supabase
    .from("profiles")
    .update({
      tier,
      stripe_subscription_id: subscriptionId,
      billing_interval:       billingInterval,
    })
    .eq("id", supabaseUserId);
}

export async function POST(req: Request) {
  const rawBody = await getRawBody(req);
  const sig     = req.headers.get("stripe-signature") ?? "";
  const stripe  = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub    = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.supabase_user_id;
        if (!userId) break;

        const plan = sub.metadata?.plan ?? "";
        const tier = getTierForPlan(plan);
        const interval = (sub.items.data[0]?.price.recurring?.interval ?? null) as string | null;
        const active   = ["active", "trialing"].includes(sub.status);

        await updateUserTier(userId, active ? tier : "free", sub.id, interval);
        break;
      }

      case "customer.subscription.deleted": {
        const sub    = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.supabase_user_id;
        if (!userId) break;
        await updateUserTier(userId, "free", null, null);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        console.warn("Payment failed for customer:", invoice.customer);
        break;
      }
    }
  } catch (err) {
    console.error("Webhook handler error:", err);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
