import { Suspense } from "react";
import Link from "next/link";
import { Activity, Clock, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getUserTier, getUserProfile } from "@/lib/user";
import { canAccessFeature, type ExperienceLevel } from "@/lib/tier";
import SignalFeed from "@/components/signals/SignalFeed";
import type { Signal } from "@/components/signals/SignalCard";
import SubscribeGate from "@/components/ui/SubscribeGate";
import SectorHeatmap from "@/components/dashboard/SectorHeatmap";
import SectionHeader from "@/components/ui/SectionHeader";
import SkipTrialBanner from "@/components/SkipTrialBanner";

export const revalidate = 60;

const ENGINE_CUTOFF = "2026-06-22T00:00:00Z";

type MonthBucket = { month: string; wins: number; losses: number; winRate: number };

type PlatformAccuracy = {
  overallWinRate: number;
  totalResolved: number;
  totalWins: number;
  totalLosses: number;
  byAssetClass: { asset_type: string; winRate: number; resolved: number }[];
  byMonth: MonthBucket[];
  yesterday: { wins: number; losses: number; winRate: number; resolved: number } | null;
};

async function fetchPlatformAccuracy(): Promise<PlatformAccuracy | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("signals")
    .select("asset_type, outcome, created_at")
    .in("outcome", ["WIN", "LOSS"])
    .gte("created_at", ENGINE_CUTOFF);

  if (error || !data || data.length === 0) {
    return null;
  }

  let totalWins = 0;
  let totalLosses = 0;
  const assetGrouped = new Map<string, { wins: number; losses: number }>();
  const monthGrouped = new Map<string, { wins: number; losses: number }>();

  const now = new Date();
  const yesterdayStr = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  let ydayWins = 0;
  let ydayLosses = 0;

  for (const row of data) {
    const isWin = row.outcome === "WIN";
    if (isWin) totalWins++;
    else totalLosses++;

    const assetKey = row.asset_type ?? "unknown";
    const ag = assetGrouped.get(assetKey) ?? { wins: 0, losses: 0 };
    if (isWin) ag.wins++;
    else ag.losses++;
    assetGrouped.set(assetKey, ag);

    const monthKey = (row.created_at as string).slice(0, 7);
    const mg = monthGrouped.get(monthKey) ?? { wins: 0, losses: 0 };
    if (isWin) mg.wins++;
    else mg.losses++;
    monthGrouped.set(monthKey, mg);

    const dayStr = (row.created_at as string).slice(0, 10);
    if (dayStr === yesterdayStr) {
      if (isWin) ydayWins++;
      else ydayLosses++;
    }
  }

  const totalResolved = totalWins + totalLosses;
  if (totalResolved < 5) return null;
  const overallWinRate = totalWins / totalResolved;

  const byAssetClass = Array.from(assetGrouped.entries()).map(([asset_type, g]) => {
    const resolved = g.wins + g.losses;
    return { asset_type, winRate: resolved > 0 ? g.wins / resolved : 0, resolved };
  });

  const byMonth = Array.from(monthGrouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, g]) => {
      const resolved = g.wins + g.losses;
      return { month, wins: g.wins, losses: g.losses, winRate: resolved > 0 ? g.wins / resolved : 0 };
    });

  const ydayResolved = ydayWins + ydayLosses;
  const yesterday = ydayResolved >= 3
    ? { wins: ydayWins, losses: ydayLosses, winRate: ydayWins / ydayResolved, resolved: ydayResolved }
    : null;

  return { overallWinRate, totalResolved, totalWins, totalLosses, byAssetClass, byMonth, yesterday };
}

async function fetchSignals(): Promise<Signal[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("signals")
    .select("*")
    .eq("is_backtest", false)
    .gte("created_at", ENGINE_CUTOFF)
    .gte("confidence", 70)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    console.error("fetchSignals error:", error.message);
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
  const tier    = await getUserTier();
  const profile = await getUserProfile();
  const [signals, movers, accuracy] = await Promise.all([
    fetchSignals(),
    fetchTopMovers(),
    fetchPlatformAccuracy(),
  ]);

  const winCount  = signals.filter((s) => s.outcome === "WIN").length;
  const lossCount = signals.filter((s) => s.outcome === "LOSS").length;
  const pending   = signals.filter((s) => s.outcome === "PENDING").length;
  const resolved  = winCount + lossCount;
  const allPending = resolved === 0 && pending > 0;

  return (
    <div className="p-5 md:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Page header */}
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          <h1 className="text-xl font-semibold tracking-tight text-white">Signals</h1>
        </div>
        <p className="text-sm text-zinc-500">
          AI signals across stocks and crypto, refreshed throughout the trading day.
        </p>
      </header>

      {tier !== "free" && profile?.billing_interval !== "lifetime" && (
        <SkipTrialBanner />
      )}

      {/* Stats row */}
      {allPending ? (
        <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-400" />
            </span>
            <div>
              <p className="text-sm font-medium text-white">Signals are being analyzed</p>
              <p className="text-xs text-zinc-500 mt-0.5">{pending} signal{pending === 1 ? "" : "s"} pending resolution — win rate will appear once signals resolve</p>
              <p className="text-xs text-zinc-600 mt-0.5">Signals typically resolve within 6–24 hours depending on the time horizon.</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total signals" value={signals.length} icon={Activity} />
          <StatCard label="Pending" value={pending} icon={Clock} />
          <StatCard label="Wins" value={winCount} color="green" icon={TrendingUp} />
          <StatCard label="Losses" value={lossCount} color="red" icon={TrendingDown} />
        </div>
      )}

      {/* Platform accuracy */}
      {accuracy && (
        <section>
          <SectionHeader divider className="mb-4">Signal track record</SectionHeader>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {/* Overall */}
            <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl px-5 py-4">
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">Overall</div>
              <div className="flex items-baseline gap-2">
                <span className={`text-2xl font-bold tabular-nums ${rateColor(accuracy.overallWinRate)}`}>
                  {(accuracy.overallWinRate * 100).toFixed(1)}%
                </span>
                <span className="text-xs text-zinc-500">win rate · {accuracy.totalResolved} signals</span>
              </div>
              <div className="text-xs text-zinc-500 mt-1">
                {accuracy.totalWins}W – {accuracy.totalLosses}L
              </div>
            </div>

            {/* Yesterday */}
            {accuracy.yesterday && (
              <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl px-5 py-4">
                <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">Yesterday</div>
                <div className="flex items-baseline gap-2">
                  <span className={`text-2xl font-bold tabular-nums ${rateColor(accuracy.yesterday.winRate)}`}>
                    {(accuracy.yesterday.winRate * 100).toFixed(0)}%
                  </span>
                  <span className="text-xs text-zinc-500">win rate · {accuracy.yesterday.resolved} signals</span>
                </div>
                <div className="text-xs text-zinc-500 mt-1">
                  {accuracy.yesterday.wins}W – {accuracy.yesterday.losses}L
                </div>
              </div>
            )}

            {/* By asset class */}
            <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl px-5 py-4">
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">By asset</div>
              <div className="space-y-1.5">
                {accuracy.byAssetClass.map((a) => (
                  <div key={a.asset_type} className="flex items-baseline justify-between">
                    <span className="text-xs text-zinc-400 capitalize">{a.asset_type}</span>
                    <div className="flex items-baseline gap-1.5">
                      <span className={`text-sm font-semibold tabular-nums ${rateColor(a.winRate)}`}>
                        {(a.winRate * 100).toFixed(1)}%
                      </span>
                      <span className="text-[10px] text-zinc-600">({a.resolved} signal{a.resolved === 1 ? "" : "s"})</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Month over month */}
            {accuracy.byMonth.length > 0 && (
              <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl px-5 py-4 sm:col-span-2 lg:col-span-3">
                <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">Month over month</div>
                <div className="flex gap-4 overflow-x-auto scrollbar-none">
                  {accuracy.byMonth.map((m) => {
                    const monthResolved = m.wins + m.losses;
                    return (
                      <div key={m.month} className="flex-shrink-0 min-w-[80px]">
                        <div className="text-xs text-zinc-400 font-mono">{m.month}</div>
                        <div className={`text-lg font-bold tabular-nums ${rateColor(m.winRate)}`}>
                          {(m.winRate * 100).toFixed(0)}%
                        </div>
                        <div className="text-[10px] text-zinc-600">{m.wins}W – {m.losses}L · {monthResolved} signals</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Top movers */}
      {movers.length > 0 && (
        <section>
          <SectionHeader divider className="mb-4">Top movers (24h)</SectionHeader>
          <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
            {movers.map((m) => {
              const up = (m.change_24h ?? 0) >= 0;
              return (
                <Link
                  key={`${m.asset_type}:${m.identifier}`}
                  href={`/dashboard/asset/${m.asset_type}/${m.identifier}`}
                  className="group flex-shrink-0 bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl px-4 py-3 flex flex-col gap-1.5 min-w-[120px] hover:bg-white/[0.05] hover:border-white/[0.1] transition-all"
                >
                  <span className="font-mono text-xs font-semibold text-white truncate">
                    {m.identifier}
                  </span>
                  <span
                    className={`flex items-center gap-1 text-sm font-semibold tabular-nums ${
                      up ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {up ? (
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    ) : (
                      <ArrowDownRight className="h-3.5 w-3.5" />
                    )}
                    {up ? "+" : ""}
                    {Number(m.change_24h).toFixed(2)}%
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Signal feed — the product, surfaced above supporting analytics */}
      <section>
        <SectionHeader divider className="mb-4">Latest signals</SectionHeader>
        <SignalFeed
          signals={signals}
          canLogPosition={canAccessFeature(tier, "portfolio")}
          experienceLevel={profile?.trading_experience as ExperienceLevel | undefined}
        />
      </section>

      {/* Sector heatmap (supporting context, below the feed) */}
      <Suspense
        fallback={
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-6 h-40 animate-pulse" />
        }
      >
        <SectorHeatmap />
      </Suspense>
    </div>
  );
}

function rateColor(rate: number): string {
  if (rate >= 0.55) return "text-emerald-400";
  if (rate >= 0.45) return "text-amber-400";
  return "text-red-400";
}

function StatCard({
  label,
  value,
  color,
  icon: Icon,
}: {
  label: string;
  value: number;
  color?: "green" | "red";
  icon: React.ComponentType<{ className?: string }>;
}) {
  const valueColor =
    color === "green"
      ? "text-emerald-400"
      : color === "red"
      ? "text-red-400"
      : "text-white";

  const badge =
    color === "green"
      ? "border-emerald-700/30 bg-emerald-500/10 text-emerald-400"
      : color === "red"
      ? "border-red-700/30 bg-red-500/10 text-red-400"
      : "border-white/10 bg-white/[0.04] text-zinc-400";

  return (
    <div className="group bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl px-5 py-4 hover:bg-white/[0.05] hover:border-white/[0.1] transition-all">
      <div className="flex items-center justify-between mb-3">
        <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border ${badge}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className={`text-2xl font-bold tabular-nums ${valueColor}`}>{value}</div>
      <div className="text-xs text-zinc-500 mt-1">{label}</div>
    </div>
  );
}
