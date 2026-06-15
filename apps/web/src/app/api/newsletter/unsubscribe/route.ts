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

  const { error } = await admin
    .from("newsletter_subscribers")
    .update({ unsubscribed: true })
    .eq("email", email.toLowerCase());

  if (error) {
    console.error("unsubscribe error:", error.message);
    return NextResponse.json({ error: "Failed to unsubscribe" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
