"use client";

import { cn, formatCurrency, timeAgo } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { Signal } from "@/types";
import {
  TrendingUp, TrendingDown, Zap, Eye, EyeOff,
  ArrowUpRight, ArrowDownRight, Minus, Lock, Link2
} from "lucide-react";

const TYPE_LABELS: Record<Signal["type"], string> = {
  options_sweep:      "Options Sweep",
  dark_pool:          "Dark Pool",
  unusual_volume:     "Unusual Vol",
  whale_trade:        "Whale",
  prediction_shift:   "Prediction",
  congressional_trade:"Congress",
  earnings_surprise:  "Earnings",
  news_catalyst:      "News",
};

const TYPE_COLORS: Record<Signal["type"], string> = {
  options_sweep:       "text-[#3b82f6]",
  dark_pool:           "text-[#8b5cf6]",
  unusual_volume:      "text-[#f59e0b]",
  whale_trade:         "text-[#f97316]",
  prediction_shift:    "text-[#00d4aa]",
  congressional_trade: "text-[#f43f5e]",
  earnings_surprise:   "text-[#f59e0b]",
  news_catalyst:       "text-[#94a3b8]",
};

interface SignalCardProps {
  signal: Signal;
  isSelected: boolean;
  isLocked: boolean;
  onClick: () => void;
}

export function SignalCard({ signal, isSelected, isLocked, onClick }: SignalCardProps) {
  const sentimentIcon =
    signal.sentiment === "bullish" ? <ArrowUpRight size={12} className="text-[#00d4aa]" /> :
    signal.sentiment === "bearish" ? <ArrowDownRight size={12} className="text-[#f43f5e]" /> :
    <Minus size={12} className="text-[#64748b]" />;

  const urgencyDot =
    signal.urgency === "high"   ? "bg-[#f43f5e] pulse-green" :
    signal.urgency === "medium" ? "bg-[#f59e0b]" :
    "bg-[#1e2433]";

  return (
    <div
      onClick={onClick}
      className={cn(
        "relative p-3 rounded-lg border cursor-pointer transition-all slide-in",
        "hover:border-[#2d3748] hover:bg-[#0f1117]",
        isSelected
          ? "border-[#00d4aa] bg-[#0f1117]"
          : "border-[#1e2433] bg-[#0a0b0d]",
        isLocked && "opacity-70"
      )}
    >
      {/* Urgency dot */}
      <span className={cn("absolute top-3 right-3 w-1.5 h-1.5 rounded-full", urgencyDot)} />

      {/* Header row */}
      <div className="flex items-start gap-2 mb-1.5 pr-4">
        <span className={cn("text-xs font-semibold tabular-nums", TYPE_COLORS[signal.type])}>
          {TYPE_LABELS[signal.type]}
        </span>
        <span className="text-xs font-bold text-[#e2e8f0]">{signal.ticker}</span>
        {sentimentIcon}
        {signal.relatedSignals && signal.relatedSignals.length > 0 && (
          <Link2 size={10} className="text-[#00d4aa] ml-auto mr-4" />
        )}
      </div>

      {/* Title */}
      <p className="text-sm font-medium text-[#e2e8f0] mb-1 leading-snug">
        {signal.title.replace(/^[^—]+ — /, "")}
      </p>

      {/* Summary */}
      <p className={cn("text-xs leading-relaxed mb-2", isLocked ? "text-[#1e2433] select-none blur-[3px]" : "text-[#94a3b8]")}>
        {isLocked ? signal.summary.replace(/./g, "█") : signal.summary}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {signal.value && (
            <span className="text-xs tabular-nums text-[#64748b]">
              {formatCurrency(signal.value)}
            </span>
          )}
          {signal.tags?.slice(0, 2).map((tag) => (
            <span key={tag} className="text-[10px] text-[#64748b] bg-[#141820] px-1.5 py-0.5 rounded">
              #{tag}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          {isLocked && (
            <span className="flex items-center gap-1 text-[10px] text-[#8b5cf6]">
              <Lock size={9} />
              Pro
            </span>
          )}
          <span className="text-[10px] text-[#64748b]">{timeAgo(signal.timestamp)}</span>
        </div>
      </div>
    </div>
  );
}
