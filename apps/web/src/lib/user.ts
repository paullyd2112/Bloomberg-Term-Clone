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
    .select("tier")
    .eq("id", user.id)
    .single();

  return (data?.tier as Tier) ?? "free";
}

export async function requireUser() {
  const user = await getUser();
  if (!user) throw new Error("Unauthenticated");
  return user;
}
