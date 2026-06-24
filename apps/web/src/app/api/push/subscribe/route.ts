import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser, getUserTier } from "@/lib/user";
import { canAccessFeature } from "@/lib/tier";

const Body = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export async function POST(request: Request) {
  const user = await requireUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Alerts (and thus push) are a paid feature
  const tier = await getUserTier();
  if (!canAccessFeature(tier, "alerts")) {
    return NextResponse.json(
      { error: "Push notifications require a paid plan" },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  const { endpoint, keys } = parsed.data;
  const supabase = createClient();

  // Upsert by endpoint (one row per device); endpoint is unique
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        user_id: user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        user_agent: request.headers.get("user-agent") ?? null,
      },
      { onConflict: "endpoint" },
    );

  if (error) {
    return NextResponse.json({ error: "Failed to save subscription" }, { status: 500 });
  }

  return NextResponse.json({ status: "ok" });
}
