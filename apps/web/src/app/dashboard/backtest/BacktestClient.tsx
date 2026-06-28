"use client";

import { useState } from "react";
import type { BacktestParams, BacktestResults, EquityPoint } from "@/app/api/backtest/route";

const DEFAULT_PARAMS: BacktestParams = {
  asset_type:     "all",
  direction:      "all",
  horizon:        "all",
  min_confidence: 60,
  start_date:     new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  end_date:       new Date().toISOString().slice(0, 10),
  trade_size:     1000,
};

function EquityCurve({ points }: { points: EquityPoint[] }) {
  if (points.length < 2) {
    return (
      <div className="h-24 flex items-center justify-center text-xs text-zinc-600">
        Not enough data points
      </div>
    );
  }

  const pnls   = points.map((p) => p.pnl);
  const minPnl = Math.min(0, ...pnls);
  const maxPnl = Math.max(0, ...pnls);
  const range  = maxPnl - minPnl || 1;
  const W = 600, H = 80, PAD = 4;

  const toX = (i: number) => PAD + (i / (points.length - 1)) * (W - PAD * 2);
  const toY = (v: number) => PAD + ((maxPnl - v) / range) * (H - PAD * 2);

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(p.pnl).toFixed(1)}`)
    .join(" ");

  const zeroY = toY(0).toFixed(1);
  const lastPnl = pnls[pnls.length - 1];
  const color   = lastPnl >= 0 ? "#10b981" : "#ef4444";

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-20"
      preserveAspectRatio="none"
    >
      {/* Zero line */}
      <line x1={PAD} y1={zeroY} x2={W - PAD} y2={zeroY} stroke="rgba(255,255,255,0.12)" strokeWidth="0.5" />
      {/* Equity curve */}
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function MetricCard({
  label, value, sub, color,
}: { label: string; value: string; sub?: string; color?: "green" | "red" | "amber" }) {
  const valueClass =
    color === "green" ? "text-emerald-400" :
    color === "red"   ? "text-red-400"   :
    color === "amber" ? "text-amber-400" :
    "text-white";
  return (
    <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl px-4 py-3 hover:bg-white/[0.05] hover:border-white/[0.1] transition-all">
      <div className={`text-xl font-bold tabular-nums ${valueClass}`}>{value}</div>
      <div className="text-xs text-zinc-500 mt-0.5">{label}</div>
      {sub && <div className="text-[11px] text-zinc-600 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function BacktestClient() {
  const [params, setParams]     = useState<BacktestParams>(DEFAULT_PARAMS);
  const [results, setResults]   = useState<BacktestResults | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  function set<K extends keyof BacktestParams>(key: K, value: BacktestParams[K]) {
    setParams((p) => ({ ...p, [key]: value }));
  }

  async function run() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/backtest", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(params),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error ?? "Failed");
      }
      const data = await res.json();
      setResults(data.results);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Config panel */}
      <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-white tracking-tight">Configure backtest</h2>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {/* Asset type */}
          <div className="space-y-1">
            <label className="text-xs text-zinc-400">Asset type</label>
            <select
              value={params.asset_type}
              onChange={(e) => set("asset_type", e.target.value as BacktestParams["asset_type"])}
              className="w-full bg-white/[0.04] border border-white/[0.1] rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500/50"
            >
              <option value="all">All</option>
              <option value="stock">Stocks</option>
              <option value="crypto">Crypto</option>
            </select>
          </div>

          {/* Direction */}
          <div className="space-y-1">
            <label className="text-xs text-zinc-400">Direction</label>
            <select
              value={params.direction}
              onChange={(e) => set("direction", e.target.value as BacktestParams["direction"])}
              className="w-full bg-white/[0.04] border border-white/[0.1] rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500/50"
            >
              <option value="all">All</option>
              <option value="BUY">BUY</option>
              <option value="SELL">SELL</option>
              <option value="YES">YES</option>
              <option value="NO">NO</option>
            </select>
          </div>

          {/* Horizon */}
          <div className="space-y-1">
            <label className="text-xs text-zinc-400">Horizon</label>
            <select
              value={params.horizon}
              onChange={(e) => set("horizon", e.target.value as BacktestParams["horizon"])}
              className="w-full bg-white/[0.04] border border-white/[0.1] rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500/50"
            >
              <option value="all">All</option>
              <option value="intraday">Intraday</option>
              <option value="swing">Swing</option>
              <option value="longterm">Long-term</option>
            </select>
          </div>

          {/* Start date */}
          <div className="space-y-1">
            <label className="text-xs text-zinc-400">From</label>
            <input
              type="date"
              value={params.start_date}
              onChange={(e) => set("start_date", e.target.value)}
              className="w-full bg-white/[0.04] border border-white/[0.1] rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500/50"
            />
          </div>

          {/* End date */}
          <div className="space-y-1">
            <label className="text-xs text-zinc-400">To</label>
            <input
              type="date"
              value={params.end_date}
              onChange={(e) => set("end_date", e.target.value)}
              className="w-full bg-white/[0.04] border border-white/[0.1] rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500/50"
            />
          </div>

          {/* Trade size */}
          <div className="space-y-1">
            <label className="text-xs text-zinc-400">Trade size ($)</label>
            <input
              type="number"
              min={100}
              max={100000}
              step={100}
              value={params.trade_size}
              onChange={(e) => set("trade_size", Number(e.target.value))}
              className="w-full bg-white/[0.04] border border-white/[0.1] rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500/50"
            />
          </div>
        </div>

        {/* Confidence slider */}
        <div className="space-y-1">
          <label className="text-xs text-zinc-400">
            Min confidence — <span className="text-white font-semibold">{params.min_confidence}%</span>
          </label>
          <input
            type="range"
            min={0}
            max={95}
            step={5}
            value={params.min_confidence}
            onChange={(e) => set("min_confidence", Number(e.target.value))}
            className="w-full accent-emerald-500"
          />
          <div className="flex justify-between text-[10px] text-zinc-600">
            <span>0%</span><span>50%</span><span>95%</span>
          </div>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          onClick={run}
          disabled={loading}
          className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold px-6 py-2.5 rounded-lg text-sm transition-colors"
        >
          {loading ? "Running…" : "Run backtest →"}
        </button>
      </div>

      {/* Results */}
      {results && (
        <div className="space-y-4">
          {results.total_trades === 0 ? (
            <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl p-6 text-center text-zinc-500 text-sm">
              No resolved signals found matching these filters.
              <br />
              <span className="text-xs text-zinc-600 mt-1 block">Try widening the date range or lowering the confidence threshold.</span>
            </div>
          ) : (
            <>
              {/* Metric cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <MetricCard
                  label="Total trades"
                  value={String(results.total_trades)}
                  sub={`${results.wins}W · ${results.losses}L · ${results.neutrals}N`}
                />
                <MetricCard
                  label="Win rate"
                  value={`${results.win_rate}%`}
                  color={results.win_rate >= 55 ? "green" : results.win_rate >= 45 ? "amber" : "red"}
                />
                <MetricCard
                  label="Total P&L"
                  value={`${results.total_pnl >= 0 ? "+" : ""}$${results.total_pnl.toLocaleString()}`}
                  sub={`avg $${results.avg_pnl_per_trade} / trade`}
                  color={results.total_pnl >= 0 ? "green" : "red"}
                />
                <MetricCard
                  label="Max drawdown"
                  value={`${results.max_drawdown}%`}
                  color={results.max_drawdown < 10 ? "green" : results.max_drawdown < 20 ? "amber" : "red"}
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <MetricCard label="Best trade"  value={`+$${results.best_trade.toLocaleString()}`}  color="green" />
                <MetricCard label="Worst trade" value={`-$${Math.abs(results.worst_trade).toLocaleString()}`} color="red" />
                <MetricCard label="Avg confidence" value={`${results.avg_confidence}%`} />
                <MetricCard label="Trade size" value={`$${params.trade_size.toLocaleString()}`} />
              </div>

              {/* Equity curve */}
              <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="flex items-center gap-2.5 font-mono text-[11px] font-semibold text-zinc-500 uppercase tracking-[0.18em]">
                    <span className="text-emerald-400 text-[10px] leading-none">●</span>
                    Equity curve
                  </span>
                  <span className={`text-xs font-semibold tabular-nums ${results.total_pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {results.total_pnl >= 0 ? "+" : ""}${results.total_pnl.toLocaleString()} total
                  </span>
                </div>
                <EquityCurve points={results.equity_curve} />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
