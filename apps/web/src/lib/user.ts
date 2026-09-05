import { createClient } from "@/lib/supabase/server";

export async function getUser() {
  const supabase = createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

export async function getUserProfile() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("full_name, phone_number, trading_experience, asset_preferences")
    .eq("id", user.id)
    .single();

  return data;
}

export async function requireUser() {
  const user = await getUser();
  if (!user) throw new Error("Unauthenticated");
  return user;
}
