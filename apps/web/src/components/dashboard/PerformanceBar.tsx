"use client";

import { clsx } from "clsx";

type MonthBucket = { month: string; wins: number; losses: number; winRate: number };

type Props = {
  overallWinRate: number;
  totalWins: number;
  totalLosses: number;
  totalResolved: number;
  byMonth: MonthBucket[];
  yesterday: { wins: number; losses: number; winRate: number; resolved: number } | null;
};

function rateColor(rate: number): string {
  if (rate >= 0.55) return "text-[#00d4aa]";
  if (rate >= 0.45) return "text-amber-400";
  return "text-red-400";
}

function barColor(rate: number): string {
  if (rate >= 0.55) return "bg-[#00d4aa]";
  if (rate >= 0.45) return "bg-amber-400";
  return "bg-red-400";
}

function monthLabel(iso: string): string {
  const [, m] = iso.split("-");
  const months = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return months[parseInt(m, 10)] ?? iso;
}

export default function PerformanceBar({ overallWinRate, totalWins, totalLosses, totalResolved, byMonth, yesterday }: Props) {
  const maxResolved = Math.max(...byMonth.map((m) => m.wins + m.losses), 1);

  return (
    <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 sm:p-5">
      {/* Header row */}
      <div className="flex items-baseline justify-between mb-4">
        <div className="flex items-baseline gap-3">
          <span className={clsx("text-3xl font-bold tabular-nums tracking-tight", rateColor(overallWinRate))}>
            {(overallWinRate * 100).toFixed(1)}%
          </span>
          <span className="text-xs text-zinc-500 font-mono">
            {totalWins}W – {totalLosses}L · {totalResolved} signals
          </span>
        </div>
        {yesterday && (
          <div className="hidden sm:flex items-baseline gap-1.5">
            <span className="text-[10px] text-zinc-600 uppercase tracking-wider font-mono">24h</span>
            <span className={clsx("font-mono text-sm font-bold tabular-nums", rateColor(yesterday.winRate))}>
              {(yesterday.winRate * 100).toFixed(0)}%
            </span>
            <span className="text-[10px] text-zinc-600 font-mono">
              ({yesterday.wins}W-{yesterday.losses}L)
            </span>
          </div>
        )}
      </div>

      {/* Monthly bar chart */}
      {byMonth.length > 0 && (
        <div className="flex items-end gap-1 h-16">
          {byMonth.map((m) => {
            const resolved = m.wins + m.losses;
            const barHeight = (resolved / maxResolved) * 100;
            return (
              <div key={m.month} className="flex-1 flex flex-col items-center gap-1 group relative">
                <div className="w-full flex flex-col justify-end h-12">
                  <div
                    className={clsx("w-full rounded-sm transition-all group-hover:opacity-80", barColor(m.winRate))}
                    style={{ height: `${barHeight}%`, minHeight: resolved > 0 ? "4px" : "0" }}
                  />
                </div>
                <span className="text-[8px] text-zinc-600 font-mono leading-none">
                  {monthLabel(m.month)}
                </span>
                {/* Tooltip on hover */}
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:block z-20">
                  <div className="bg-zinc-900 border border-white/[0.1] rounded-md px-2 py-1.5 text-center whitespace-nowrap shadow-xl">
                    <div className={clsx("text-xs font-bold tabular-nums", rateColor(m.winRate))}>
                      {(m.winRate * 100).toFixed(0)}%
                    </div>
                    <div className="text-[9px] text-zinc-500 font-mono">{m.wins}W-{m.losses}L</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
