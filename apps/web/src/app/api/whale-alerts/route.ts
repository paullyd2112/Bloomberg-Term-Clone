import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const revalidate = 30;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? 20), 100);

  const supabase = createClient();
  const { data, error } = await supabase
    .from("whale_alerts")
    .select("id, market_title, asset_id, outcome, price, size, usd_value, tx_hash, maker_address, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("whale-alerts fetch error:", error.message);
    return NextResponse.json({ alerts: [], count: 0 });
  }

  return NextResponse.json({ alerts: data ?? [], count: data?.length ?? 0 });
}
