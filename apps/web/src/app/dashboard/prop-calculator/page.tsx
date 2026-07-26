"use client";

import { useState } from "react";
import { Calculator, Shield, Activity, Target, AlertTriangle, TrendingDown, Gauge } from "lucide-react";
import { clsx } from "clsx";
import RiskGauge from "@/components/prop/RiskGauge";
import ChallengeProgress from "@/components/prop/ChallengeProgress";
import RulesPanel from "@/components/prop/RulesPanel";

type ProfileOption = { id: string; label: string; account_size: number };

type SizingResult = {
  profile: {
    id: string;
    label: string;
    account_size: number;
    max_overall_drawdown: number;
    max_overall_drawdown_pct: string;
    max_daily_loss: number;
    risk_per_trade: number;
    daily_kill_switch: number;
  };
  sizing: {
    risk_per_trade: number;
    max_position_risk_pct: string;
    max_concurrent_positions: number;
    max_signals_per_day: number;
    stop_method: string;
  };
  simulation: {
    survival_rate: number;
    avg_final_balance: number;
    avg_max_drawdown: number;
    worst_drawdown: number;
    num_runs: number;
    breach_breakdown: Record<string, number>;
  };
  estimated_days_to_pass: number | null;
  available_profiles: ProfileOption[];
};

const DEFAULT_PROFILES: ProfileOption[] = [
  { id: "retail_standard", label: "Retail $10K", account_size: 10_000 },
  { id: "25k_prop_conservative", label: "Prop $25K", account_size: 25_000 },
  { id: "50k_prop_moderate", label: "Prop $50K", account_size: 50_000 },
  { id: "150k_prop_boss", label: "Prop $150K", account_size: 150_000 },
];

const ACCOUNT_PRESETS = [10_000, 25_000, 50_000, 100_000, 150_000, 200_000];

export default function PropCalculatorPage() {
  const [accountSize, setAccountSize] = useState(50_000);
  const [riskProfile, setRiskProfile] = useState("50k_prop_moderate");
  const [result, setResult] = useState<SizingResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function calculate() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/calculate-sizing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_size: accountSize,
          risk_profile: riskProfile,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Calculation failed");
        return;
      }
      setResult(await res.json());
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  const rules = result
    ? [
        {
          label: "Max Overall Drawdown",
          status: (result.simulation.worst_drawdown / result.profile.max_overall_drawdown >= 0.8
            ? "warning"
            : result.simulation.worst_drawdown >= result.profile.max_overall_drawdown
            ? "breach"
            : "ok") as "ok" | "warning" | "breach",
          current: `$${result.simulation.worst_drawdown.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
          limit: `$${result.profile.max_overall_drawdown.toLocaleString()}`,
        },
        {
          label: "Max Daily Loss",
          status: "ok" as const,
          current: `$${result.sizing.risk_per_trade.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
          limit: `$${result.profile.max_daily_loss.toLocaleString()}`,
        },
        {
          label: "Daily Kill Switch",
          status: "ok" as const,
          current: "$0",
          limit: `$${result.profile.daily_kill_switch.toLocaleString()}`,
        },
        {
          label: "Max Concurrent Positions",
          status: "ok" as const,
          current: "0",
          limit: `${result.sizing.max_concurrent_positions}`,
        },
        {
          label: "Daily Signal Cap",
          status: "ok" as const,
          current: "0",
          limit: `${result.sizing.max_signals_per_day}`,
        },
      ]
    : [];

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 md:py-8">
      {/* Header */}
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#00d4aa]/30 bg-[#00d4aa]/10 text-[#00d4aa]">
            <Gauge className="h-4 w-4" />
          </span>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-white">Prop Trading Desk</h1>
            <p className="text-[11px] text-zinc-500 font-mono">Monte Carlo simulation · Risk management · Position sizing</p>
          </div>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md border bg-amber-500/15 text-amber-400 border-amber-700/40 tracking-wider uppercase">
          Elite
        </span>
      </header>

      {/* Profile selector — compact pill row */}
      <div className="flex items-center gap-2 mb-5 overflow-x-auto scrollbar-none pb-1">
        {DEFAULT_PROFILES.map((p) => (
          <button
            key={p.id}
            onClick={() => { setRiskProfile(p.id); setAccountSize(p.account_size); }}
            className={clsx(
              "px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all border",
              riskProfile === p.id
                ? "border-[#00d4aa]/40 bg-[#00d4aa]/10 text-white"
                : "border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:text-white hover:border-white/[0.15]",
            )}
          >
            {p.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 flex-shrink-0">
          <span className="text-[10px] text-zinc-600 font-mono">Custom:</span>
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 text-xs">$</span>
            <input
              type="number"
              min={5000}
              max={500000}
              step={1000}
              value={accountSize}
              onChange={(e) => setAccountSize(Number(e.target.value))}
              className="w-24 bg-white/[0.04] border border-white/[0.1] rounded-lg pl-6 pr-2 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-[#00d4aa]/50 transition-colors tabular-nums"
            />
          </div>
        </div>
      </div>

      {/* Calculate button */}
      <button
        onClick={calculate}
        disabled={loading}
        className={clsx(
          "w-full py-3 rounded-xl text-sm font-bold transition-all mb-6",
          result
            ? "bg-white/[0.04] border border-white/[0.1] text-zinc-300 hover:bg-white/[0.06] hover:text-white"
            : "bg-[#00d4aa] hover:bg-[#00d4aa]/90 text-black",
          loading && "opacity-40 cursor-not-allowed",
        )}
      >
        {loading ? "Running simulation..." : result ? "Recalculate" : "Run Monte Carlo Simulation"}
      </button>

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      {/* Results — the cockpit */}
      {result && (
        <div className="space-y-5">
          {/* Risk gauges row */}
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <RiskGauge
                label="Survival"
                value={Math.round(result.simulation.survival_rate * 100)}
                max={100}
                unit=""
                inverse
              />
              <RiskGauge
                label="Max DD Used"
                value={Math.round(result.simulation.worst_drawdown)}
                max={result.profile.max_overall_drawdown}
              />
              <RiskGauge
                label="Daily Risk"
                value={Math.round(result.sizing.risk_per_trade)}
                max={result.profile.max_daily_loss}
              />
              <RiskGauge
                label="Position Cap"
                value={result.sizing.max_concurrent_positions}
                max={6}
                unit=""
              />
            </div>
          </div>

          {/* Two-column: challenge progress + rules */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <ChallengeProgress
              accountSize={result.profile.account_size}
              currentBalance={result.simulation.avg_final_balance}
              profitTarget={result.profile.account_size * 0.1}
              maxDrawdown={result.profile.max_overall_drawdown}
              daysElapsed={result.estimated_days_to_pass ?? 0}
              maxDays={30}
              worstDrawdown={result.simulation.worst_drawdown}
            />
            <RulesPanel
              rules={rules}
              profileLabel={result.profile.label}
            />
          </div>

          {/* Position sizing details */}
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-[#00d4aa] text-[10px] leading-none">●</span>
              <h3 className="text-[11px] font-mono font-semibold uppercase tracking-[0.15em] text-zinc-500">
                Position Sizing
              </h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <MetricTile
                label="Risk / Trade"
                value={`$${result.sizing.risk_per_trade.toFixed(0)}`}
                sub={`${result.sizing.max_position_risk_pct}% of account`}
              />
              <MetricTile
                label="Max Positions"
                value={`${result.sizing.max_concurrent_positions}`}
                sub="concurrent"
              />
              <MetricTile
                label="Signals / Day"
                value={`${result.sizing.max_signals_per_day}`}
                sub="cap"
              />
              <MetricTile
                label="Stop Method"
                value={result.sizing.stop_method.split("_").map(w => w[0].toUpperCase() + w.slice(1)).join(" ")}
                sub="risk engine"
              />
            </div>
          </div>

          {/* Monte Carlo stats */}
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-[#4f8cff] text-[10px] leading-none">●</span>
              <h3 className="text-[11px] font-mono font-semibold uppercase tracking-[0.15em] text-zinc-500">
                Simulation Results ({result.simulation.num_runs} runs)
              </h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <MetricTile
                label="Survival Rate"
                value={`${(result.simulation.survival_rate * 100).toFixed(1)}%`}
                sub={result.simulation.survival_rate >= 0.5 ? "passing" : "failing"}
                color={result.simulation.survival_rate >= 0.5 ? "green" : "red"}
              />
              <MetricTile
                label="Avg Balance"
                value={`$${result.simulation.avg_final_balance.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                sub="final"
              />
              <MetricTile
                label="Avg Max DD"
                value={`$${result.simulation.avg_max_drawdown.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                sub="peak-to-trough"
                color="amber"
              />
              {result.estimated_days_to_pass && (
                <MetricTile
                  label="Est. Days"
                  value={`~${result.estimated_days_to_pass}`}
                  sub="to pass challenge"
                />
              )}
            </div>

            {Object.keys(result.simulation.breach_breakdown).length > 0 && (
              <div className="mt-4 pt-4 border-t border-white/[0.06]">
                <div className="text-[10px] text-zinc-600 uppercase tracking-wider font-mono mb-2">Breach Breakdown</div>
                <div className="flex flex-wrap gap-3">
                  {Object.entries(result.simulation.breach_breakdown).map(([reason, count]) => (
                    <div key={reason} className="flex items-center gap-2 bg-red-500/5 border border-red-500/10 rounded-lg px-3 py-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                      <span className="text-[11px] text-zinc-400 font-mono">
                        {reason.replace(/_/g, " ")}
                      </span>
                      <span className="text-[11px] text-red-400 font-mono font-bold">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Disclaimer */}
          <p className="text-zinc-700 text-[10px] text-center">
            Simulation uses random signals with no predictive edge as a baseline. Not financial advice.
          </p>
        </div>
      )}

      {/* Empty state */}
      {!result && !loading && (
        <div className="text-center py-20 flex flex-col items-center gap-4">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl border border-[#00d4aa]/20 bg-[#00d4aa]/5 text-[#00d4aa]">
            <Gauge className="h-7 w-7" />
          </div>
          <div>
            <p className="text-sm text-zinc-300 font-medium mb-1">Select a profile and run the simulation</p>
            <p className="text-xs text-zinc-600 max-w-xs mx-auto leading-relaxed">
              The Monte Carlo engine simulates thousands of trade sequences against your prop firm&apos;s rules to find optimal position sizing.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricTile({
  label,
  value,
  sub,
  color = "default",
}: {
  label: string;
  value: string;
  sub: string;
  color?: "default" | "green" | "red" | "amber";
}) {
  const valueColors = {
    default: "text-white",
    green: "text-[#00d4aa]",
    red: "text-red-400",
    amber: "text-amber-400",
  };

  return (
    <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
      <div className="text-[9px] text-zinc-600 uppercase tracking-wider font-mono mb-1">{label}</div>
      <div className={clsx("text-base font-bold tabular-nums font-mono", valueColors[color])}>{value}</div>
      <div className="text-[10px] text-zinc-600 mt-0.5">{sub}</div>
    </div>
  );
}
