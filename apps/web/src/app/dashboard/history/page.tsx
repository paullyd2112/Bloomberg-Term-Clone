import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getUser, getUserTier } from "@/lib/user";
import SubscribeGate from "@/components/ui/SubscribeGate";
import HistoryFilters from "./HistoryFilters";

export const revalidate = 60;

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
};

function computeReturn(sig: ResolvedSignal): number | null {
  if (!sig.price_at_signal || !sig.outcome_price || sig.price_at_signal <= 0) return null;
  const isBull = sig.direction === "BUY" || sig.direction === "YES";
  return isBull
    ? ((sig.outcome_price - sig.price_at_signal) / sig.price_at_signal) * 100
    : ((sig.price_at_signal - sig.outcome_price) / sig.price_at_signal) * 100;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatPrice(price: number | null, assetType: string): string {
  if (price == null) return "—";
  if (assetType === "prediction") return `${(price * 100).toFixed(1)}%`;
  return `$${Number(price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const HORIZON_LABEL: Record<string, string> = {
  intraday: "Intraday",
  swing: "Swing",
  longterm: "Long-term",
  before_close: "Before close",
};

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: { asset?: string; outcome?: string; horizon?: string };
}) {
  const user = await getUser();
  const tier = await getUserTier();

  if (tier === "free") {
    return <SubscribeGate message="Trade history is available on Pro and Elite plans." />;
  }

  const supabase = createClient();

  let query = supabase
    .from("signals")
    .select(
      "id, asset_type, identifier, direction, confidence, time_horizon, price_at_signal, outcome_price, outcome, created_at",
    )
    .eq("is_backtest", false)
    .neq("outcome", "PENDING")
    .order("created_at", { ascending: false })
    .limit(500);

  // Apply filters
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

  // Stats — computed from the filtered set
  const wins     = signals.filter((s) => s.outcome === "WIN");
  const losses   = signals.filter((s) => s.outcome === "LOSS");
  const neutrals = signals.filter((s) => s.outcome === "NEUTRAL");
  const total    = signals.length;
  const wl       = wins.length + losses.length;
  const winRate  = wl > 0 ? (wins.length / wl) * 100 : 0;
  const avgConf  =
    wins.length > 0
      ? wins.reduce((s, w) => s + w.confidence, 0) / wins.length
      : 0;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-bold text-white">Trade History</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Resolved AI signals — real-time track record (excludes backtests)
          </p>
        </div>
        <Link
          href="/dashboard/performance"
          className="text-xs text-zinc-400 hover:text-white border border-zinc-700 rounded-md px-3 py-1.5 transition-colors"
        >
          Performance analytics →
        </Link>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard label="Resolved" value={total} />
        <StatCard
          label="Win rate"
          value={wl > 0 ? `${winRate.toFixed(1)}%` : "—"}
          color={winRate >= 55 ? "green" : winRate > 0 ? "red" : undefined}
        />
        <StatCard label="Wins" value={wins.length} color="green" />
        <StatCard label="Losses" value={losses.length} color="red" />
        <StatCard
          label="Avg confidence (W)"
          value={wins.length > 0 ? `${avgConf.toFixed(0)}%` : "—"}
        />
      </div>

      {/* Filters */}
      <Suspense fallback={null}>
        <HistoryFilters />
      </Suspense>

      {/* Table */}
      {signals.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl py-16 text-center">
          <div className="text-3xl mb-3">📋</div>
          <p className="text-zinc-400 text-sm font-medium">No resolved signals found</p>
          <p className="text-zinc-600 text-xs mt-1">
            Adjust filters or wait for signals to resolve.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500 text-xs uppercase tracking-wider">
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
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {signals.map((sig) => {
                const ret = computeReturn(sig);
                return (
                  <tr
                    key={sig.id}
                    className="hover:bg-zinc-800/30 transition-colors"
                  >
                    <td className="py-2.5 px-3 text-zinc-400 text-xs whitespace-nowrap">
                      {formatDate(sig.created_at)}
                    </td>
                    <td className="py-2.5 px-3">
                      <Link
                        href={`/dashboard/asset/${sig.asset_type}/${encodeURIComponent(sig.identifier)}`}
                        className="font-mono font-semibold text-white hover:text-green-400 transition-colors"
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
                          sig.direction === "BUY" || sig.direction === "YES"
                            ? "text-green-400 text-xs font-semibold"
                            : sig.direction === "SELL" || sig.direction === "NO"
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
                        <span
                          className={
                            ret > 0
                              ? "text-green-400"
                              : ret < 0
                              ? "text-red-400"
                              : "text-zinc-400"
                          }
                        >
                          {ret >= 0 ? "+" : ""}
                          {ret.toFixed(2)}%
                        </span>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span
                        className={
                          sig.outcome === "WIN"
                            ? "text-xs font-semibold text-green-400"
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-zinc-700 text-xs">
        AI analysis only — not financial advice. Past signal outcomes do not
        guarantee future results.
      </p>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
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
