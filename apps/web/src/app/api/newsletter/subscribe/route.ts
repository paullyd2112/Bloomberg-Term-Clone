import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncToBeehiiv } from "@/lib/beehiiv";

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: authData } = await (admin.auth.admin as any).getUserByEmail(email);
  if (authData?.user) {
    return NextResponse.json({ exists: true }, { status: 200 });
  }

  const { data: existing } = await (admin
    .from("newsletter_subscribers") as any)
    .select("email")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ already_subscribed: true }, { status: 200 });
  }

  const { error } = await (admin
    .from("newsletter_subscribers") as any)
    .insert({ email: email.toLowerCase(), confirmed: true });

  if (error) {
    console.error("newsletter subscribe error:", error.message);
    return NextResponse.json({ error: "Failed to subscribe" }, { status: 500 });
  }

  void syncToBeehiiv(email.toLowerCase(), "newsletter");

  return NextResponse.json({ ok: true });
}
