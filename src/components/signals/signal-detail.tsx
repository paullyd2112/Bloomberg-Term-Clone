"use client";

import { cn, formatCurrency, formatTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { Signal } from "@/types";
import {
  X, Lock, ArrowUpRight, ArrowDownRight, Minus,
  Link2, TrendingUp, Bitcoin, Target, Crown
} from "lucide-react";

interface SignalDetailProps {
  signal: Signal;
  isLocked: boolean;
  onClose: () => void;
  onUpgrade: () => void;
  relatedSignals?: Signal[];
}

export function SignalDetail({ signal, isLocked, onClose, onUpgrade, relatedSignals = [] }: SignalDetailProps) {
  const sentimentColor =
    signal.sentiment === "bullish" ? "text-[#00d4aa]" :
    signal.sentiment === "bearish" ? "text-[#f43f5e]" :
    "text-[#64748b]";

  const verticalIcon =
    signal.vertical === "crypto" ? <Bitcoin size={12} /> :
    signal.vertical === "predictions" ? <Target size={12} /> :
    <TrendingUp size={12} />;

  return (
    <div className="flex flex-col h-full bg-[#0f1117] border-l border-[#1e2433]">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[#1e2433]">
        <div className="flex items-center gap-2">
          {verticalIcon && <span className="text-[#64748b]">{verticalIcon}</span>}
          <span className="text-sm font-bold text-[#e2e8f0]">{signal.ticker}</span>
          <span className={cn("text-xs font-semibold", sentimentColor)}>
            {signal.sentiment.toUpperCase()}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded text-[#64748b] hover:text-[#e2e8f0] hover:bg-[#1e2433]"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Title */}
        <div>
          <h3 className="text-base font-semibold text-[#e2e8f0] leading-snug mb-1">
            {signal.title}
          </h3>
          <span className="text-[10px] text-[#64748b]">
            {formatTime(signal.timestamp)} · {signal.urgency.toUpperCase()} URGENCY
          </span>
        </div>

        {/* Key stat */}
        {signal.value && (
          <div className="bg-[#141820] rounded-lg p-3 border border-[#1e2433]">
            <div className="text-[10px] text-[#64748b] mb-0.5 uppercase tracking-wide">Flow Value</div>
            <div className="text-xl font-bold text-[#00d4aa] tabular-nums">
              {formatCurrency(signal.value)}
            </div>
          </div>
        )}

        {/* Summary */}
        <div>
          <div className="text-[10px] text-[#64748b] uppercase tracking-wide mb-1.5">Summary</div>
          <p className="text-sm text-[#94a3b8] leading-relaxed">{signal.summary}</p>
        </div>

        {/* Detail — locked for free tier */}
        {signal.detail && (
          <div className="relative">
            <div className="text-[10px] text-[#64748b] uppercase tracking-wide mb-1.5">Analysis</div>
            {isLocked ? (
              <div className="relative">
                <p className="text-sm text-[#1e2433] leading-relaxed select-none blur-sm">
                  {signal.detail}
                </p>
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0f1117]/80 rounded-lg">
                  <Lock size={16} className="text-[#8b5cf6] mb-2" />
                  <p className="text-xs text-[#94a3b8] text-center mb-3">
                    Deep analysis is a Pro feature.
                  </p>
                  <button
                    onClick={onUpgrade}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#00d4aa] text-[#0a0b0d] text-xs font-semibold hover:bg-[#00bfa0] transition-colors"
                  >
                    <Crown size={11} />
                    Upgrade to Pro
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-[#94a3b8] leading-relaxed">{signal.detail}</p>
            )}
          </div>
        )}

        {/* Tags */}
        {signal.tags && signal.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {signal.tags.map((tag) => (
              <span key={tag} className="text-[10px] text-[#64748b] bg-[#141820] border border-[#1e2433] px-2 py-0.5 rounded">
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* Related signals (cross-market) */}
        {relatedSignals.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-[10px] text-[#00d4aa] uppercase tracking-wide mb-2">
              <Link2 size={10} />
              Cross-Market Correlation
            </div>
            <div className="space-y-2">
              {relatedSignals.map((r) => (
                <div key={r.id} className="bg-[#141820] border border-[#1e2433] rounded-lg p-2.5">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-xs font-semibold text-[#e2e8f0]">{r.ticker}</span>
                    <span className="text-[10px] text-[#64748b]">{r.vertical}</span>
                  </div>
                  <p className="text-xs text-[#64748b] leading-snug">{r.summary}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
