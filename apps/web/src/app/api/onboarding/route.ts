import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/user";
import { syncToBeehiiv } from "@/lib/beehiiv";

const Body = z.object({
  full_name:            z.string().min(1).max(200),
  phone_number:         z.string().max(30).nullable().optional(),
  trading_experience:   z.enum(["beginner", "intermediate", "advanced"]),
  asset_preferences:    z.array(z.enum(["stocks", "crypto", "predictions"])).min(1),
  subscribe_newsletter: z.boolean().optional().default(true),
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
      full_name:            parsed.data.full_name,
      phone_number:         parsed.data.phone_number ?? null,
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

  if (parsed.data.subscribe_newsletter && user.email) {
    const admin = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin.from("newsletter_subscribers") as any)
      .upsert(
        { email: user.email.toLowerCase(), user_id: user.id, confirmed: true, unsubscribed: false },
        { onConflict: "email" },
      );
  }

  return NextResponse.json({ ok: true });
}
