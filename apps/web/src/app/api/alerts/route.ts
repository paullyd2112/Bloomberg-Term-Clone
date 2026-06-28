import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/user";
import type { Tier } from "@/lib/tier";

const Body = z.object({
  asset_type:   z.enum(["stock", "crypto"]),
  identifier:   z.string().min(1).max(100).transform((s) => s.toUpperCase()),
  trigger_type: z.enum(["signal_fired", "price_threshold", "news_drop"]),
  threshold:    z.number().positive().optional(),
}).superRefine((val, ctx) => {
  if (val.trigger_type === "price_threshold" && val.threshold == null) {
    ctx.addIssue({ code: "custom", message: "threshold required for price_threshold alerts", path: ["threshold"] });
  }
});

const MAX_ALERTS = 20;

export async function POST(req: Request) {
  let user;
  try { user = await requireUser(); } catch {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const supabase = createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("tier")
    .eq("id", user.id)
    .single();

  const tier = (profile?.tier ?? "free") as Tier;
  if (tier === "free") {
    return NextResponse.json({ error: "Alerts are a Pro feature", upgrade: true }, { status: 403 });
  }

  // Cap total alerts to avoid abuse
  const { count } = await supabase
    .from("alerts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_active", true);

  if ((count ?? 0) >= MAX_ALERTS) {
    return NextResponse.json({ error: `Maximum ${MAX_ALERTS} active alerts reached` }, { status: 429 });
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", detail: parsed.error.flatten() }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("alerts")
    .insert({ user_id: user.id, ...parsed.data })
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
