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

  const supabase = createAdminClient();
  const { email } = parsed.data;

  const { error } = await supabase
    .from("newsletter_subscribers")
    .upsert({ email, confirmed: true }, { onConflict: "email", ignoreDuplicates: true });

  if (error && !error.message.includes("duplicate")) {
    console.error("newsletter subscribe error:", error.message);
    return NextResponse.json({ error: "Failed to subscribe" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
