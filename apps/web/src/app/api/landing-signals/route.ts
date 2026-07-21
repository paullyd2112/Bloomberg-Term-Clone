import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const revalidate = 30;

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("signals")
      .select("id, identifier, direction, confidence, time_horizon, created_at")
      .eq("is_backtest", false)
      .neq("direction", "HOLD")
      .neq("asset_type", "prediction")
      .gte("confidence", 60)
      .order("created_at", { ascending: false })
      .limit(6);

    if (error) {
      return NextResponse.json([], { status: 500 });
    }

    return NextResponse.json(data ?? []);
  } catch {
    return NextResponse.json([], { status: 500 });
  }
}
