import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Public stats for the landing page's live win-rate chip.
 * Mirrors the data-service /accuracy filters: resolved (WIN/LOSS) live
 * signals since ENGINE_CUTOFF — the point the indicator pipeline was fixed;
 * signals before it were generated from broken data and aren't
 * representative (see CLAUDE.md ALGO section).
 */

export const revalidate = 300;

const ENGINE_CUTOFF = "2026-07-04T11:00:00Z";

export async function GET() {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("signals")
      .select("outcome")
      .eq("asset_type", "crypto")
      .eq("is_backtest", false)
      .in("outcome", ["WIN", "LOSS"])
      .gte("created_at", ENGINE_CUTOFF);

    if (error) throw error;

    const wins = (data ?? []).filter((r) => r.outcome === "WIN").length;
    const losses = (data ?? []).length - wins;
    const total = wins + losses;
    const win_rate = total > 0 ? Math.round((wins / total) * 1000) / 10 : null;

    return NextResponse.json({ wins, losses, total, win_rate });
  } catch {
    // Fail soft — the chip falls back to its static line.
    return NextResponse.json({ wins: null, losses: null, total: 0, win_rate: null });
  }
}
