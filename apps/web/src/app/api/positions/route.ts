import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/user";
import type { Tier } from "@/lib/tier";

const OpenBody = z.object({
  asset_type:  z.enum(["stock", "crypto", "prediction"]),
  identifier:  z.string().min(1).max(100).transform((s) => s.toUpperCase()),
  direction:   z.enum(["LONG", "SHORT", "YES", "NO"]),
  entry_price: z.number().positive(),
  size:        z.number().positive(),
});

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
    return NextResponse.json({ error: "Portfolio tracking is a Pro feature", upgrade: true }, { status: 403 });
  }

  const parsed = OpenBody.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", detail: parsed.error.flatten() }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("positions")
    .insert({ user_id: user.id, ...parsed.data })
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
