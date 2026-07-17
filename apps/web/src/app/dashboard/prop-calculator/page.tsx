"use client";

import { useState } from "react";
import { Calculator, Shield, Activity, Target, AlertTriangle, TrendingDown } from "lucide-react";

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
  { id: "retail_standard", label: "Retail Standard", account_size: 10_000 },
  { id: "25k_prop_conservative", label: "25K Prop Conservative", account_size: 25_000 },
  { id: "50k_prop_moderate", label: "50K Prop Moderate", account_size: 50_000 },
  { id: "150k_prop_boss", label: "150K Prop Boss", account_size: 150_000 },
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

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 md:py-10">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-1">
        <div className="flex items-center gap-2.5 mb-0.5">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-700/30 bg-emerald-500/10 text-emerald-400">
            <Calculator className="h-4 w-4" />
          </span>
          <h1 className="text-xl font-semibold tracking-tight text-white">Prop Firm Sizing Calculator</h1>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md border bg-amber-500/15 text-amber-400 border-amber-700/40 tracking-wider">
            ELITE
          </span>
        </div>
        <p className="text-zinc-500 text-sm">
          Monte Carlo position sizing tuned to your prop firm&apos;s drawdown rules. Powered by our risk engine.
        </p>
      </div>

      {/* Input form */}
      <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl p-5 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
          {/* Account size */}
          <div>
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider block mb-2">
              Account Size
            </label>
            <div className="flex flex-wrap gap-2 mb-3">
              {ACCOUNT_PRESETS.map((amt) => (
                <button
                  key={amt}
                  onClick={() => setAccountSize(amt)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-colors border ${
                    accountSize === amt
                      ? "border-emerald-500/40 bg-emerald-500/10 text-white"
                      : "border-white/[0.1] bg-white/[0.03] text-zinc-400 hover:text-white"
                  }`}
                >
                  ${(amt / 1000).toFixed(0)}K
                </button>
              ))}
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">$</span>
              <input
                type="number"
                min={5000}
                max={500000}
                step={1000}
                value={accountSize}
                onChange={(e) => setAccountSize(Number(e.target.value))}
                className="w-full bg-white/[0.04] border border-white/[0.1] rounded-lg pl-7 pr-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 transition-colors tabular-nums"
              />
            </div>
          </div>

          {/* Risk profile */}
          <div>
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider block mb-2">
              Risk Profile
            </label>
            <div className="space-y-1.5">
              {DEFAULT_PROFILES.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setRiskProfile(p.id);
                    setAccountSize(p.account_size);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors border ${
                    riskProfile === p.id
                      ? "border-emerald-500/40 bg-emerald-500/10 text-white"
                      : "border-white/[0.1] bg-white/[0.03] text-zinc-400 hover:text-white"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

        <button
          onClick={calculate}
          disabled={loading}
          className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold py-2.5 rounded-lg transition-colors text-sm"
        >
          {loading ? "Running simulation..." : result ? "Recalculate" : "Calculate sizing"}
        </button>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Position sizing card */}
          <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl p-5">
            <div className="flex items-center gap-2.5 font-mono text-[11px] font-semibold text-zinc-500 uppercase tracking-[0.18em] mb-4">
              <span className="text-emerald-400 text-[10px] leading-none">●</span>
              Position Sizing
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <MetricCard
                label="Risk per trade"
                value={`$${result.sizing.risk_per_trade.toFixed(2)}`}
                sub={`${result.sizing.max_position_risk_pct}% of account`}
                icon={Target}
              />
              <MetricCard
                label="Max concurrent"
                value={`${result.sizing.max_concurrent_positions}`}
                sub="positions"
                icon={Activity}
              />
              <MetricCard
                label="Daily signal cap"
                value={`${result.sizing.max_signals_per_day}`}
                sub="signals/day"
                icon={Shield}
              />
            </div>
            <div className="mt-4 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
              <span className="text-xs text-zinc-500">Stop method: </span>
              <span className="text-xs text-zinc-300 font-mono">{result.sizing.stop_method}</span>
            </div>
          </div>

          {/* Drawdown limits */}
          <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl p-5">
            <div className="flex items-center gap-2.5 font-mono text-[11px] font-semibold text-zinc-500 uppercase tracking-[0.18em] mb-4">
              <span className="text-emerald-400 text-[10px] leading-none">●</span>
              Drawdown Limits
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <MetricCard
                label="Max overall DD"
                value={`$${result.profile.max_overall_drawdown.toLocaleString()}`}
                sub={`${result.profile.max_overall_drawdown_pct}% of account`}
                icon={TrendingDown}
                color="red"
              />
              <MetricCard
                label="Max daily loss"
                value={`$${result.profile.max_daily_loss.toLocaleString()}`}
                sub="hard limit"
                icon={AlertTriangle}
                color="red"
              />
              <MetricCard
                label="Daily kill switch"
                value={`$${result.profile.daily_kill_switch.toLocaleString()}`}
                sub="auto-stop"
                icon={Shield}
                color="amber"
              />
            </div>
          </div>

          {/* Monte Carlo results */}
          <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl p-5">
            <div className="flex items-center gap-2.5 font-mono text-[11px] font-semibold text-zinc-500 uppercase tracking-[0.18em] mb-4">
              <span className="text-emerald-400 text-[10px] leading-none">●</span>
              Monte Carlo Simulation ({result.simulation.num_runs} runs)
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="text-center">
                <div className={`text-2xl font-bold tabular-nums ${
                  result.simulation.survival_rate >= 0.5 ? "text-emerald-400" : "text-red-400"
                }`}>
                  {(result.simulation.survival_rate * 100).toFixed(1)}%
                </div>
                <div className="text-xs text-zinc-500 mt-1">Survival rate</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold tabular-nums text-white">
                  ${result.simulation.avg_final_balance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
                <div className="text-xs text-zinc-500 mt-1">Avg final balance</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold tabular-nums text-amber-400">
                  ${result.simulation.avg_max_drawdown.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
                <div className="text-xs text-zinc-500 mt-1">Avg max DD</div>
              </div>
              {result.estimated_days_to_pass && (
                <div className="text-center">
                  <div className="text-2xl font-bold tabular-nums text-white">
                    ~{result.estimated_days_to_pass}
                  </div>
                  <div className="text-xs text-zinc-500 mt-1">Est. days to pass</div>
                </div>
              )}
            </div>

            {Object.keys(result.simulation.breach_breakdown).length > 0 && (
              <div className="mt-4 pt-4 border-t border-white/[0.06]">
                <div className="text-xs text-zinc-500 mb-2">Breach breakdown</div>
                <div className="flex flex-wrap gap-3">
                  {Object.entries(result.simulation.breach_breakdown).map(([reason, count]) => (
                    <div key={reason} className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-red-400" />
                      <span className="text-xs text-zinc-400">
                        {reason.replace(/_/g, " ")}: <span className="text-white font-mono">{count}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Disclaimer */}
          <p className="text-zinc-700 text-xs text-center pb-4">
            Simulation uses random signals with no predictive edge as a baseline. Actual results depend on signal accuracy. Not financial advice.
          </p>
        </div>
      )}

      {!result && !loading && (
        <div className="text-center py-16 text-zinc-500 flex flex-col items-center gap-4">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-700/30 bg-emerald-500/10 text-emerald-400">
            <Calculator className="h-6 w-6" />
          </span>
          <p className="text-sm max-w-xs leading-relaxed">
            Configure your account size and risk profile above, then run the Monte Carlo simulation to get your sizing parameters.
          </p>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
  color = "default",
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ComponentType<{ className?: string }>;
  color?: "default" | "red" | "amber";
}) {
  const valueColor = color === "red" ? "text-red-400" : color === "amber" ? "text-amber-400" : "text-white";

  return (
    <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="h-3.5 w-3.5 text-zinc-500" />
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{label}</span>
      </div>
      <div className={`text-lg font-bold tabular-nums ${valueColor}`}>{value}</div>
      <div className="text-[10px] text-zinc-600">{sub}</div>
    </div>
  );
}
