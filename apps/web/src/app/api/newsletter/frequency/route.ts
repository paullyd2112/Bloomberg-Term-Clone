import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/user";

const FREQUENCIES = ["daily", "weekdays", "every_other_day", "weekly", "weekends"] as const;

const Body = z.object({
  frequency: z.enum(FREQUENCIES),
});

export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const supabase = createClient();
  const { data } = await supabase
    .from("newsletter_subscribers")
    .select("newsletter_frequency")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({ frequency: data?.newsletter_frequency ?? "daily" });
}

export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid frequency" }, { status: 400 });
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("newsletter_subscribers")
    .update({ newsletter_frequency: parsed.data.frequency })
    .eq("user_id", user.id);

  if (error) {
    console.error("newsletter frequency update error:", error.message);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
