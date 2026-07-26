"use client";

import { clsx } from "clsx";

type Props = {
  accountSize: number;
  currentBalance: number;
  profitTarget: number;
  maxDrawdown: number;
  daysElapsed: number;
  maxDays: number;
  worstDrawdown: number;
};

function progressColor(pct: number): string {
  if (pct >= 0.75) return "bg-[#00d4aa]";
  if (pct >= 0.4) return "bg-amber-400";
  return "bg-zinc-600";
}

export default function ChallengeProgress({
  accountSize,
  currentBalance,
  profitTarget,
  maxDrawdown,
  daysElapsed,
  maxDays,
  worstDrawdown,
}: Props) {
  const profitMade = currentBalance - accountSize;
  const profitPct = Math.max(0, Math.min(profitMade / profitTarget, 1));
  const daysPct = maxDays > 0 ? Math.min(daysElapsed / maxDays, 1) : 0;
  const ddUsed = maxDrawdown > 0 ? Math.min(worstDrawdown / maxDrawdown, 1) : 0;
  const ddRemaining = 1 - ddUsed;

  const passed = profitPct >= 1;
  const breached = ddUsed >= 1;

  return (
    <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-5">
      {/* Status badge */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[11px] font-mono font-semibold uppercase tracking-[0.15em] text-zinc-500">
          Challenge Progress
        </h3>
        <span
          className={clsx(
            "px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border",
            passed
              ? "text-[#00d4aa] bg-[#00d4aa]/10 border-[#00d4aa]/20"
              : breached
              ? "text-red-400 bg-red-500/10 border-red-500/20"
              : "text-amber-400 bg-amber-500/10 border-amber-500/20",
          )}
        >
          {passed ? "PASSED" : breached ? "BREACHED" : "IN PROGRESS"}
        </span>
      </div>

      <div className="space-y-4">
        {/* Profit target */}
        <div>
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-xs text-zinc-400">Profit Target</span>
            <span className="font-mono text-xs tabular-nums text-white">
              ${profitMade.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              <span className="text-zinc-600"> / ${profitTarget.toLocaleString()}</span>
            </span>
          </div>
          <div className="h-2 rounded-full bg-white/[0.04] overflow-hidden">
            <div
              className={clsx("h-full rounded-full transition-all", progressColor(profitPct))}
              style={{ width: `${profitPct * 100}%` }}
            />
          </div>
          <div className="text-right mt-0.5">
            <span className="text-[10px] font-mono text-zinc-600">{(profitPct * 100).toFixed(1)}%</span>
          </div>
        </div>

        {/* Drawdown headroom */}
        <div>
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-xs text-zinc-400">Drawdown Headroom</span>
            <span className="font-mono text-xs tabular-nums text-white">
              ${(maxDrawdown - worstDrawdown).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              <span className="text-zinc-600"> remaining</span>
            </span>
          </div>
          <div className="h-2 rounded-full bg-white/[0.04] overflow-hidden">
            <div
              className={clsx(
                "h-full rounded-full transition-all",
                ddRemaining >= 0.5 ? "bg-[#00d4aa]" : ddRemaining >= 0.25 ? "bg-amber-400" : "bg-red-400",
              )}
              style={{ width: `${ddRemaining * 100}%` }}
            />
          </div>
          <div className="flex justify-between mt-0.5">
            <span className={clsx(
              "text-[10px] font-mono",
              ddUsed >= 0.8 ? "text-red-400" : "text-zinc-600",
            )}>
              {(ddUsed * 100).toFixed(1)}% used
            </span>
            <span className="text-[10px] font-mono text-zinc-600">
              {(ddRemaining * 100).toFixed(1)}% left
            </span>
          </div>
        </div>

        {/* Days elapsed */}
        {maxDays > 0 && (
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-xs text-zinc-400">Time Elapsed</span>
              <span className="font-mono text-xs tabular-nums text-white">
                Day {daysElapsed}
                <span className="text-zinc-600"> / {maxDays}</span>
              </span>
            </div>
            <div className="h-2 rounded-full bg-white/[0.04] overflow-hidden">
              <div
                className="h-full rounded-full bg-[#4f8cff] transition-all"
                style={{ width: `${daysPct * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
