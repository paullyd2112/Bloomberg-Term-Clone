import { Suspense } from "react";
import Link from "next/link";
import { Briefcase, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getUser, getUserTier } from "@/lib/user";
import { canAccessFeature } from "@/lib/tier";
import PositionRow from "@/components/portfolio/PositionRow";
import AddPositionModal from "@/components/portfolio/AddPositionModal";

export const revalidate = 60;

type Position = {
  id: number;
  asset_type: string;
  identifier: string;
  direction: string;
  entry_price: number;
  size: number;
  opened_at: string;
  closed_at: string | null;
  exit_price: number | null;
  pnl: number | null;
  current_price?: number | null;
};

async function fetchPositions(userId: string): Promise<Position[]> {
  const supabase = createClient();

  const { data: rows } = await supabase
    .from("positions")
    .select("*")
    .eq("user_id", userId)
    .order("opened_at", { ascending: false })
    .limit(100);

  if (!rows || rows.length === 0) return [];

  // Enrich open positions with current price
  const open = rows.filter((r) => !r.closed_at);
  const enriched = await Promise.all(
    open.map(async (pos) => {
      const { data } = await supabase
        .from("raw_prices")
        .select("price")
        .eq("asset_type", pos.asset_type)
        .eq("identifier", pos.identifier)
        .order("captured_at", { ascending: false })
        .limit(1)
        .single();
      return { ...pos, current_price: data?.price ?? null };
    }),
  );

  const enrichedMap = new Map(enriched.map((p) => [p.id, p]));
  return rows.map((r) => enrichedMap.get(r.id) ?? r);
}

function calcStats(positions: Position[]) {
  const open   = positions.filter((p) => !p.closed_at);
  const closed = positions.filter((p) => p.closed_at);

  const unrealized = open.reduce((sum, p) => {
    const cp = p.current_price;
    if (cp == null) return sum;
    const entry  = Number(p.entry_price);
    const size   = Number(p.size);
    const isLong = p.direction === "LONG" || p.direction === "YES";
    return sum + (isLong ? (cp - entry) * size : (entry - cp) * size);
  }, 0);

  const realized  = closed.reduce((sum, p) => sum + (Number(p.pnl) || 0), 0);
  const winCount  = closed.filter((p) => (p.pnl ?? 0) > 0).length;
  const lossCount = closed.filter((p) => (p.pnl ?? 0) < 0).length;

  return { open: open.length, closed: closed.length, unrealized, realized, winCount, lossCount };
}

export default async function PortfolioPage() {
  const user = await getUser();
  const tier = await getUserTier();

  if (!canAccessFeature(tier, "portfolio")) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-2xl p-8 text-center flex flex-col items-center gap-4">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-700/30 bg-emerald-500/10 text-emerald-400">
            <Briefcase className="h-6 w-6" />
          </span>
          <h2 className="text-white font-semibold text-lg tracking-tight">Portfolio Tracker</h2>
          <p className="text-zinc-400 text-sm leading-relaxed max-w-md">
            Log your positions, track unrealized P&amp;L, and see your win rate across closed trades. Pro and Elite only.
          </p>
          <Link
            href="/dashboard/upgrade"
            className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-sm px-5 py-2.5 rounded-lg transition-colors"
          >
            Upgrade to Pro
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  const positions = await fetchPositions(user!.id);
  const stats     = calcStats(positions);

  const openPositions   = positions.filter((p) => !p.closed_at);
  const closedPositions = positions.filter((p) => p.closed_at);

  return (
    <div className="p-5 md:p-8 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-700/30 bg-emerald-500/10 text-emerald-400">
              <Briefcase className="h-4 w-4" />
            </span>
            <h1 className="text-xl font-semibold tracking-tight text-white">Portfolio</h1>
          </div>
          <p className="text-sm text-zinc-500">
            <span className="tabular-nums text-zinc-300">{stats.open}</span> open ·{" "}
            <span className="tabular-nums text-zinc-300">{stats.closed}</span> closed
          </p>
        </div>
        <Suspense fallback={null}>
          <AddPositionModal />
        </Suspense>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Unrealized P&L"
          value={`${stats.unrealized >= 0 ? "+" : ""}$${Math.abs(stats.unrealized).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          color={stats.unrealized >= 0 ? "green" : "red"}
        />
        <StatCard
          label="Realized P&L"
          value={`${stats.realized >= 0 ? "+" : ""}$${Math.abs(stats.realized).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          color={stats.realized >= 0 ? "green" : "red"}
        />
        <StatCard label="Winning trades" value={stats.winCount} color="green" />
        <StatCard label="Losing trades"  value={stats.lossCount} color="red" />
      </div>

      {/* Open positions */}
      {openPositions.length > 0 && (
        <Section label="Open positions" count={openPositions.length}>
          {openPositions.map((p) => (
            <PositionRow key={p.id} pos={p} />
          ))}
        </Section>
      )}

      {/* Closed positions */}
      {closedPositions.length > 0 && (
        <Section label="Closed positions" count={closedPositions.length}>
          {closedPositions.map((p) => (
            <PositionRow key={p.id} pos={p} />
          ))}
        </Section>
      )}

      {positions.length === 0 && (
        <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl py-16 text-center flex flex-col items-center gap-3">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-700/30 bg-emerald-500/10 text-emerald-400">
            <Briefcase className="h-6 w-6" />
          </span>
          <p className="text-zinc-300 text-sm font-medium">No positions yet</p>
          <p className="text-zinc-500 text-xs max-w-xs leading-relaxed">
            Add your first position to start tracking P&amp;L.
          </p>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color?: "green" | "red";
}) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl px-4 py-3 hover:bg-white/[0.05] hover:border-white/[0.1] transition-all">
      <div
        className={
          color === "green"
            ? "text-xl font-bold text-emerald-400 tabular-nums"
            : color === "red"
            ? "text-xl font-bold text-red-400 tabular-nums"
            : "text-xl font-bold text-white tabular-nums"
        }
      >
        {value}
      </div>
      <div className="text-xs text-zinc-500 mt-0.5">{label}</div>
    </div>
  );
}

function Section({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2.5 mb-3">
        <span className="text-emerald-400 text-[10px] leading-none">●</span>
        <h2 className="font-mono text-[11px] font-semibold text-zinc-500 uppercase tracking-[0.18em]">{label}</h2>
        <span className="text-[11px] text-zinc-600 tabular-nums">{count}</span>
      </div>
      <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl overflow-hidden">
        {children}
      </div>
    </div>
  );
}
