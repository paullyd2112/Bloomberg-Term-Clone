"use client";

import { cn, formatCurrency, formatPercent, formatNumber } from "@/lib/utils";
import type { CryptoQuote } from "@/types";

interface CryptoPanelProps {
  quotes: CryptoQuote[];
}

export function CryptoPanel({ quotes }: CryptoPanelProps) {
  const total24hVolume = quotes.reduce((acc, q) => acc + q.volume24h, 0);
  const totalMarketCap = quotes.reduce((acc, q) => acc + q.marketCap, 0);

  return (
    <div className="flex flex-col h-full overflow-hidden p-3 gap-3">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 flex-shrink-0">
        {[
          { label: "Total 24h Volume", value: formatCurrency(total24hVolume) },
          { label: "Crypto Market Cap", value: formatCurrency(totalMarketCap) },
          { label: "BTC Dominance", value: `${((quotes[0]?.marketCap ?? 0) / totalMarketCap * 100).toFixed(1)}%` },
        ].map((s) => (
          <div key={s.label} className="bg-[#0f1117] border border-[#1e2433] rounded-lg px-3 py-2">
            <div className="text-[10px] text-[#64748b] uppercase tracking-wide mb-0.5">{s.label}</div>
            <div className="text-sm font-semibold text-[#e2e8f0] tabular-nums">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="flex-1 bg-[#0f1117] rounded-lg border border-[#1e2433] overflow-hidden flex flex-col">
        <div className="px-3 py-2 border-b border-[#1e2433] flex items-center justify-between flex-shrink-0">
          <span className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wide">Markets</span>
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00d4aa] pulse-green" />
            <span className="text-[10px] text-[#00d4aa]">LIVE</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-[#0f1117]">
              <tr className="border-b border-[#1e2433]">
                <th className="px-3 py-1.5 text-left text-[10px] text-[#64748b] font-medium">Asset</th>
                <th className="px-3 py-1.5 text-right text-[10px] text-[#64748b] font-medium">Price</th>
                <th className="px-3 py-1.5 text-right text-[10px] text-[#64748b] font-medium">24h %</th>
                <th className="px-3 py-1.5 text-right text-[10px] text-[#64748b] font-medium">Volume</th>
                <th className="px-3 py-1.5 text-right text-[10px] text-[#64748b] font-medium">Mkt Cap</th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((q) => (
                <tr key={q.symbol} className="border-b border-[#1e2433]/50 hover:bg-[#141820] cursor-pointer">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-[#1e2433] flex items-center justify-center text-[9px] font-bold text-[#94a3b8]">
                        {q.symbol.slice(0, 2)}
                      </div>
                      <div>
                        <div className="font-semibold text-[#e2e8f0]">{q.symbol}</div>
                        <div className="text-[10px] text-[#64748b]">{q.name}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-[#94a3b8]">
                    {q.price > 1
                      ? `$${q.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : `$${q.price.toFixed(7)}`}
                  </td>
                  <td className={cn(
                    "px-3 py-2 text-right tabular-nums font-medium",
                    q.changePct24h >= 0 ? "text-[#00d4aa]" : "text-[#f43f5e]"
                  )}>
                    {formatPercent(q.changePct24h)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-[#64748b]">
                    {formatCurrency(q.volume24h)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-[#64748b]">
                    {formatCurrency(q.marketCap)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
