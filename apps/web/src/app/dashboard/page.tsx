import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getUser, getUserTier } from "@/lib/user";
import SignalFeed from "@/components/signals/SignalFeed";
import type { Signal } from "@/components/signals/SignalCard";
import SubscribeGate from "@/components/ui/SubscribeGate";
import SectorHeatmap from "@/components/dashboard/SectorHeatmap";

export const revalidate = 60;

type AssetAccuracy = {
  asset_type: string;
  identifier: string;
  total_signals: number;
  win_rate: number | null;
  wins: number;
  losses: number;
  neutrals: number;
  avg_confidence: number | null;
};

type PlatformAccuracy = {
  overallWinRate: number;
  totalResolved: number;
  totalWins: number;
  totalLosses: number;
  byAssetClass: { asset_type: string; winRate: number; resolved: number }[];
};

async function fetchPlatformAccuracy(): Promise<PlatformAccuracy | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("asset_accuracy")
    .select("asset_type, total_signals, win_rate, wins, losses, neutrals");

  if (error || !data || data.length === 0) {
    console.error("asset_accuracy fetch error:", error?.message);
    return null;
  }

  const rows = data as AssetAccuracy[];
  const totalWins = rows.reduce((s, r) => s + (r.wins ?? 0), 0);
  const totalLosses = rows.reduce((s, r) => s + (r.losses ?? 0), 0);
  const totalResolved = totalWins + totalLosses;
  const overallWinRate = totalResolved > 0 ? totalWins / totalResolved : 0;

  // Group by asset_type
  const grouped = new Map<string, { wins: number; losses: number }>();
  for (const r of rows) {
    const key = r.asset_type ?? "unknown";
    const g = grouped.get(key) ?? { wins: 0, losses: 0 };
    g.wins += r.wins ?? 0;
    g.losses += r.losses ?? 0;
    grouped.set(key, g);
  }

  const byAssetClass = Array.from(grouped.entries()).map(([asset_type, g]) => {
    const resolved = g.wins + g.losses;
    return {
      asset_type,
      winRate: resolved > 0 ? g.wins / resolved : 0,
      resolved,
    };
  });

  return { overallWinRate, totalResolved, totalWins, totalLosses, byAssetClass };
}

async function fetchSignals(): Promise<Signal[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_dashboard_signals", {
    p_limit: 60,
  });
  if (error) {
    console.error("get_dashboard_signals error:", error.message);
    return [];
  }
  return (data as Signal[]) ?? [];
}

async function fetchTopMovers() {
  const supabase = createClient();
  const { data } = await supabase
    .from("raw_prices")
    .select("identifier, asset_type, price, change_24h")
    .not("change_24h", "is", null)
    .neq("identifier", "MARKET_SENTIMENT")
    .order("captured_at", { ascending: false })
    .limit(80);

  if (!data) return [];

  // Deduplicate by identifier, keep latest, sort by abs change
  const seen = new Map<string, typeof data[0]>();
  for (const row of data) {
    if (!seen.has(row.identifier)) seen.set(row.identifier, row);
  }

  return Array.from(seen.values())
    .sort((a, b) => Math.abs(b.change_24h ?? 0) - Math.abs(a.change_24h ?? 0))
    .slice(0, 10);
}

export default async function DashboardPage() {
  const user    = await getUser();
  const tier    = await getUserTier();
  const [signals, movers, accuracy] = await Promise.all([
    fetchSignals(),
    fetchTopMovers(),
    fetchPlatformAccuracy(),
  ]);

  const winCount  = signals.filter((s) => s.outcome === "WIN").length;
  const lossCount = signals.filter((s) => s.outcome === "LOSS").length;
  const pending   = signals.filter((s) => s.outcome === "PENDING").length;

  if (tier === "free") {
    const { redirect } = await import("next/navigation");
    redirect("/dashboard/upgrade");
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total signals" value={signals.length} />
        <StatCard label="Pending" value={pending} />
        <StatCard label="Wins" value={winCount} color="green" />
        <StatCard label="Losses" value={lossCount} color="red" />
      </div>

      {/* Platform accuracy */}
      {accuracy && (
        <section>
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-2">
            Platform accuracy
          </h2>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 flex flex-wrap gap-x-6 gap-y-2 items-baseline">
            <div>
              <span
                className={`text-2xl font-bold tabular-nums ${
                  accuracy.overallWinRate * 100 >= 60
                    ? "text-green-400"
                    : accuracy.overallWinRate * 100 >= 45
                    ? "text-amber-400"
                    : "text-red-400"
                }`}
              >
                {(accuracy.overallWinRate * 100).toFixed(1)}%
              </span>
              <span className="text-xs text-zinc-500 ml-1.5">win rate</span>
            </div>
            <div>
              <span className="text-lg font-semibold text-white tabular-nums">
                {accuracy.totalResolved}
              </span>
              <span className="text-xs text-zinc-500 ml-1.5">resolved</span>
            </div>
            <span className="text-zinc-700">|</span>
            {accuracy.byAssetClass.map((a) => (
              <div key={a.asset_type} className="flex items-baseline gap-1.5">
                <span className="text-xs text-zinc-400 capitalize">
                  {a.asset_type}
                </span>
                <span
                  className={`text-sm font-semibold tabular-nums ${
                    a.winRate * 100 >= 60
                      ? "text-green-400"
                      : a.winRate * 100 >= 45
                      ? "text-amber-400"
                      : "text-red-400"
                  }`}
                >
                  {(a.winRate * 100).toFixed(1)}%
                </span>
                <span className="text-xs text-zinc-600">
                  ({a.resolved})
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Top movers */}
      {movers.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-2">
            Top movers (24h)
          </h2>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {movers.map((m) => (
              <div
                key={`${m.asset_type}:${m.identifier}`}
                className="flex-shrink-0 bg-zinc-900 border border-zinc-800 rounded px-3 py-2 flex flex-col gap-0.5 min-w-[90px]"
              >
                <span className="font-mono text-xs font-semibold text-white truncate">
                  {m.identifier}
                </span>
                <span
                  className={
                    (m.change_24h ?? 0) >= 0 ? "text-green-400 text-xs" : "text-red-400 text-xs"
                  }
                >
                  {(m.change_24h ?? 0) >= 0 ? "+" : ""}
                  {Number(m.change_24h).toFixed(2)}%
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Sector heatmap */}
      <Suspense
        fallback={
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 h-40 animate-pulse" />
        }
      >
        <SectorHeatmap />
      </Suspense>

      {/* Signal feed */}
      <section>
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">
          Latest signals
        </h2>
        <SignalFeed signals={signals} />
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: "green" | "red";
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
      <div
        className={
          color === "green"
            ? "text-2xl font-bold text-green-400 tabular-nums"
            : color === "red"
            ? "text-2xl font-bold text-red-400 tabular-nums"
            : "text-2xl font-bold text-white tabular-nums"
        }
      >
        {value}
      </div>
      <div className="text-xs text-zinc-500 mt-0.5">{label}</div>
    </div>
  );
}
