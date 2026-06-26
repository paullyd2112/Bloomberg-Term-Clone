import { createClient } from "@/lib/supabase/server";
import type { Tier } from "@/lib/tier";

export async function getUser() {
  const supabase = createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

export async function getUserTier(): Promise<Tier> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "free";

  const { data } = await supabase
    .from("profiles")
    .select("tier, trial_ends_at")
    .eq("id", user.id)
    .single();

  const tier = (data?.tier as Tier) ?? "free";
  if (tier === "free" && data?.trial_ends_at) {
    const trialEnd = new Date(data.trial_ends_at);
    if (trialEnd.getTime() > Date.now()) return "pro";
  }
  return tier;
}

export async function getUserProfile() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("tier, billing_interval, full_name, phone_number, trading_experience, asset_preferences, trial_ends_at")
    .eq("id", user.id)
    .single();

  return data;
}

export async function requireUser() {
  const user = await getUser();
  if (!user) throw new Error("Unauthenticated");
  return user;
}
