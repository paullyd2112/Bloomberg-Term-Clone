"use client";

import { useState } from "react";
import { clsx } from "clsx";
import Sparkline from "./Sparkline";

export type SmartMoneyData = {
  consensus_direction: "YES" | "NO" | "SPLIT";
  consensus_strength: number;
  wallet_count: number;
  total_volume_usd: number;
};

export type WhaleActivityData = {
  whale_count: number;
  total_usd: number;
  direction: "YES" | "NO" | "MIXED";
};

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
  yes_token_id?: string;
  no_token_id?: string;
  signal?: {
    id: number;
    direction: "YES" | "NO" | "HOLD";
    confidence: number;
    reasoning: string;
  } | null;
  smart_money?: SmartMoneyData | null;
  whale_activity?: WhaleActivityData | null;
};

function formatVolume(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function probColor(p: number): string {
  if (p >= 0.65) return "text-[#00d4aa]";
  if (p >= 0.35) return "text-amber-400";
  return "text-red-400";
}

function probBarColor(p: number): string {
  if (p >= 0.65) return "bg-[#00d4aa]";
  if (p >= 0.35) return "bg-amber-400";
  return "bg-red-400";
}

function daysUntil(iso: string | null): string | null {
  if (!iso) return null;
  const diff = Math.ceil(
    (new Date(iso).getTime() - Date.now()) / 86_400_000,
  );
  if (diff < 0) return "Ended";
  if (diff === 0) return "Today";
  if (diff === 1) return "1d";
  return `${diff}d`;
}

export default function PredictionCard({ market }: { market: PredictionMarket }) {
  const [showTrade, setShowTrade] = useState(false);

  const prob = Math.round(market.yes_price * 100);
  const remaining = daysUntil(market.end_date);
  const hasSignal = market.signal && market.signal.direction !== "HOLD";
  const hasSmartMoney = market.smart_money && market.smart_money.consensus_strength >= 0.6 && market.smart_money.wallet_count >= 3;
  const hasWhale = market.whale_activity && market.whale_activity.whale_count >= 2;

  return (
    <div
      className={clsx(
        "group relative rounded-xl p-5 transition-all cursor-pointer",
        "bg-[#10131a] border hover:bg-[#151921] hover:-translate-y-px",
        hasSignal
          ? "border-[#00d4aa]/15 hover:border-[#00d4aa]/30 hover:shadow-[0_0_20px_rgba(0,212,170,0.06)]"
          : "border-white/[0.06] hover:border-white/[0.12]",
      )}
    >
      {/* Top row: probability + sparkline */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="flex items-baseline">
            <span className={clsx("text-[1.75rem] font-bold tabular-nums leading-none tracking-tight", probColor(market.yes_price))}>
              {prob}
            </span>
            <span className={clsx("text-sm font-medium ml-px opacity-60", probColor(market.yes_price))}>%</span>
          </div>
          {/* Probability bar */}
          <div className="h-[3px] w-16 rounded-full bg-white/[0.04] mt-2 overflow-hidden">
            <div
              className={clsx("h-full rounded-full transition-all", probBarColor(market.yes_price))}
              style={{ width: `${prob}%` }}
            />
          </div>
        </div>
        <Sparkline
          points={market.sparkline}
          width={80}
          height={32}
          className="flex-shrink-0 opacity-80 group-hover:opacity-100 transition-opacity"
        />
      </div>

      {/* Title */}
      <h3 className="text-[0.8125rem] font-medium text-white leading-snug line-clamp-2 mb-3 min-h-[2.25rem]">
        {market.title}
      </h3>

      {/* Badges */}
      {(hasSignal || hasSmartMoney || hasWhale) && (
        <div className="flex items-center gap-1.5 flex-wrap mb-3">
          {hasSignal && market.signal && (
            <span className="inline-flex items-center gap-1 rounded-md bg-[#00d4aa]/10 border border-[#00d4aa]/20 px-2 py-0.5 text-[0.625rem] font-semibold text-[#00d4aa]">
              AI {market.signal.direction} {market.signal.confidence}%
            </span>
          )}
          {hasSmartMoney && market.smart_money && (
            <span className="inline-flex items-center gap-1 rounded-md bg-[#4f8cff]/10 border border-[#4f8cff]/20 px-2 py-0.5 text-[0.625rem] font-medium text-[#4f8cff]">
              SM {Math.round(market.smart_money.consensus_strength * 100)}% {market.smart_money.consensus_direction}
            </span>
          )}
          {hasWhale && market.whale_activity && (
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[0.625rem] font-medium text-amber-400">
              {formatVolume(market.whale_activity.total_usd)}
            </span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-3 pt-3 border-t border-white/[0.06]">
        {market.category && (
          <span className="inline-flex items-center rounded px-1.5 py-0.5 bg-white/[0.04] text-[0.625rem] font-medium text-zinc-500 uppercase tracking-wide">
            {market.category}
          </span>
        )}
        <span className="text-[0.6875rem] text-zinc-600 tabular-nums">
          {formatVolume(market.volume)}
        </span>
        {remaining && (
          <span className={clsx(
            "text-[0.6875rem] tabular-nums",
            remaining === "Ended" || remaining === "Today"
              ? "text-red-400"
              : "text-zinc-600",
          )}>
            {remaining}
          </span>
        )}
      </div>

      {/* Trade tooltip */}
      <div className="relative mt-3">
        <button
          onClick={(e) => { e.stopPropagation(); setShowTrade(!showTrade); }}
          className="w-full py-2 text-xs font-medium text-zinc-500 bg-white/[0.03] border border-white/[0.06] rounded-lg hover:bg-white/[0.05] hover:text-zinc-300 transition-colors"
        >
          Trade
        </button>
        {showTrade && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowTrade(false)} />
            <div className="absolute left-0 right-0 bottom-full mb-2 z-50 bg-zinc-900 border border-white/[0.1] rounded-lg shadow-xl p-3 text-center">
              <p className="text-xs font-medium text-white mb-0.5">Coming Soon</p>
              <p className="text-[10px] text-zinc-500">Non-custodial trading on Polymarket</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
