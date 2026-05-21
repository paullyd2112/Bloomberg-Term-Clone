"use client";

import { useEffect, useRef } from "react";
import { cn, formatPercent } from "@/lib/utils";
import type { TickerItem } from "@/types";

interface TickerBarProps {
  items: TickerItem[];
}

export function TickerBar({ items }: TickerBarProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Duplicate items for seamless loop
  const doubled = [...items, ...items];

  return (
    <div className="h-8 bg-[#0a0b0d] border-b border-[#1e2433] overflow-hidden flex items-center">
      <div
        className="flex gap-6 whitespace-nowrap animate-[ticker_40s_linear_infinite]"
        style={{ willChange: "transform" }}
      >
        {doubled.map((item, i) => (
          <span key={i} className="flex items-center gap-2 text-xs tabular-nums">
            <span className={cn(
              "font-semibold",
              item.type === "crypto" ? "text-[#f59e0b]" :
              item.type === "index"  ? "text-[#3b82f6]" :
              "text-[#e2e8f0]"
            )}>
              {item.symbol}
            </span>
            <span className="text-[#94a3b8]">
              {item.type === "crypto" && item.price > 1000
                ? item.price.toLocaleString("en-US", { maximumFractionDigits: 0 })
                : item.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}
            </span>
            <span className={cn(
              "font-medium",
              item.changePct >= 0 ? "text-[#00d4aa]" : "text-[#f43f5e]"
            )}>
              {formatPercent(item.changePct)}
            </span>
          </span>
        ))}
      </div>

      <style>{`
        @keyframes ticker {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
