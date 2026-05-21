import Link from "next/link";
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
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center space-y-4">
          <div className="text-3xl">◈</div>
          <h2 className="text-white font-semibold text-lg">Portfolio Tracker</h2>
          <p className="text-zinc-400 text-sm leading-relaxed">
            Log your positions, track unrealized P&amp;L in real-time, and see your win rate across closed trades. Pro and Elite only.
          </p>
          <Link
            href="/dashboard/upgrade"
            className="inline-block bg-green-500 hover:bg-green-400 text-black font-semibold text-sm px-5 py-2.5 rounded transition-colors"
          >
            Upgrade to Pro →
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
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-bold text-white">Portfolio</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            {stats.open} open · {stats.closed} closed
          </p>
        </div>
        <AddPositionModal />
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
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl py-16 text-center">
          <div className="text-3xl mb-3">◈</div>
          <p className="text-zinc-400 text-sm font-medium">No positions yet</p>
          <p className="text-zinc-600 text-xs mt-1">
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
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
      <div
        className={
          color === "green"
            ? "text-xl font-bold text-green-400 tabular-nums"
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
      <div className="flex items-center gap-2 mb-2">
        <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{label}</h2>
        <span className="text-xs text-zinc-700 tabular-nums">{count}</span>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        {children}
      </div>
    </div>
  );
}
