import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, getTierForPlan } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

        // Convert any pending referral when user first goes active/trialing
        if (active) {
          try {
            const admin = createAdminClient();
            const { data: profile } = await (admin as any)
              .from("profiles")
              .select("referred_by")
              .eq("id", userId)
              .single();

            if (profile?.referred_by) {
              await (admin as any)
                .from("referrals")
                .update({
                  status:            "converted",
                  reward_granted_at: new Date().toISOString(),
                })
                .eq("referred_id", userId)
                .eq("status",      "pending");
            }
          } catch {
            // Non-fatal
          }
        }
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
