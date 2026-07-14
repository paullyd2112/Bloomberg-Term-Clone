import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/env";

let _admin: ReturnType<typeof createSupabaseClient> | null = null;

export function createAdminClient() {
  if (!_admin) {
    _admin = createSupabaseClient(
      NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY(),
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  }
  return _admin;
}
