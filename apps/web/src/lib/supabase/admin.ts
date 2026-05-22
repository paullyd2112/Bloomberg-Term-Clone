import { createClient as createSupabaseClient } from "@supabase/supabase-js";

let _admin: ReturnType<typeof createSupabaseClient> | null = null;

export function createAdminClient() {
  if (!_admin) {
    _admin = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  }
  return _admin;
}
