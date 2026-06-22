import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/user";

const Body = z.object({
  full_name:          z.string().min(1).max(200),
  phone_number:       z.string().max(30).nullable().optional(),
  trading_experience: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  asset_preferences:  z.array(z.enum(["stocks", "crypto", "predictions"])).optional(),
});

export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }

  const update: Record<string, unknown> = {
    full_name:    parsed.data.full_name,
    phone_number: parsed.data.phone_number ?? null,
  };
  if (parsed.data.trading_experience) update.trading_experience = parsed.data.trading_experience;
  if (parsed.data.asset_preferences)  update.asset_preferences  = parsed.data.asset_preferences;

  const supabase = createClient();
  const { error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", user.id);

  if (error) {
    console.error("profile update error:", error.message);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
