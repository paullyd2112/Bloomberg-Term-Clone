"use client";

import { clsx } from "clsx";
import Sparkline from "./Sparkline";

export type PredictionMarket = {
  condition_id: string;
  title: string;
  yes_price: number;
  no_price: number | null;
  volume: number;
  category: string;
  end_date: string | null;
  captured_at: string;
  sparkline: number[];
  signal?: {
    id: number;
    direction: "YES" | "NO" | "HOLD";
    confidence: number;
    reasoning: string;
  } | null;
};

function formatVolume(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function probColor(p: number): string {
  if (p >= 0.7) return "text-emerald-400";
  if (p >= 0.4) return "text-amber-400";
  return "text-red-400";
}

function daysUntil(iso: string | null): string | null {
  if (!iso) return null;
  const diff = Math.ceil(
    (new Date(iso).getTime() - Date.now()) / 86_400_000,
  );
  if (diff < 0) return "Ended";
  if (diff === 0) return "Today";
  if (diff === 1) return "1 day";
  return `${diff} days`;
}

export default function PredictionCard({ market }: { market: PredictionMarket }) {
  const prob = Math.round(market.yes_price * 100);
  const remaining = daysUntil(market.end_date);
  const hasSignal = market.signal && market.signal.direction !== "HOLD";

  return (
    <div
      className={clsx(
        "group relative bg-white/[0.03] border rounded-xl p-4 sm:p-5 transition-all hover:bg-white/[0.05]",
        hasSignal
          ? "border-emerald-500/30 hover:border-emerald-500/50 ring-1 ring-emerald-500/10"
          : "border-white/[0.06] hover:border-white/[0.1] ring-hairline",
      )}
    >
      {/* AI signal badge */}
      {hasSignal && market.signal && (
        <div className="absolute -top-2.5 right-3 flex items-center gap-1.5 bg-emerald-500/15 border border-emerald-500/30 rounded-full px-2.5 py-0.5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
            AI {market.signal.direction} {market.signal.confidence}%
          </span>
        </div>
      )}

      {/* Top row: probability + sparkline */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-baseline gap-1">
          <span className={clsx("text-3xl font-bold tabular-nums leading-none", probColor(market.yes_price))}>
            {prob}
          </span>
          <span className={clsx("text-lg font-medium", probColor(market.yes_price))}>%</span>
          <span className="text-[10px] text-zinc-600 uppercase tracking-wider ml-1">YES</span>
        </div>
        <Sparkline points={market.sparkline} className="flex-shrink-0 opacity-70 group-hover:opacity-100 transition-opacity" />
      </div>

      {/* Title */}
      <h3 className="text-sm font-medium text-white leading-snug line-clamp-2 mb-3 min-h-[2.5rem]">
        {market.title}
      </h3>

      {/* Meta chips */}
      <div className="flex items-center gap-2 flex-wrap">
        {market.category && (
          <span className="inline-flex items-center rounded-md bg-white/[0.06] px-2 py-0.5 text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
            {market.category}
          </span>
        )}
        <span className="inline-flex items-center rounded-md bg-white/[0.06] px-2 py-0.5 text-[10px] font-medium text-zinc-400 tabular-nums">
          {formatVolume(market.volume)}
        </span>
        {remaining && (
          <span className={clsx(
            "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium tabular-nums",
            remaining === "Ended" || remaining === "Today"
              ? "bg-red-500/10 text-red-400"
              : "bg-white/[0.06] text-zinc-400",
          )}>
            {remaining}
          </span>
        )}
      </div>

      {/* Signal reasoning */}
      {hasSignal && market.signal && (
        <p className="mt-3 text-xs text-zinc-500 leading-relaxed line-clamp-2 border-t border-white/[0.06] pt-3">
          {market.signal.reasoning}
        </p>
      )}
    </div>
  );
}
