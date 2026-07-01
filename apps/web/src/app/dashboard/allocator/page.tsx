"use client";

import { useEffect, useState } from "react";
import { PieChart } from "lucide-react";

type Allocation = {
  ticker:         string;
  asset_type:     string;
  allocation_pct: number;
  reasoning:      string;
};

type AllocatorResult = {
  overall_reasoning: string;
  allocations:       Allocation[];
  generated_at?:     string;
  goal?:             string;
  risk_tolerance?:   string;
  investment_amount?: number;
};

type Goal            = "short_term" | "medium_term" | "long_term";
type RiskTolerance   = "conservative" | "moderate" | "aggressive";

const GOAL_LABELS: Record<Goal, string> = {
  short_term:  "Short term (< 3 months)",
  medium_term: "Medium term (3–12 months)",
  long_term:   "Long term (1+ years)",
};

const RISK_LABELS: Record<RiskTolerance, string> = {
  conservative: "Conservative",
  moderate:     "Moderate",
  aggressive:   "Aggressive",
};

const ASSET_TEXT: Record<string, string> = {
  stock:      "text-blue-400",
  crypto:     "text-amber-400",
};

const ASSET_LABELS: Record<string, string> = {
  stock:      "Stock",
  crypto:     "Crypto",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

export default function AllocatorPage() {
  const [result,   setResult]   = useState<AllocatorResult | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error,    setError]    = useState("");

  const [goal,      setGoal]      = useState<Goal>("medium_term");
  const [risk,      setRisk]      = useState<RiskTolerance>("moderate");
  const [amount,    setAmount]    = useState("10000");

  useEffect(() => {
    fetch("/api/allocator")
      .then(r => r.json())
      .then(data => { setResult(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function generate() {
    const amt = parseFloat(amount.replace(/,/g, ""));
    if (!amt || amt < 100) { setError("Minimum investment is $100"); return; }
    setGenerating(true);
    setError("");
    try {
      const res = await fetch("/api/allocator", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ goal, risk_tolerance: risk, investment_amount: amt }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Generation failed");
        return;
      }
      const data = await res.json();
      setResult({ ...data, goal, risk_tolerance: risk, investment_amount: amt, generated_at: new Date().toISOString() });
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setGenerating(false);
    }
  }

  const stockPct = result?.allocations.filter(a => a.asset_type === "stock").reduce((s, a) => s + a.allocation_pct, 0) ?? 0;
  const cryptoPct = result?.allocations.filter(a => a.asset_type === "crypto").reduce((s, a) => s + a.allocation_pct, 0) ?? 0;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 md:py-10">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-1">
        <div className="flex items-center gap-2.5 mb-0.5">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-700/30 bg-emerald-500/10 text-emerald-400">
            <PieChart className="h-4 w-4" />
          </span>
          <h1 className="text-xl font-semibold tracking-tight text-white">Portfolio Allocator</h1>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md border bg-amber-500/15 text-amber-400 border-amber-700/40 tracking-wider">ELITE</span>
        </div>
        <p className="text-zinc-500 text-sm">Data-driven allocation opinions based on current signals. Not financial advice.</p>
      </div>

      {/* Input form */}
      <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl p-5 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          {/* Goal */}
          <div>
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider block mb-2">Goal</label>
            <div className="space-y-1.5">
              {(Object.keys(GOAL_LABELS) as Goal[]).map(g => (
                <button
                  key={g}
                  onClick={() => setGoal(g)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors border ${
                    goal === g
                      ? "border-emerald-500/40 bg-emerald-500/10 text-white"
                      : "border-white/[0.1] bg-white/[0.03] text-zinc-400 hover:text-white"
                  }`}
                >
                  {GOAL_LABELS[g]}
                </button>
              ))}
            </div>
          </div>

          {/* Risk */}
          <div>
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider block mb-2">Risk Tolerance</label>
            <div className="space-y-1.5">
              {(Object.keys(RISK_LABELS) as RiskTolerance[]).map(r => (
                <button
                  key={r}
                  onClick={() => setRisk(r)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors border ${
                    risk === r
                      ? "border-emerald-500/40 bg-emerald-500/10 text-white"
                      : "border-white/[0.1] bg-white/[0.03] text-zinc-400 hover:text-white"
                  }`}
                >
                  {RISK_LABELS[r]}
                </button>
              ))}
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider block mb-2">Investment Amount</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">$</span>
              <input
                type="text"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="10,000"
                className="w-full bg-white/[0.04] border border-white/[0.1] rounded-lg pl-7 pr-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 transition-colors"
              />
            </div>
            <p className="text-zinc-600 text-xs mt-1.5">For percentage reference only</p>
          </div>
        </div>

        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

        <button
          onClick={generate}
          disabled={generating}
          className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold py-2.5 rounded-lg transition-colors text-sm"
        >
          {generating ? "Analyzing signals..." : result ? "Regenerate allocation" : "Generate allocation"}
        </button>
      </div>

      {/* Results */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 bg-white/[0.03] border border-white/[0.06] rounded-xl animate-pulse" />
          ))}
        </div>
      ) : result ? (
        <div className="space-y-5">
          {/* Meta */}
          {result.generated_at && (
            <div className="flex items-center justify-between text-xs text-zinc-600">
              <span>
                {result.goal && GOAL_LABELS[result.goal as Goal]} ·{" "}
                {result.risk_tolerance && RISK_LABELS[result.risk_tolerance as RiskTolerance]}
                {result.investment_amount && ` · $${result.investment_amount.toLocaleString()}`}
              </span>
              <span>Generated {formatDate(result.generated_at)}</span>
            </div>
          )}

          {/* Overall reasoning */}
          <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl p-4">
            <div className="flex items-center gap-2.5 font-mono text-[11px] font-semibold text-zinc-500 uppercase tracking-[0.18em] mb-2">
              <span className="text-emerald-400 text-[10px] leading-none">●</span>
              Strategy Overview
            </div>
            <p className="text-zinc-300 text-sm leading-relaxed">{result.overall_reasoning}</p>
          </div>

          {/* Asset class breakdown bar */}
          <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl p-4">
            <div className="flex items-center gap-2.5 font-mono text-[11px] font-semibold text-zinc-500 uppercase tracking-[0.18em] mb-3">
              <span className="text-emerald-400 text-[10px] leading-none">●</span>
              Asset Mix
            </div>
            <div className="flex rounded-full overflow-hidden h-3 mb-3">
              {stockPct > 0  && <div className="bg-blue-500"   style={{ width: `${stockPct}%` }} />}
              {cryptoPct > 0 && <div className="bg-amber-500"  style={{ width: `${cryptoPct}%` }} />}
            </div>
            <div className="flex gap-4 text-xs">
              {stockPct > 0  && <span className="text-blue-400">Stocks {stockPct}%</span>}
              {cryptoPct > 0 && <span className="text-amber-400">Crypto {cryptoPct}%</span>}
            </div>
          </div>

          {/* Individual positions */}
          <div className="space-y-2">
            {result.allocations
              .sort((a, b) => b.allocation_pct - a.allocation_pct)
              .map(a => (
                <div key={a.ticker} className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl p-4 flex items-start gap-4 hover:bg-white/[0.05] hover:border-white/[0.1] transition-all">
                  {/* Bar */}
                  <div className="flex-shrink-0 w-1 self-stretch rounded-full" style={{ background: a.asset_type === "stock" ? "#3b82f6" : a.asset_type === "crypto" ? "#f59e0b" : "#a855f7" }} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono font-bold text-white">{a.ticker}</span>
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${ASSET_TEXT[a.asset_type]}`}>
                        {ASSET_LABELS[a.asset_type] ?? a.asset_type}
                      </span>
                    </div>
                    <p className="text-zinc-500 text-xs leading-relaxed">{a.reasoning}</p>
                  </div>

                  {/* Percentage */}
                  <div className="flex-shrink-0 text-right">
                    <div className="text-xl font-bold text-white tabular-nums">{a.allocation_pct}%</div>
                    {result.investment_amount && (
                      <div className="text-xs text-zinc-600">
                        ${Math.round(result.investment_amount * a.allocation_pct / 100).toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>
              ))}
          </div>

          {/* Disclaimer */}
          <p className="text-zinc-700 text-xs text-center pb-4">
            These are data-driven opinions based on current signals, not financial advice. Past signal performance does not guarantee future results.
          </p>
        </div>
      ) : (
        <div className="text-center py-16 text-zinc-500 flex flex-col items-center gap-4">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-700/30 bg-emerald-500/10 text-emerald-400">
            <PieChart className="h-6 w-6" />
          </span>
          <p className="text-sm max-w-xs leading-relaxed">Set your goal and risk tolerance above to generate your first allocation.</p>
        </div>
      )}
    </div>
  );
}
