"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { SignalCard } from "./signal-card";
import { SignalDetail } from "./signal-detail";
import { useAppStore } from "@/store/app-store";
import type { Signal, MarketVertical } from "@/types";
import { Filter, SlidersHorizontal } from "lucide-react";

type FilterType = "all" | Signal["type"];
type SentimentFilter = "all" | Signal["sentiment"];

interface SignalFeedProps {
  signals: Signal[];
  onUpgrade: () => void;
}

export function SignalFeed({ signals, onUpgrade }: SignalFeedProps) {
  const { activeVertical, selectedSignalId, setSelectedSignalId, subscription } = useAppStore();
  const [typeFilter, setTypeFilter] = useState<FilterType>("all");
  const [sentimentFilter, setSentimentFilter] = useState<SentimentFilter>("all");

  const filtered = useMemo(() => {
    return signals
      .filter((s) => activeVertical === "stocks"
        ? s.vertical === "stocks"
        : activeVertical === "crypto"
        ? s.vertical === "crypto"
        : s.vertical === "predictions"
      )
      .filter((s) => typeFilter === "all" || s.type === typeFilter)
      .filter((s) => sentimentFilter === "all" || s.sentiment === sentimentFilter);
  }, [signals, activeVertical, typeFilter, sentimentFilter]);

  // Show all signals on signals tab; cross-market on signals page
  const allSignals = useMemo(() => {
    return signals
      .filter((s) => typeFilter === "all" || s.type === typeFilter)
      .filter((s) => sentimentFilter === "all" || s.sentiment === sentimentFilter);
  }, [signals, typeFilter, sentimentFilter]);

  const displaySignals = allSignals;

  const selectedSignal = selectedSignalId
    ? signals.find((s) => s.id === selectedSignalId) ?? null
    : null;

  const relatedSignals = selectedSignal?.relatedSignals
    ? signals.filter((s) => selectedSignal.relatedSignals!.includes(s.id))
    : [];

  function isLocked(signal: Signal): boolean {
    return signal.tier === "paid" && subscription === "free";
  }

  const SENTIMENT_OPTS: { value: SentimentFilter; label: string }[] = [
    { value: "all",     label: "All" },
    { value: "bullish", label: "Bullish" },
    { value: "bearish", label: "Bearish" },
    { value: "neutral", label: "Neutral" },
  ];

  return (
    <div className="flex h-full overflow-hidden">
      {/* Feed column */}
      <div className={cn(
        "flex flex-col transition-all",
        selectedSignalId ? "w-[400px] flex-shrink-0" : "flex-1"
      )}>
        {/* Filters */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[#1e2433] flex-shrink-0">
          <SlidersHorizontal size={12} className="text-[#64748b]" />
          <div className="flex items-center gap-1 flex-wrap">
            {SENTIMENT_OPTS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSentimentFilter(opt.value)}
                className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-medium transition-colors",
                  sentimentFilter === opt.value
                    ? opt.value === "bullish" ? "bg-[color-mix(in_srgb,#00d4aa_20%,transparent)] text-[#00d4aa]" :
                      opt.value === "bearish" ? "bg-[color-mix(in_srgb,#f43f5e_20%,transparent)] text-[#f43f5e]" :
                      "bg-[#1e2433] text-[#e2e8f0]"
                    : "text-[#64748b] hover:text-[#94a3b8]"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <span className="ml-auto text-[10px] text-[#64748b]">
            {displaySignals.length} signals
          </span>
        </div>

        {/* Signal list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {displaySignals.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-[#64748b] text-sm">
              No signals match your filters
            </div>
          ) : (
            displaySignals.map((signal) => (
              <SignalCard
                key={signal.id}
                signal={signal}
                isSelected={selectedSignalId === signal.id}
                isLocked={isLocked(signal)}
                onClick={() =>
                  setSelectedSignalId(
                    selectedSignalId === signal.id ? null : signal.id
                  )
                }
              />
            ))
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selectedSignal && (
        <div className="flex-1 overflow-hidden">
          <SignalDetail
            signal={selectedSignal}
            isLocked={isLocked(selectedSignal)}
            onClose={() => setSelectedSignalId(null)}
            onUpgrade={onUpgrade}
            relatedSignals={relatedSignals}
          />
        </div>
      )}
    </div>
  );
}
