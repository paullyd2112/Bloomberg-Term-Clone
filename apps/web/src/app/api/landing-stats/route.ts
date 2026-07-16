import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Public stats for the landing page's live win-rate chip and the terminal
 * mockup's stat tiles. Mirrors the data-service /accuracy filters: resolved
 * (WIN/LOSS) live signals since ENGINE_CUTOFF, the point the indicator
 * pipeline was fixed. Signals before it were generated from broken data and
 * aren't representative (see CLAUDE.md ALGO section).
 */

export const revalidate = 300;

const ENGINE_CUTOFF = "2026-07-04T11:00:00Z";

type LandingStats = {
  wins: number | null;
  losses: number | null;
  total: number;
  win_rate: number | null;
  signals_today: number | null;
  avg_confidence: number | null;
  coins_tracked: number | null;
};

const EMPTY: LandingStats = {
  wins: null,
  losses: null,
  total: 0,
  win_rate: null,
  signals_today: null,
  avg_confidence: null,
  coins_tracked: null,
};

export async function GET() {
  try {
    const admin = createAdminClient();
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [resolved, today, recent, tracked] = await Promise.all([
      // Resolved live crypto signals since the engine fix
      admin
        .from("signals")
        .select("outcome")
        .eq("asset_type", "crypto")
        .eq("is_backtest", false)
        .in("outcome", ["WIN", "LOSS"])
        .gte("created_at", ENGINE_CUTOFF),
      // Actionable signals generated today (crypto + predictions)
      admin
        .from("signals")
        .select("id", { count: "exact", head: true })
        .in("asset_type", ["crypto", "prediction"])
        .eq("is_backtest", false)
        .neq("direction", "HOLD")
        .gte("created_at", todayStart.toISOString()),
      // Recent actionable signals, for average confidence
      admin
        .from("signals")
        .select("confidence")
        .in("asset_type", ["crypto", "prediction"])
        .eq("is_backtest", false)
        .neq("direction", "HOLD")
        .order("created_at", { ascending: false })
        .limit(20),
      // Distinct crypto coins with fresh price rows in the last 24h
      admin
        .from("raw_prices")
        .select("identifier")
        .eq("asset_type", "crypto")
        .neq("identifier", "MARKET_SENTIMENT")
        .gte("captured_at", last24h)
        .limit(1000),
    ]);

    if (resolved.error) throw resolved.error;

    const wins = (resolved.data ?? []).filter((r) => r.outcome === "WIN").length;
    const losses = (resolved.data ?? []).length - wins;
    const total = wins + losses;
    const win_rate = total > 0 ? Math.round((wins / total) * 1000) / 10 : null;

    const confidences = (recent.data ?? [])
      .map((r) => r.confidence)
      .filter((c): c is number => typeof c === "number");
    const avg_confidence =
      confidences.length > 0
        ? Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length)
        : null;

    const coins = new Set((tracked.data ?? []).map((r) => r.identifier));

    const stats: LandingStats = {
      wins,
      losses,
      total,
      win_rate,
      signals_today: today.error ? null : today.count ?? null,
      avg_confidence,
      coins_tracked: tracked.error || coins.size === 0 ? null : coins.size,
    };

    return NextResponse.json(stats);
  } catch {
    // Fail soft: consumers fall back to their static placeholders.
    return NextResponse.json(EMPTY);
  }
}
