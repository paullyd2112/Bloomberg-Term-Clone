"use client";

import { Shield, Activity, Target, Clock } from "lucide-react";
import { useState } from "react";

const SAFEGUARDS = [
  {
    icon: Target,
    label: "Dynamic ATR Stops",
    value: "1.5x ATR_14",
    detail: "Volatility-adaptive stop losses clamped to 1-5%, adjusting automatically to market conditions.",
  },
  {
    icon: Activity,
    label: "Max Concurrent Buys",
    value: "2 positions",
    detail: "Prevents correlated drawdown clusters. Only 1 alt-coin alongside a BTC/ETH major.",
  },
  {
    icon: Clock,
    label: "Daily Signal Cap",
    value: "3 / day",
    detail: "Hard cap on fresh signals per UTC day. Quality over quantity.",
  },
];

export default function SystemSafeguards() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-white/[0.02] transition-colors text-left"
      >
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-700/30 bg-emerald-500/10 text-emerald-400 flex-shrink-0">
          <Shield className="h-3.5 w-3.5" />
        </span>
        <span className="font-mono text-[11px] font-semibold text-zinc-400 uppercase tracking-[0.15em] flex-1">
          System Safeguards
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          <span className="text-[10px] text-emerald-400 font-medium">Active</span>
        </span>
        <svg
          className={`h-4 w-4 text-zinc-500 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="px-5 pb-4 pt-1 space-y-3 border-t border-white/[0.06]">
          {SAFEGUARDS.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="flex items-start gap-3 py-2">
                <Icon className="h-4 w-4 text-zinc-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm text-zinc-300">{s.label}</span>
                    <span className="font-mono text-xs text-emerald-400 font-semibold tabular-nums flex-shrink-0">
                      {s.value}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-600 mt-0.5 leading-relaxed">{s.detail}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
