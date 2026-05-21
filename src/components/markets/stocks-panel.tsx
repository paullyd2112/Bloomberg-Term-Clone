"use client";

import { cn, formatCurrency, formatPercent, formatNumber } from "@/lib/utils";
import type { StockQuote, OptionsFlow, DarkPoolPrint } from "@/types";
import { TrendingUp, TrendingDown, Zap, Eye } from "lucide-react";

interface StocksPanelProps {
  quotes: StockQuote[];
  optionsFlow: OptionsFlow[];
  darkPool: DarkPoolPrint[];
}

export function StocksPanel({ quotes, optionsFlow, darkPool }: StocksPanelProps) {
  return (
    <div className="grid grid-cols-3 gap-3 h-full overflow-hidden p-3">
      {/* Watchlist */}
      <div className="flex flex-col bg-[#0f1117] rounded-lg border border-[#1e2433] overflow-hidden">
        <div className="px-3 py-2 border-b border-[#1e2433] flex items-center justify-between">
          <span className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wide">Watchlist</span>
          <span className="text-[10px] text-[#64748b]">LIVE</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#1e2433]">
                <th className="px-3 py-1.5 text-left text-[10px] text-[#64748b] font-medium">Ticker</th>
                <th className="px-3 py-1.5 text-right text-[10px] text-[#64748b] font-medium">Price</th>
                <th className="px-3 py-1.5 text-right text-[10px] text-[#64748b] font-medium">Chg%</th>
                <th className="px-3 py-1.5 text-right text-[10px] text-[#64748b] font-medium">Vol</th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((q) => (
                <tr key={q.ticker} className="border-b border-[#1e2433]/50 hover:bg-[#141820] cursor-pointer">
                  <td className="px-3 py-2 font-semibold text-[#e2e8f0]">{q.ticker}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[#94a3b8]">
                    ${q.price.toFixed(2)}
                  </td>
                  <td className={cn(
                    "px-3 py-2 text-right tabular-nums font-medium",
                    q.changePct >= 0 ? "text-[#00d4aa]" : "text-[#f43f5e]"
                  )}>
                    {formatPercent(q.changePct)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-[#64748b]">
                    {formatNumber(q.volume, 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Options Flow */}
      <div className="flex flex-col bg-[#0f1117] rounded-lg border border-[#1e2433] overflow-hidden">
        <div className="px-3 py-2 border-b border-[#1e2433] flex items-center justify-between">
          <span className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wide">Options Flow</span>
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00d4aa] pulse-green" />
            <span className="text-[10px] text-[#00d4aa]">LIVE</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#1e2433]">
                <th className="px-2 py-1.5 text-left text-[10px] text-[#64748b] font-medium">Ticker</th>
                <th className="px-2 py-1.5 text-left text-[10px] text-[#64748b] font-medium">Strike</th>
                <th className="px-2 py-1.5 text-left text-[10px] text-[#64748b] font-medium">Type</th>
                <th className="px-2 py-1.5 text-right text-[10px] text-[#64748b] font-medium">Premium</th>
                <th className="px-2 py-1.5 text-center text-[10px] text-[#64748b] font-medium">Flag</th>
              </tr>
            </thead>
            <tbody>
              {optionsFlow.map((f) => (
                <tr key={f.id} className={cn(
                  "border-b border-[#1e2433]/50 hover:bg-[#141820] cursor-pointer",
                  f.unusual && "bg-[color-mix(in_srgb,#3b82f6_5%,transparent)]"
                )}>
                  <td className="px-2 py-2 font-semibold text-[#e2e8f0]">{f.ticker}</td>
                  <td className="px-2 py-2 tabular-nums text-[#94a3b8]">${f.strike}</td>
                  <td className={cn(
                    "px-2 py-2 font-semibold uppercase",
                    f.type === "call" ? "text-[#00d4aa]" : "text-[#f43f5e]"
                  )}>
                    {f.type}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-[#94a3b8]">
                    {formatCurrency(f.premium)}
                  </td>
                  <td className="px-2 py-2 text-center">
                    {f.sweep && (
                      <span className="text-[9px] bg-[color-mix(in_srgb,#3b82f6_20%,transparent)] text-[#3b82f6] px-1 py-0.5 rounded">
                        SWEEP
                      </span>
                    )}
                    {f.unusual && !f.sweep && (
                      <span className="text-[9px] bg-[color-mix(in_srgb,#f59e0b_20%,transparent)] text-[#f59e0b] px-1 py-0.5 rounded">
                        UNUSUAl
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dark Pool */}
      <div className="flex flex-col bg-[#0f1117] rounded-lg border border-[#1e2433] overflow-hidden">
        <div className="px-3 py-2 border-b border-[#1e2433] flex items-center justify-between">
          <span className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wide">Dark Pool Prints</span>
          <Eye size={12} className="text-[#8b5cf6]" />
        </div>
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#1e2433]">
                <th className="px-3 py-1.5 text-left text-[10px] text-[#64748b] font-medium">Ticker</th>
                <th className="px-3 py-1.5 text-right text-[10px] text-[#64748b] font-medium">Price</th>
                <th className="px-3 py-1.5 text-right text-[10px] text-[#64748b] font-medium">Value</th>
                <th className="px-3 py-1.5 text-left text-[10px] text-[#64748b] font-medium">Exchange</th>
              </tr>
            </thead>
            <tbody>
              {darkPool.map((dp) => (
                <tr key={dp.id} className="border-b border-[#1e2433]/50 hover:bg-[#141820] cursor-pointer">
                  <td className="px-3 py-2 font-semibold text-[#e2e8f0]">{dp.ticker}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[#94a3b8]">${dp.price.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[#8b5cf6] font-medium">
                    {formatCurrency(dp.value)}
                  </td>
                  <td className="px-3 py-2 text-[10px] text-[#64748b]">{dp.exchange}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
