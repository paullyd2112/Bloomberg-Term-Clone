import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";
  const ref  = searchParams.get("ref")?.toLowerCase().trim() ?? null;

  if (code) {
    const supabase = createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      const admin = createAdminClient();

      // Wire referral if a valid ref code was passed
      if (ref) {
        try {
          const { data: referrer } = await (admin as any)
            .from("profiles")
            .select("id")
            .eq("referral_code", ref)
            .single();

          if (referrer && referrer.id !== data.user.id) {
            // Set referred_by on the new user's profile
            await (admin as any)
              .from("profiles")
              .update({ referred_by: referrer.id })
              .eq("id", data.user.id);

            // Create referral record (ignore conflict — idempotent)
            await (admin as any)
              .from("referrals")
              .insert({
                referrer_id: referrer.id,
                referred_id: data.user.id,
                status:      "pending",
              });
          }
        } catch {
          // Non-fatal — don't block login over a bad referral code
        }
      }

      // Route new vs returning users
      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarding_completed")
        .eq("id", data.user.id)
        .single();

      const destination = profile?.onboarding_completed ? next : "/onboarding";
      return NextResponse.redirect(`${origin}${destination}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
