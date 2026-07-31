"use client";

import { useState } from "react";
import { clsx } from "clsx";

type MonthBucket = { month: string; wins: number; losses: number; winRate: number };

type PlatformAccuracy = {
  overallWinRate: number;
  totalResolved: number;
  totalWins: number;
  totalLosses: number;
  byAssetClass: { asset_type: string; winRate: number; resolved: number }[];
  byMonth: MonthBucket[];
  yesterday: { wins: number; losses: number; winRate: number; resolved: number } | null;
};

function rateColor(rate: number): string {
  if (rate >= 0.55) return "text-emerald-400";
  if (rate >= 0.45) return "text-amber-400";
  return "text-red-400";
}

function Sparkline({ months }: { months: MonthBucket[] }) {
  if (months.length < 2) return null;

  const rates = months.map((m) => m.winRate);
  const min = Math.min(...rates);
  const max = Math.max(...rates);
  const range = max - min || 0.1;

  const w = 100;
  const h = 28;
  const pad = 2;

  const points = rates.map((r, i) => {
    const x = pad + (i / (rates.length - 1)) * (w - pad * 2);
    const y = h - pad - ((r - min) / range) * (h - pad * 2);
    return `${x},${y}`;
  });

  const last = rates[rates.length - 1];
  const lastX = w - pad;
  const lastY = h - pad - ((last - min) / range) * (h - pad * 2);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-[100px] h-[28px] flex-shrink-0" aria-hidden>
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={rateColor(last).replace("text-", "text-")}
      />
      <circle
        cx={lastX}
        cy={lastY}
        r="2.5"
        className={clsx("fill-current", rateColor(last))}
      />
    </svg>
  );
}

export default function TrackRecord({ accuracy }: { accuracy: PlatformAccuracy }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-white/[0.02] transition-colors text-left"
      >
        {/* Hero win rate */}
        <div className="flex items-baseline gap-2 flex-shrink-0">
          <span className={clsx("text-2xl font-bold tabular-nums", rateColor(accuracy.overallWinRate))}>
            {(accuracy.overallWinRate * 100).toFixed(1)}%
          </span>
          <span className="text-xs text-zinc-500">win rate</span>
        </div>

        {/* W-L record */}
        <div className="hidden sm:flex items-baseline gap-1.5 text-xs text-zinc-500 flex-shrink-0">
          <span className="tabular-nums">{accuracy.totalWins}W – {accuracy.totalLosses}L</span>
          <span className="text-zinc-600">·</span>
          <span className="tabular-nums">{accuracy.totalResolved} signals</span>
        </div>

        {/* Sparkline — visible on all viewports */}
        {accuracy.byMonth.length >= 2 && (
          <div className="ml-auto">
            <Sparkline months={accuracy.byMonth} />
          </div>
        )}

        {/* Yesterday badge */}
        {accuracy.yesterday && (
          <div className="ml-auto sm:ml-3 flex items-baseline gap-1.5 flex-shrink-0">
            <span className="text-[10px] text-zinc-600 uppercase tracking-wider">Yday</span>
            <span className={clsx("font-mono text-xs font-semibold tabular-nums", rateColor(accuracy.yesterday.winRate))}>
              {(accuracy.yesterday.winRate * 100).toFixed(0)}%
            </span>
          </div>
        )}

        {/* Chevron */}
        <svg
          className={clsx("h-4 w-4 text-zinc-600 transition-transform flex-shrink-0", expanded && "rotate-180")}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="px-5 pb-4 pt-1 border-t border-white/[0.06] space-y-4">
          {/* By asset class */}
          <div>
            <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-2">By asset</div>
            <div className="space-y-1.5">
              {accuracy.byAssetClass.map((a) => (
                <div key={a.asset_type} className="flex items-baseline justify-between">
                  <span className="text-xs text-zinc-400 capitalize">{a.asset_type}</span>
                  <div className="flex items-baseline gap-1.5">
                    <span className={clsx("text-sm font-semibold tabular-nums", rateColor(a.winRate))}>
                      {(a.winRate * 100).toFixed(1)}%
                    </span>
                    <span className="text-[10px] text-zinc-600">
                      ({a.resolved} signal{a.resolved === 1 ? "" : "s"})
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Month over month */}
          {accuracy.byMonth.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-2">Month over month</div>
              <div className="flex gap-4 overflow-x-auto scrollbar-none pb-1">
                {accuracy.byMonth.map((m) => {
                  return (
                    <div key={m.month} className="flex-shrink-0 min-w-[72px]">
                      <div className="text-xs text-zinc-500 font-mono">{m.month}</div>
                      <div className={clsx("text-base font-bold tabular-nums", rateColor(m.winRate))}>
                        {(m.winRate * 100).toFixed(0)}%
                      </div>
                      <div className="text-[10px] text-zinc-600">
                        {m.wins}W – {m.losses}L
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
