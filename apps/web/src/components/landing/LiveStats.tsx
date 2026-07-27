"use client";

import { useEffect, useState } from "react";

type Stats = {
  coins_tracked: number | null;
  prediction_markets: number | null;
  whale_wallets: number | null;
  whale_trades_24h: number | null;
};

const FALLBACK: { value: string; label: string }[] = [
  { value: "50+", label: "Coins scored" },
  { value: "12×", label: "Scoring runs / day" },
  { value: "20", label: "Whale wallets tracked" },
  { value: "14d", label: "Free trial" },
];

export default function LiveStats() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/landing-stats")
      .then((r) => r.json())
      .then((d) => setStats(d))
      .catch(() => {});
  }, []);

  const items = stats
    ? [
        {
          value: stats.coins_tracked ? `${stats.coins_tracked}` : "50+",
          label: "Coins scored",
        },
        {
          value: stats.prediction_markets ? `${stats.prediction_markets}` : "500+",
          label: "Prediction markets",
        },
        {
          value: stats.whale_wallets ? `${stats.whale_wallets}` : "20",
          label: "Whale wallets tracked",
        },
        { value: "14d", label: "Free trial" },
      ]
    : FALLBACK;

  return (
    <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 border-t border-l border-white/[0.06]">
      {items.map((item) => (
        <div key={item.label} className="py-10 px-6 border-b border-r border-white/[0.06]">
          <div className="font-mono text-3xl sm:text-4xl font-semibold text-white tracking-tightest tabular-nums">
            {item.value}
          </div>
          <div className="text-muted-foreground text-sm mt-2">{item.label}</div>
        </div>
      ))}
    </div>
  );
}
