"use client";

import { cn, formatCurrency, formatPercent } from "@/lib/utils";
import type { PredictionMarket } from "@/types";

interface PredictionsPanelProps {
  markets: PredictionMarket[];
}

function ProbabilityBar({ yes, change }: { yes: number; change: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-[#1e2433] rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            yes >= 60 ? "bg-[#00d4aa]" :
            yes <= 40 ? "bg-[#f43f5e]" :
            "bg-[#f59e0b]"
          )}
          style={{ width: `${yes}%` }}
        />
      </div>
      <span className={cn(
        "text-xs tabular-nums font-semibold w-10 text-right",
        yes >= 60 ? "text-[#00d4aa]" :
        yes <= 40 ? "text-[#f43f5e]" :
        "text-[#f59e0b]"
      )}>
        {yes}%
      </span>
    </div>
  );
}

export function PredictionsPanel({ markets }: PredictionsPanelProps) {
  const totalVolume = markets.reduce((acc, m) => acc + m.totalVolume, 0);
  const biggestMover = [...markets].sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h))[0];

  return (
    <div className="flex flex-col h-full overflow-hidden p-3 gap-3">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 flex-shrink-0">
        <div className="bg-[#0f1117] border border-[#1e2433] rounded-lg px-3 py-2">
          <div className="text-[10px] text-[#64748b] uppercase tracking-wide mb-0.5">Total Locked</div>
          <div className="text-sm font-semibold text-[#e2e8f0] tabular-nums">{formatCurrency(totalVolume)}</div>
        </div>
        <div className="bg-[#0f1117] border border-[#1e2433] rounded-lg px-3 py-2">
          <div className="text-[10px] text-[#64748b] uppercase tracking-wide mb-0.5">Biggest Mover</div>
          <div className="text-sm font-semibold text-[#f59e0b] tabular-nums truncate">
            {biggestMover ? `${biggestMover.change24h > 0 ? "+" : ""}${biggestMover.change24h}pp` : "—"}
          </div>
        </div>
        <div className="bg-[#0f1117] border border-[#1e2433] rounded-lg px-3 py-2">
          <div className="text-[10px] text-[#64748b] uppercase tracking-wide mb-0.5">Active Markets</div>
          <div className="text-sm font-semibold text-[#e2e8f0] tabular-nums">{markets.length}</div>
        </div>
      </div>

      {/* Markets list */}
      <div className="flex-1 bg-[#0f1117] rounded-lg border border-[#1e2433] overflow-hidden flex flex-col">
        <div className="px-3 py-2 border-b border-[#1e2433] flex-shrink-0 flex items-center justify-between">
          <span className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wide">Prediction Markets</span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#141820] text-[#00d4aa]">Polymarket</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#141820] text-[#3b82f6]">Kalshi</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-[#1e2433]/50">
          {markets.map((m) => (
            <div key={m.id} className="px-3 py-3 hover:bg-[#141820] cursor-pointer transition-colors">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={cn(
                      "text-[9px] px-1 py-0.5 rounded font-medium",
                      m.platform === "polymarket"
                        ? "bg-[color-mix(in_srgb,#00d4aa_15%,transparent)] text-[#00d4aa]"
                        : "bg-[color-mix(in_srgb,#3b82f6_15%,transparent)] text-[#3b82f6]"
                    )}>
                      {m.platform === "polymarket" ? "POLY" : "KALSHI"}
                    </span>
                    <span className="text-[10px] text-[#64748b]">{m.category}</span>
                  </div>
                  <p className="text-sm text-[#e2e8f0] font-medium leading-snug">{m.question}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className={cn(
                    "text-xs font-semibold tabular-nums",
                    m.change24h > 0 ? "text-[#00d4aa]" :
                    m.change24h < 0 ? "text-[#f43f5e]" :
                    "text-[#64748b]"
                  )}>
                    {m.change24h > 0 ? "+" : ""}{m.change24h}pp
                  </div>
                  <div className="text-[10px] text-[#64748b]">24h</div>
                </div>
              </div>
              <ProbabilityBar yes={m.yesPrice} change={m.change24h} />
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-[10px] text-[#64748b]">Vol 24h: {formatCurrency(m.volume24h)}</span>
                <span className="text-[10px] text-[#64748b]">Total: {formatCurrency(m.totalVolume)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
