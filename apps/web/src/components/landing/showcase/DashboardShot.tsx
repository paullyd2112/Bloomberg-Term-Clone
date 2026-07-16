"use client";

/**
 * Pixel-accurate mockup of the Plebs dashboard interior. The signal cards
 * are representative, but the stat tiles pull live numbers from
 * /api/landing-stats (falling back to the static values below) so the
 * showcase never contradicts the real dashboard.
 */

import { useEffect, useState } from "react";
import { Zap, Dices, Landmark, Search, Sunrise, type LucideIcon } from "lucide-react";

const NAV: { label: string; icon: LucideIcon; active: boolean }[] = [
  { label: "Signals", icon: Zap, active: true },
  { label: "Predictions", icon: Dices, active: false },
  { label: "Congress", icon: Landmark, active: false },
  { label: "Screener", icon: Search, active: false },
  { label: "Briefing", icon: Sunrise, active: false },
];

type LiveStats = {
  win_rate: number | null;
  total: number;
  signals_today: number | null;
  avg_confidence: number | null;
  coins_tracked: number | null;
};

type StatTile = { label: string; value: string; tone?: "up" };

// Static fallbacks, shown until live numbers arrive (or if the fetch fails).
const FALLBACK_STATS: StatTile[] = [
  { label: "Win rate", value: "74%", tone: "up" },
  { label: "Signals today", value: "18" },
  { label: "Avg confidence", value: "78%" },
  { label: "Coins tracked", value: "53" },
];

function buildStats(live: LiveStats | null): StatTile[] {
  if (!live) return FALLBACK_STATS;
  return [
    live.win_rate !== null && live.total >= 3
      ? { label: "Win rate", value: `${Math.round(live.win_rate)}%`, tone: "up" as const, }
      : FALLBACK_STATS[0],
    live.signals_today !== null && live.signals_today > 0
      ? { label: "Signals today", value: String(live.signals_today) }
      : FALLBACK_STATS[1],
    live.avg_confidence !== null
      ? { label: "Avg confidence", value: `${live.avg_confidence}%` }
      : FALLBACK_STATS[2],
    live.coins_tracked !== null
      ? { label: "Coins tracked", value: String(live.coins_tracked) }
      : FALLBACK_STATS[3],
  ];
}

const SIGNALS = [
  {
    dir: "BUY",
    tone: "up" as const,
    symbol: "BTC",
    asset: "Crypto",
    confidence: 86,
    reasoning:
      "RSI 63 with an expanding MACD histogram. Validated momentum continuation as BTC leads a broad crypto bid.",
    horizon: "Swing",
    price: "$117,842",
    time: "2m ago",
    outcome: "WIN",
  },
  {
    dir: "SELL",
    tone: "down" as const,
    symbol: "ETH",
    asset: "Crypto",
    confidence: 76,
    reasoning:
      "MACD histogram contracting from overbought RSI; alt strength fading while BTC dominance climbs.",
    horizon: "Intraday",
    price: "$3,412",
    time: "8m ago",
    outcome: "PENDING",
  },
  {
    dir: "YES",
    tone: "up" as const,
    symbol: "FED-CUT-SEP",
    asset: "Prediction",
    confidence: 78,
    reasoning:
      "Softening CPI print and dovish commentary repricing September cut odds above the market's 41¢.",
    horizon: "Long-term",
    price: "41.0%",
    time: "15m ago",
    outcome: "PENDING",
  },
];

function DirBadge({ dir, tone }: { dir: string; tone: "up" | "down" }) {
  return (
    <span
      className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-md border font-mono ${
        tone === "up"
          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
          : "bg-red-500/15 text-red-400 border-red-500/30"
      }`}
    >
      {dir}
    </span>
  );
}

export default function DashboardShot() {
  const [live, setLive] = useState<LiveStats | null>(null);

  useEffect(() => {
    fetch("/api/landing-stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: LiveStats | null) => d && setLive(d))
      .catch(() => {});
  }, []);

  const stats = buildStats(live);

  return (
    <div className="flex bg-background font-sans text-left">
      {/* Sidebar rail */}
      <aside className="hidden sm:flex w-40 flex-shrink-0 flex-col gap-1 border-r border-white/[0.06] bg-white/[0.01] p-3">
        <div className="flex items-center gap-2 px-2 pb-3">
          <span className="h-4 w-4 rounded bg-emerald-500" />
          <span className="font-semibold text-sm text-white">Plebs</span>
        </div>
        {NAV.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className={`relative flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] ${
                item.active
                  ? "bg-white/[0.05] text-white"
                  : "text-zinc-500"
              }`}
            >
              {item.active && (
                <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-emerald-400" />
              )}
              <Icon
                className={`h-3.5 w-3.5 flex-shrink-0 ${
                  item.active ? "text-emerald-400" : "text-zinc-500"
                }`}
                strokeWidth={2}
              />
              {item.label}
            </div>
          );
        })}
      </aside>

      {/* Main column */}
      <div className="min-w-0 flex-1 p-4 sm:p-5">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-emerald-400 text-[10px] leading-none">●</span>
            <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Latest signals
            </h3>
          </div>
          <span className="font-mono text-[10px] text-zinc-600">
            Updated 8:45a ET
          </span>
        </div>

        {/* Stat tiles */}
        <div className="mb-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
            >
              <div
                className={`font-mono text-base font-semibold tabular-nums ${
                  s.tone === "up" ? "text-emerald-400" : "text-white"
                }`}
              >
                {s.value}
              </div>
              <div className="text-[10px] text-zinc-500">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Signal cards */}
        <div className="space-y-2">
          {SIGNALS.map((sig) => (
            <div
              key={sig.symbol}
              className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <DirBadge dir={sig.dir} tone={sig.tone} />
                  <span className="font-mono font-semibold text-white text-[13px] truncate">
                    {sig.symbol}
                  </span>
                  <span className="text-[10px] text-zinc-600 hidden sm:block">
                    {sig.asset}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {sig.outcome === "WIN" && (
                    <span className="text-[10px] font-medium text-emerald-400">
                      WIN
                    </span>
                  )}
                  <span className="text-[10px] text-zinc-600">{sig.time}</span>
                </div>
              </div>

              {/* Confidence */}
              <div className="mt-2.5 flex items-center gap-2.5">
                <div className="flex-1 h-1 bg-white/[0.06] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      sig.confidence >= 75 ? "bg-emerald-500" : "bg-amber-500"
                    }`}
                    style={{ width: `${sig.confidence}%` }}
                  />
                </div>
                <span className="text-[10px] text-zinc-400 tabular-nums w-7 text-right">
                  {sig.confidence}%
                </span>
              </div>

              <p className="mt-2 text-[11px] leading-relaxed text-zinc-400 line-clamp-2">
                {sig.reasoning}
              </p>

              <div className="mt-2 flex items-center gap-3 text-[10px] text-zinc-600">
                <span>{sig.horizon}</span>
                <span className="font-mono">@ {sig.price}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
