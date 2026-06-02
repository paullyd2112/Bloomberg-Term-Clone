/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _req: Request,
  { params }: { params: { code: string } },
) {
  const origin  = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const code    = params.code?.toLowerCase().trim();

  if (!code) {
    return NextResponse.redirect(`${origin}/signup`);
  }

  // Validate code exists — use admin client to query any profile
  const supabase = createAdminClient();
  const { data } = await (supabase as any)
    .from("profiles")
    .select("id")
    .eq("referral_code", code)
    .single();

  if (!data) {
    return NextResponse.redirect(`${origin}/signup`);
  }

  return NextResponse.redirect(`${origin}/signup?ref=${code}`);
}
