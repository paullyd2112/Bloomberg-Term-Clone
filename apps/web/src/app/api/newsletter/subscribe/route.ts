import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

const Body = z.object({
  email: z.string().email(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { email } = parsed.data;

  // Check if this email already has a Plebs account
  const { data: authData } = await admin.auth.admin.getUserByEmail(email);
  if (authData?.user) {
    return NextResponse.json({ exists: true }, { status: 200 });
  }

  // Check if already subscribed to newsletter
  const { data: existing } = await admin
    .from("newsletter_subscribers")
    .select("email")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ already_subscribed: true }, { status: 200 });
  }

  const { error } = await admin
    .from("newsletter_subscribers")
    .insert({ email: email.toLowerCase(), confirmed: true });

  if (error) {
    console.error("newsletter subscribe error:", error.message);
    return NextResponse.json({ error: "Failed to subscribe" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
