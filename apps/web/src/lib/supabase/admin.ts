import { createClient as createSupabaseClient } from "@supabase/supabase-js";

let _admin: ReturnType<typeof createSupabaseClient> | null = null;

export function createAdminClient() {
  if (!_admin) {
    _admin = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co",
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? "placeholder-service-role-key",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  }
  return _admin;
}
