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

  const [stockRes, cryptoRes] = await Promise.all([
    supabase
      .from("raw_prices")
      .select("identifier, asset_type, price, change_24h")
      .eq("asset_type", "stock")
      .not("change_24h", "is", null)
      .neq("identifier", "MARKET_SENTIMENT")
      .order("captured_at", { ascending: false })
      .limit(50),
    supabase
      .from("raw_prices")
      .select("identifier, asset_type, price, change_24h")
      .eq("asset_type", "crypto")
      .not("change_24h", "is", null)
      .order("captured_at", { ascending: false })
      .limit(50),
  ]);

  const allData = [...(stockRes.data ?? []), ...(cryptoRes.data ?? [])];

  const seen = new Map<string, typeof allData[0]>();
  for (const row of allData) {
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
    <div className="p-5 md:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total signals" value={signals.length} />
        <StatCard label="Pending" value={pending} />
        <StatCard label="Wins" value={winCount} color="green" />
        <StatCard label="Losses" value={lossCount} color="red" />
      </div>

      {/* Platform accuracy — only show when win rate is credible */}
      {accuracy && accuracy.overallWinRate >= 0.5 && (
        <section>
          <SectionHeader>Platform accuracy</SectionHeader>
          <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl px-5 py-4 flex flex-wrap gap-x-6 gap-y-3 items-baseline">
            <div>
              <span
                className={`text-2xl font-bold tabular-nums ${
                  accuracy.overallWinRate * 100 >= 60
                    ? "text-emerald-400"
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
            <span className="text-white/10">|</span>
            {accuracy.byAssetClass.map((a) => (
              <div key={a.asset_type} className="flex items-baseline gap-1.5">
                <span className="text-xs text-zinc-400 capitalize">
                  {a.asset_type}
                </span>
                <span
                  className={`text-sm font-semibold tabular-nums ${
                    a.winRate * 100 >= 60
                      ? "text-emerald-400"
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
          <SectionHeader>Top movers (24h)</SectionHeader>
          <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
            {movers.map((m) => (
              <div
                key={`${m.asset_type}:${m.identifier}`}
                className="flex-shrink-0 bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl px-4 py-3 flex flex-col gap-1 min-w-[100px]"
              >
                <span className="font-mono text-xs font-semibold text-white truncate">
                  {m.identifier}
                </span>
                <span
                  className={
                    (m.change_24h ?? 0) >= 0 ? "text-emerald-400 text-xs tabular-nums" : "text-red-400 text-xs tabular-nums"
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
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-6 h-40 animate-pulse" />
        }
      >
        <SectorHeatmap />
      </Suspense>

      {/* Signal feed */}
      <section>
        <SectionHeader>Latest signals</SectionHeader>
        <SignalFeed signals={signals} />
      </section>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.15em] text-zinc-500 mb-3">
      <span className="text-emerald-400/60">●</span>
      {children}
    </h2>
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
    <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl px-5 py-4">
      <div
        className={
          color === "green"
            ? "text-2xl font-bold text-emerald-400 tabular-nums"
            : color === "red"
            ? "text-2xl font-bold text-red-400 tabular-nums"
            : "text-2xl font-bold text-white tabular-nums"
        }
      >
        {value}
      </div>
      <div className="text-xs text-zinc-500 mt-1">{label}</div>
    </div>
  );
}
