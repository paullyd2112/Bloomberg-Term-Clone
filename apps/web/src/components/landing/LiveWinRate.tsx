"use client";

import { useEffect, useState } from "react";

type Stats = {
  wins: number | null;
  losses: number | null;
  total: number;
  win_rate: number | null;
};

/**
 * Live crypto win-rate proof chip for the hero. Pulls real resolved-signal
 * stats from /api/landing-stats so the marketing claim is always the actual
 * tracked number, never a stale hardcode. Falls back to the transparency
 * line when there aren't enough resolved signals (or the rate isn't worth
 * bragging about).
 */
export default function LiveWinRate() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/landing-stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Stats | null) => d && setStats(d))
      .catch(() => {});
  }, []);

  const showLive =
    stats !== null && stats.total >= 3 && (stats.win_rate ?? 0) >= 55;

  return (
    <div className="mt-6 inline-flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] px-3.5 py-2">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
      </span>
      {showLive ? (
        <>
          <span className="font-mono text-[13px] font-semibold tabular-nums text-emerald-400">
            {stats!.win_rate}% crypto win rate
          </span>
          <span className="text-[11px] text-zinc-500">
            {stats!.wins}W–{stats!.losses}L, last {stats!.total} resolved ·
            tracked live, misses included
          </span>
        </>
      ) : (
        <>
          <span className="font-mono text-[13px] font-semibold text-emerald-400">
            Every signal tracked to outcome
          </span>
          <span className="text-[11px] text-zinc-500">
            win rates published live, misses included
          </span>
        </>
      )}
    </div>
  );
}
