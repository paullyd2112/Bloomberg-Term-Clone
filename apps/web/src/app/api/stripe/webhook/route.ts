/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, getTierForPlan } from "@/lib/stripe";
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
  const supabase = createAdminClient();
  const { data, error, status, statusText } = await (supabase as any)
    .from("profiles")
    .update({
      tier,
      stripe_subscription_id: subscriptionId,
      billing_interval:       billingInterval,
    })
    .eq("id", supabaseUserId)
    .select();

  if (error) {
    console.error("updateUserTier FAILED:", {
      supabaseUserId,
      tier,
      subscriptionId,
      billingInterval,
      error,
      status,
      statusText,
    });
    throw new Error(`Supabase update failed: ${error.message}`);
  }

  console.log("updateUserTier SUCCESS:", {
    supabaseUserId,
    tier,
    matchedRows: data?.length ?? 0,
    data,
  });

  if (!data || data.length === 0) {
    console.warn("updateUserTier WARNING: no rows matched for user", supabaseUserId);
  }
}

// Credit amount in cents ($50 = one free Pro month)
const REFERRAL_CREDIT_CENTS = 5000;

async function _processReferralReward(referredUserId: string) {
  try {
    const admin = createAdminClient();

    // Check if there's an unconverted referral for this user
    const { data: referral } = await (admin as any)
      .from("referrals")
      .select("id, referrer_id")
      .eq("referred_id", referredUserId)
      .eq("status", "pending")
      .single();

    if (!referral) return;

    // Look up referrer's Stripe customer ID
    const { data: referrerProfile } = await (admin as any)
      .from("profiles")
      .select("stripe_customer_id, tier")
      .eq("id", referral.referrer_id)
      .single();

    let customerId = referrerProfile?.stripe_customer_id as string | undefined;

    // If referrer has no Stripe customer yet, create one so the credit is held
    if (!customerId) {
      const { data: authUser } = await admin.auth.admin.getUserById(referral.referrer_id);
      if (authUser?.user?.email) {
        const customer = await getStripe().customers.create({
          email:    authUser.user.email,
          metadata: { supabase_user_id: referral.referrer_id },
        });
        customerId = customer.id;
        await (admin as any)
          .from("profiles")
          .update({ stripe_customer_id: customerId })
          .eq("id", referral.referrer_id);
      }
    }

    // Apply Stripe balance credit (negative = credit on account)
    if (customerId) {
      await getStripe().customers.createBalanceTransaction(customerId, {
        amount:      -REFERRAL_CREDIT_CENTS,
        currency:    "usd",
        description: "Referral reward — $50 credit",
      });
    }

    // Mark referral as rewarded
    await (admin as any)
      .from("referrals")
      .update({
        status:            "rewarded",
        reward_granted_at: new Date().toISOString(),
      })
      .eq("id", referral.id);

    console.log(`Referral rewarded: ${referral.id}, credit applied to ${customerId}`);
  } catch (err) {
    // Non-fatal — log but don't fail the webhook
    console.error("Referral reward error:", err);
  }
}

export async function POST(req: Request) {
  const rawBody = await getRawBody(req);
  const sig     = req.headers.get("stripe-signature") ?? "";
  const stripe  = getStripe();

  let event: Stripe.Event;
  try {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) throw new Error("Missing STRIPE_WEBHOOK_SECRET");
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.supabase_user_id;
        const plan   = session.metadata?.plan;

        if (!userId) break;
        if (session.mode !== "payment") break;

        const tier = getTierForPlan(plan ?? "");
        await updateUserTier(userId, tier, null, "lifetime");
        await _processReferralReward(userId);
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub    = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.supabase_user_id;
        if (!userId) break;

        const plan = sub.metadata?.plan ?? "";
        const tier = getTierForPlan(plan);
        const rawInterval = sub.items.data[0]?.price.recurring?.interval ?? null;
        const INTERVAL_MAP: Record<string, string> = {
          month: "monthly",
          quarter: "quarterly",
          year: "annual",
        };
        const interval = rawInterval ? (INTERVAL_MAP[rawInterval] ?? rawInterval) : null;
        const active   = ["active", "trialing"].includes(sub.status);

        // If user cancels during trial, revoke access immediately.
        // They haven't paid anything so there's nothing to honor.
        const canceledDuringTrial =
          sub.status === "trialing" && sub.cancel_at_period_end;

        if (canceledDuringTrial) {
          await updateUserTier(userId, "free", null, null);
          try {
            await stripe.subscriptions.cancel(sub.id);
          } catch (e) {
            console.error("Failed to cancel trial sub:", e);
          }
          break;
        }

        await updateUserTier(userId, active ? tier : "free", sub.id, interval);

        // Reward referrer automatically when referred user goes active/trialing
        if (active) {
          await _processReferralReward(userId);
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
