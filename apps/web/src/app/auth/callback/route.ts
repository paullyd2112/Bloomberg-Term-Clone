/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");

export async function GET(request: Request) {
  const { searchParams, origin: requestOrigin } = new URL(request.url);
  // Pin to the configured app URL in production; fall back to request origin in dev
  const origin  = APP_ORIGIN || requestOrigin;
  const code    = searchParams.get("code");
  const rawNext = searchParams.get("next") ?? "/dashboard";
  const next    = /^\/(?!\/)/.test(rawNext) ? rawNext : "/dashboard";
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

      // Capture name from OAuth provider (Google, etc.) if available
      const oauthName = data.user.user_metadata?.full_name
        ?? data.user.user_metadata?.name
        ?? null;
      if (oauthName) {
        await (admin as any)
          .from("profiles")
          .update({ full_name: oauthName })
          .eq("id", data.user.id)
          .is("full_name", null);
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
