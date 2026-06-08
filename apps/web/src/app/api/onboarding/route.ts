import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/user";
import { syncToBeehiiv } from "@/lib/beehiiv";

const Body = z.object({
  trading_experience: z.enum(["beginner", "intermediate", "advanced"]),
  asset_preferences:  z.array(z.enum(["stocks", "crypto", "predictions"])).min(1),
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

  const supabase = createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      trading_experience:   parsed.data.trading_experience,
      asset_preferences:    parsed.data.asset_preferences,
      onboarding_completed: true,
    })
    .eq("id", user.id);

  if (error) {
    console.error("onboarding update error:", error.message);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }

  if (user.email) void syncToBeehiiv(user.email, "app");

  return NextResponse.json({ ok: true });
}
