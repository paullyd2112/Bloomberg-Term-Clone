import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUser, getUserTier } from "@/lib/user";
import { canAccessFeature } from "@/lib/tier";
import EquityCurve, { type EquityPoint } from "@/components/performance/EquityCurve";

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
};

function fmtUsd(n: number): string {
  const sign = n >= 0 ? "+" : "−";
  return `${sign}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function computeStats(closed: Position[]) {
  const wins   = closed.filter((p) => (p.pnl ?? 0) > 0);
  const losses = closed.filter((p) => (p.pnl ?? 0) < 0);

  const realized   = closed.reduce((s, p) => s + (Number(p.pnl) || 0), 0);
  const invested   = closed.reduce((s, p) => s + Math.abs(Number(p.entry_price) * Number(p.size)), 0);
  const grossWin   = wins.reduce((s, p) => s + (Number(p.pnl) || 0), 0);
  const grossLoss  = Math.abs(losses.reduce((s, p) => s + (Number(p.pnl) || 0), 0));

  const winRate     = closed.length ? (wins.length / closed.length) * 100 : 0;
  const returnPct   = invested ? (realized / invested) * 100 : 0;
  const avgWin      = wins.length ? grossWin / wins.length : 0;
  const avgLoss     = losses.length ? grossLoss / losses.length : 0;
  const profitFactor = grossLoss ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;

  const pnls = closed.map((p) => Number(p.pnl) || 0);
  const best  = pnls.length ? Math.max(...pnls) : 0;
  const worst = pnls.length ? Math.min(...pnls) : 0;

  return {
    count: closed.length,
    wins: wins.length,
    losses: losses.length,
    realized,
    returnPct,
    winRate,
    avgWin,
    avgLoss,
    profitFactor,
    best,
    worst,
  };
}

function buildEquityCurve(closed: Position[]): EquityPoint[] {
  const sorted = [...closed]
    .filter((p) => p.closed_at)
    .sort((a, b) => new Date(a.closed_at!).getTime() - new Date(b.closed_at!).getTime());

  let cumulative = 0;
  return sorted.map((p) => {
    cumulative += Number(p.pnl) || 0;
    return { date: p.closed_at!, cumulative };
  });
}

export default async function PerformancePage() {
  const user = await getUser();
  const tier = await getUserTier();

  if (!canAccessFeature(tier, "performance")) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center space-y-4">
          <div className="text-3xl">📈</div>
          <h2 className="text-white font-semibold text-lg">Performance Analytics</h2>
          <p className="text-zinc-400 text-sm leading-relaxed">
            See your personal win rate, total return, profit factor, and equity
            curve across every trade you log. Pro and Elite only.
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

  const supabase = createClient();
  const { data: rows } = await supabase
    .from("positions")
    .select("*")
    .eq("user_id", user!.id)
    .not("closed_at", "is", null)
    .order("closed_at", { ascending: false })
    .limit(500);

  const closed = (rows ?? []) as Position[];
  const stats  = computeStats(closed);
  const curve  = buildEquityCurve(closed);

  if (closed.length === 0) {
    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
        <Header />
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl py-16 text-center">
          <div className="text-3xl mb-3">📈</div>
          <p className="text-zinc-400 text-sm font-medium">No closed trades yet</p>
          <p className="text-zinc-600 text-xs mt-1 max-w-sm mx-auto">
            Log positions in your{" "}
            <Link href="/dashboard/portfolio" className="text-green-400 hover:text-green-300">
              portfolio
            </Link>{" "}
            and close them to start building your track record.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <Header />

      {/* Headline metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Metric label="Total return" value={`${stats.returnPct >= 0 ? "+" : ""}${stats.returnPct.toFixed(1)}%`} color={stats.returnPct >= 0 ? "green" : "red"} />
        <Metric label="Realized P&L" value={fmtUsd(stats.realized)} color={stats.realized >= 0 ? "green" : "red"} />
        <Metric label="Win rate" value={`${stats.winRate.toFixed(0)}%`} sub={`${stats.wins}W · ${stats.losses}L`} />
        <Metric label="Profit factor" value={stats.profitFactor === Infinity ? "∞" : stats.profitFactor.toFixed(2)} />
      </div>

      {/* Equity curve */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Equity curve</h2>
          <span className="text-xs text-zinc-600">{stats.count} closed trades</span>
        </div>
        <EquityCurve data={curve} />
      </div>

      {/* Secondary metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Metric label="Avg win"   value={fmtUsd(stats.avgWin)}  color="green" />
        <Metric label="Avg loss"  value={fmtUsd(-stats.avgLoss)} color="red" />
        <Metric label="Best trade"  value={fmtUsd(stats.best)}  color="green" />
        <Metric label="Worst trade" value={fmtUsd(stats.worst)} color="red" />
      </div>

      <p className="text-zinc-600 text-xs">
        Based on positions you&apos;ve logged and closed. Returns are calculated
        against capital deployed per trade — not a portfolio-weighted return.
      </p>
    </div>
  );
}

function Header() {
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div>
        <h1 className="text-lg font-bold text-white">Performance</h1>
        <p className="text-xs text-zinc-500 mt-0.5">Your personal trading track record</p>
      </div>
      <Link href="/dashboard/portfolio" className="text-xs text-zinc-400 hover:text-white border border-zinc-700 rounded-md px-3 py-1.5 transition-colors">
        View positions →
      </Link>
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: "green" | "red";
}) {
  const valueCls =
    color === "green"
      ? "text-green-400"
      : color === "red"
      ? "text-red-400"
      : "text-white";
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
      <div className={`text-xl font-bold tabular-nums ${valueCls}`}>{value}</div>
      <div className="text-xs text-zinc-500 mt-0.5">{label}</div>
      {sub && <div className="text-[11px] text-zinc-600 mt-0.5 tabular-nums">{sub}</div>}
    </div>
  );
}
