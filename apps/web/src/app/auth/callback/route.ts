/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");

export async function GET(request: Request) {
  const { searchParams, origin: requestOrigin } = new URL(request.url);
  const origin  = APP_ORIGIN || requestOrigin;
  const code    = searchParams.get("code");
  const rawNext = searchParams.get("next") ?? "/dashboard";
  const next    = /^\/(?!\/)/.test(rawNext) ? rawNext : "/dashboard";

  if (code) {
    const supabase = createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      const admin = createAdminClient();

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
