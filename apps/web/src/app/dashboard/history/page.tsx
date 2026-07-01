import Link from "next/link";
import { Suspense } from "react";
import { History, ClipboardList, ArrowRight, TrendingUp, TrendingDown, BarChart3, Target } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getUser, getUserTier } from "@/lib/user";
import SubscribeGate from "@/components/ui/SubscribeGate";
import HistoryFilters from "./HistoryFilters";

export const revalidate = 60;

const ENGINE_CUTOFF = "2026-06-22T00:00:00Z";

type ResolvedSignal = {
  id: number;
  asset_type: string;
  identifier: string;
  direction: string;
  confidence: number;
  time_horizon: string | null;
  price_at_signal: number | null;
  outcome_price: number | null;
  outcome: "WIN" | "LOSS" | "NEUTRAL";
  created_at: string;
  is_backtest: boolean;
};

function computeReturn(sig: ResolvedSignal): number | null {
  if (!sig.price_at_signal || !sig.outcome_price || sig.price_at_signal <= 0) return null;
  const isBull = sig.direction === "BUY";
  return isBull
    ? ((sig.outcome_price - sig.price_at_signal) / sig.price_at_signal) * 100
    : ((sig.price_at_signal - sig.outcome_price) / sig.price_at_signal) * 100;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatPrice(price: number | null, assetType: string): string {
  if (price == null) return "—";
  return `$${Number(price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const HORIZON_LABEL: Record<string, string> = {
  intraday: "Intraday",
  swing: "Swing",
  longterm: "Long-term",
  before_close: "Before close",
};

type PeriodStats = {
  label: string;
  wins: number;
  losses: number;
  winRate: number;
  avgReturn: number | null;
  resolved: number;
};

function computePeriodStats(signals: ResolvedSignal[], label: string): PeriodStats {
  // Only count signals with valid entry prices in aggregate metrics
  const priced = signals.filter((s) => s.price_at_signal != null && s.price_at_signal > 0);
  const wins = priced.filter((s) => s.outcome === "WIN").length;
  const losses = priced.filter((s) => s.outcome === "LOSS").length;
  const resolved = wins + losses;
  const returns = priced.map(computeReturn).filter((r): r is number => r !== null);
  const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : null;
  return {
    label,
    wins,
    losses,
    winRate: resolved > 0 ? (wins / resolved) * 100 : 0,
    avgReturn,
    resolved,
  };
}

function getWeekKey(iso: string): string {
  const d = new Date(iso);
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
  return `W${weekNum}`;
}

function getMonthKey(iso: string): string {
  return iso.slice(0, 7);
}

function rateColor(rate: number): string {
  if (rate >= 55) return "text-emerald-400";
  if (rate >= 45) return "text-amber-400";
  return "text-red-400";
}

function returnColor(ret: number | null): string {
  if (ret === null) return "text-zinc-500";
  if (ret > 0) return "text-emerald-400";
  if (ret < 0) return "text-red-400";
  return "text-zinc-400";
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: { asset?: string; outcome?: string; horizon?: string };
}) {
  const user = await getUser();
  const tier = await getUserTier();

  if (tier === "free") {
    return <SubscribeGate message="Pleby Trade History is available on Pro and Elite plans." />;
  }

  const supabase = createClient();

  let query = supabase
    .from("signals")
    .select(
      "id, asset_type, identifier, direction, confidence, time_horizon, price_at_signal, outcome_price, outcome, created_at, is_backtest",
    )
    .neq("outcome", "PENDING")
    .gte("created_at", ENGINE_CUTOFF)
    .gte("confidence", 70)
    .order("created_at", { ascending: false })
    .limit(1000);

  const assetFilter   = searchParams.asset;
  const outcomeFilter = searchParams.outcome;
  const horizonFilter = searchParams.horizon;

  if (assetFilter && assetFilter !== "all") {
    query = query.eq("asset_type", assetFilter);
  }
  if (outcomeFilter && outcomeFilter !== "all") {
    query = query.eq("outcome", outcomeFilter);
  }
  if (horizonFilter && horizonFilter !== "all") {
    query = query.eq("time_horizon", horizonFilter);
  }

  const { data, error } = await query;
  if (error) console.error("History query error:", error.message);

  const signals = (data ?? []) as ResolvedSignal[];

  // Only include signals with valid entry prices in aggregate metrics
  const pricedSignals = signals.filter((s) => s.price_at_signal != null && s.price_at_signal > 0);
  const wins     = pricedSignals.filter((s) => s.outcome === "WIN");
  const losses   = pricedSignals.filter((s) => s.outcome === "LOSS");
  const total    = pricedSignals.length;
  const wl       = wins.length + losses.length;
  const winRate  = wl > 0 ? (wins.length / wl) * 100 : 0;
  const avgConf  = total > 0 ? pricedSignals.reduce((s, w) => s + w.confidence, 0) / total : 0;

  const allReturns = pricedSignals.map(computeReturn).filter((r): r is number => r !== null);
  const avgReturn  = allReturns.length > 0 ? allReturns.reduce((a, b) => a + b, 0) / allReturns.length : null;

  // --- YTD ---
  const now = new Date();
  const ytdStart = `${now.getFullYear()}-01-01`;
  const ytdSignals = signals.filter((s) => s.created_at >= ytdStart);
  const ytdStats = computePeriodStats(ytdSignals, "YTD");

  // --- Month over month ---
  const monthBuckets = new Map<string, ResolvedSignal[]>();
  for (const s of signals) {
    const key = getMonthKey(s.created_at);
    const arr = monthBuckets.get(key) ?? [];
    arr.push(s);
    monthBuckets.set(key, arr);
  }
  const monthStats = Array.from(monthBuckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, sigs]) => computePeriodStats(sigs, month));

  // --- Week over week ---
  const weekBuckets = new Map<string, ResolvedSignal[]>();
  for (const s of signals) {
    const key = getWeekKey(s.created_at);
    const arr = weekBuckets.get(key) ?? [];
    arr.push(s);
    weekBuckets.set(key, arr);
  }
  const weekStats = Array.from(weekBuckets.entries())
    .sort(([a], [b]) => {
      const numA = parseInt(a.slice(1));
      const numB = parseInt(b.slice(1));
      return numA - numB;
    })
    .map(([week, sigs]) => computePeriodStats(sigs, week));

  // --- By asset class ---
  const assetBuckets = new Map<string, ResolvedSignal[]>();
  for (const s of signals) {
    const key = s.asset_type;
    const arr = assetBuckets.get(key) ?? [];
    arr.push(s);
    assetBuckets.set(key, arr);
  }
  const assetStats = Array.from(assetBuckets.entries())
    .map(([type, sigs]) => computePeriodStats(sigs, type));

  return (
    <div className="p-5 md:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-700/30 bg-emerald-500/10 text-emerald-400">
              <History className="h-4 w-4" />
            </span>
            <h1 className="text-xl font-semibold tracking-tight text-white">Pleby Trade History</h1>
          </div>
          <p className="text-sm text-zinc-500">
            Full signal track record — live trades and backtests since engine v2 launch.
          </p>
        </div>
        <Link
          href="/dashboard/performance"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-300 hover:text-white border border-white/[0.1] hover:border-white/20 bg-white/[0.03] rounded-lg px-3 py-1.5 transition-colors"
        >
          Your performance
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {/* Top-level stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard label="Resolved" value={wl} icon={Target} />
        <StatCard
          label="Win rate"
          value={wl > 0 ? `${winRate.toFixed(1)}% (${wl})` : "—"}
          color={winRate >= 55 ? "green" : winRate > 0 ? "red" : undefined}
          icon={BarChart3}
        />
        <StatCard label="Wins" value={wins.length} color="green" icon={TrendingUp} />
        <StatCard label="Losses" value={losses.length} color="red" icon={TrendingDown} />
        <StatCard
          label="Avg confidence"
          value={total > 0 ? `${avgConf.toFixed(0)}%` : "—"}
          icon={Target}
        />
      </div>

      {/* YTD + By Asset */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {/* YTD */}
        <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl px-5 py-4">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">Year to date</div>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-bold tabular-nums ${rateColor(ytdStats.winRate)}`}>
              {ytdStats.resolved > 0 ? `${ytdStats.winRate.toFixed(1)}%` : "—"}
            </span>
            <span className="text-xs text-zinc-500">win rate · {ytdStats.resolved} signals</span>
          </div>
          <div className="text-xs text-zinc-500 mt-1">
            {ytdStats.wins}W – {ytdStats.losses}L
          </div>
          {ytdStats.avgReturn !== null && (
            <div className={`text-xs mt-1 ${returnColor(ytdStats.avgReturn)}`}>
              Avg return: {ytdStats.avgReturn >= 0 ? "+" : ""}{ytdStats.avgReturn.toFixed(2)}% per trade
            </div>
          )}
        </div>

        {/* By asset class */}
        <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl px-5 py-4">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">By asset class</div>
          <div className="space-y-2">
            {assetStats.map((a) => (
              <div key={a.label} className="flex items-baseline justify-between">
                <span className="text-xs text-zinc-400 capitalize">{a.label}</span>
                <div className="flex items-baseline gap-2">
                  <span className={`text-sm font-semibold tabular-nums ${rateColor(a.winRate)}`}>
                    {a.resolved > 0 ? `${a.winRate.toFixed(1)}%` : "—"}
                  </span>
                  <span className="text-[10px] text-zinc-600">
                    {a.wins}W–{a.losses}L · {a.resolved} signals
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Avg return by asset */}
        <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl px-5 py-4">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">Avg return by asset</div>
          <div className="space-y-2">
            {assetStats.map((a) => (
              <div key={a.label} className="flex items-baseline justify-between">
                <span className="text-xs text-zinc-400 capitalize">{a.label}</span>
                <span className={`text-sm font-semibold tabular-nums ${returnColor(a.avgReturn)}`}>
                  {a.avgReturn !== null ? `${a.avgReturn >= 0 ? "+" : ""}${a.avgReturn.toFixed(2)}%` : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Month over month */}
      {monthStats.length > 0 && (
        <section>
          <SectionHeader>Month over month</SectionHeader>
          <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
            {monthStats.map((m) => (
              <div key={m.label} className="flex-shrink-0 bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl px-4 py-3 min-w-[110px]">
                <div className="text-xs text-zinc-400 font-mono">{m.label}</div>
                <div className={`text-lg font-bold tabular-nums ${rateColor(m.winRate)}`}>
                  {m.resolved > 0 ? `${m.winRate.toFixed(0)}%` : "—"}
                </div>
                <div className="text-[10px] text-zinc-600">{m.wins}W – {m.losses}L · {m.resolved} signals</div>
                {m.avgReturn !== null && (
                  <div className={`text-[10px] tabular-nums ${returnColor(m.avgReturn)}`}>
                    {m.avgReturn >= 0 ? "+" : ""}{m.avgReturn.toFixed(2)}%/trade
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Week over week */}
      {weekStats.length > 0 && (
        <section>
          <SectionHeader>Week over week</SectionHeader>
          <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
            {weekStats.map((w) => (
              <div key={w.label} className="flex-shrink-0 bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl px-4 py-3 min-w-[100px]">
                <div className="text-xs text-zinc-400 font-mono">{w.label}</div>
                <div className={`text-lg font-bold tabular-nums ${rateColor(w.winRate)}`}>
                  {w.resolved > 0 ? `${w.winRate.toFixed(0)}%` : "—"}
                </div>
                <div className="text-[10px] text-zinc-600">{w.wins}W – {w.losses}L · {w.resolved} signals</div>
                {w.avgReturn !== null && (
                  <div className={`text-[10px] tabular-nums ${returnColor(w.avgReturn)}`}>
                    {w.avgReturn >= 0 ? "+" : ""}{w.avgReturn.toFixed(2)}%/trade
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Filters */}
      <Suspense fallback={null}>
        <HistoryFilters />
      </Suspense>

      {/* Signal table */}
      <section>
        <SectionHeader>All resolved signals</SectionHeader>
        {signals.length === 0 ? (
          <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl py-16 text-center flex flex-col items-center gap-3">
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-700/30 bg-emerald-500/10 text-emerald-400">
              <ClipboardList className="h-6 w-6" />
            </span>
            <p className="text-zinc-300 text-sm font-medium">No resolved signals found</p>
            <p className="text-zinc-500 text-xs max-w-xs leading-relaxed">
              Adjust filters or wait for signals to resolve.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.08] text-zinc-500 text-xs uppercase tracking-wider">
                  <th className="text-left py-2 px-3 font-medium">Date</th>
                  <th className="text-left py-2 px-3 font-medium">Asset</th>
                  <th className="text-left py-2 px-3 font-medium">Type</th>
                  <th className="text-left py-2 px-3 font-medium">Dir</th>
                  <th className="text-right py-2 px-3 font-medium">Conf</th>
                  <th className="text-right py-2 px-3 font-medium">Entry</th>
                  <th className="text-right py-2 px-3 font-medium">Exit</th>
                  <th className="text-right py-2 px-3 font-medium">Return</th>
                  <th className="text-center py-2 px-3 font-medium">Outcome</th>
                  <th className="text-left py-2 px-3 font-medium">Horizon</th>
                  <th className="text-center py-2 px-3 font-medium">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {signals.map((sig) => {
                  const ret = computeReturn(sig);
                  return (
                    <tr key={sig.id} className="hover:bg-white/[0.04] transition-colors">
                      <td className="py-2.5 px-3 text-zinc-400 text-xs whitespace-nowrap">
                        {formatDate(sig.created_at)}
                      </td>
                      <td className="py-2.5 px-3">
                        <Link
                          href={`/dashboard/asset/${sig.asset_type}/${encodeURIComponent(sig.identifier)}`}
                          className="font-mono font-semibold text-white hover:text-emerald-400 transition-colors"
                        >
                          {sig.identifier}
                        </Link>
                      </td>
                      <td className="py-2.5 px-3 text-zinc-500 text-xs capitalize">
                        {sig.asset_type}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={
                            sig.direction === "BUY"
                              ? "text-emerald-400 text-xs font-semibold"
                              : sig.direction === "SELL"
                              ? "text-red-400 text-xs font-semibold"
                              : "text-zinc-400 text-xs font-semibold"
                          }
                        >
                          {sig.direction}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-zinc-300 tabular-nums text-xs">
                        {sig.confidence}%
                      </td>
                      <td className="py-2.5 px-3 text-right text-zinc-400 font-mono text-xs tabular-nums">
                        {formatPrice(sig.price_at_signal, sig.asset_type)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-zinc-400 font-mono text-xs tabular-nums">
                        {formatPrice(sig.outcome_price, sig.asset_type)}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-xs font-semibold">
                        {ret != null ? (
                          <span className={ret > 0 ? "text-emerald-400" : ret < 0 ? "text-red-400" : "text-zinc-400"}>
                            {ret >= 0 ? "+" : ""}{ret.toFixed(2)}%
                          </span>
                        ) : (
                          <span className="text-zinc-600">N/A</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={
                            sig.outcome === "WIN"
                              ? "text-xs font-semibold text-emerald-400"
                              : sig.outcome === "LOSS"
                              ? "text-xs font-semibold text-red-400"
                              : "text-xs font-semibold text-zinc-400"
                          }
                        >
                          {sig.outcome}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-zinc-500 text-xs whitespace-nowrap">
                        {HORIZON_LABEL[sig.time_horizon ?? ""] ?? sig.time_horizon ?? "—"}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${sig.is_backtest ? "text-blue-400 bg-blue-500/10" : "text-emerald-400 bg-emerald-500/10"}`}>
                          {sig.is_backtest ? "BT" : "Live"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-zinc-700 text-xs">
        AI analysis only — not financial advice. Past signal outcomes do not
        guarantee future results. Backtest results reflect simulated trades on historical data.
      </p>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-500 mb-4">
      <span className="text-emerald-400">●</span>
      <span className="h-px w-8 bg-white/15" />
      <span>{children}</span>
    </h2>
  );
}

function StatCard({
  label,
  value,
  color,
  icon: Icon,
}: {
  label: string;
  value: number | string;
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
    <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl px-4 py-3 hover:bg-white/[0.05] hover:border-white/[0.1] transition-all">
      <div className="flex items-center justify-between mb-2">
        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border ${badge}`}>
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <div className={`text-xl font-bold tabular-nums ${valueColor}`}>{value}</div>
      <div className="text-[10px] text-zinc-500 mt-0.5">{label}</div>
    </div>
  );
}
