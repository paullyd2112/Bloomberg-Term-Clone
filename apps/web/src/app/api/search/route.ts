import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/user";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim().toUpperCase();
  if (!q || q.length < 1) return NextResponse.json({ results: [] });

  const supabase = createClient();

  const [pricesRes, signalsRes] = await Promise.all([
    supabase
      .from("raw_prices")
      .select("identifier, asset_type, price, change_24h")
      .ilike("identifier", `${q}%`)
      .order("captured_at", { ascending: false })
      .limit(50),
    supabase
      .from("signals")
      .select("identifier, asset_type")
      .ilike("identifier", `${q}%`)
      .eq("is_backtest", false)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const seen = new Map<string, { identifier: string; asset_type: string; price: number | null; change_24h: number | null }>();

  for (const row of pricesRes.data ?? []) {
    const key = `${row.asset_type}:${row.identifier}`;
    if (!seen.has(key)) {
      seen.set(key, {
        identifier: row.identifier,
        asset_type: row.asset_type,
        price: row.price,
        change_24h: row.change_24h,
      });
    }
  }

  for (const row of signalsRes.data ?? []) {
    const key = `${row.asset_type}:${row.identifier}`;
    if (!seen.has(key)) {
      seen.set(key, {
        identifier: row.identifier,
        asset_type: row.asset_type,
        price: null,
        change_24h: null,
      });
    }
  }

  const results = Array.from(seen.values()).slice(0, 10);
  return NextResponse.json({ results });
}
