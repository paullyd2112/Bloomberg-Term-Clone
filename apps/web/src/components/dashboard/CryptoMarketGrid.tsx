"use client";

import Link from "next/link";
import { clsx } from "clsx";

type CoinData = {
  identifier: string;
  price: number;
  change_24h: number | null;
  asset_type: string;
  sparkline?: number[];
};

function MiniSparkline({ points, positive }: { points: number[]; positive: boolean }) {
  if (points.length < 2) return null;
  const w = 48;
  const h = 20;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  const d = points
    .map((v, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="flex-shrink-0" aria-hidden>
      <path
        d={d}
        fill="none"
        stroke={positive ? "#00d4aa" : "#ef4444"}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function formatPrice(price: number): string {
  if (price >= 10_000) return `$${price.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (price >= 1) return `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  return `$${price.toPrecision(3)}`;
}

export default function CryptoMarketGrid({ coins }: { coins: CoinData[] }) {
  if (coins.length === 0) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
      {coins.map((coin) => {
        const change = coin.change_24h ?? 0;
        const positive = change >= 0;
        return (
          <Link
            key={coin.identifier}
            href={`/dashboard/asset/${coin.asset_type}/${coin.identifier}`}
            className={clsx(
              "group relative rounded-lg p-3 transition-all",
              "bg-white/[0.02] border border-white/[0.06]",
              "hover:bg-white/[0.05] hover:border-white/[0.12] hover:-translate-y-px",
            )}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[11px] font-bold text-white tracking-wide">
                {coin.identifier}
              </span>
              <MiniSparkline points={coin.sparkline ?? []} positive={positive} />
            </div>

            <div className="font-mono text-sm font-semibold text-white tabular-nums">
              {formatPrice(coin.price)}
            </div>

            <div className="flex items-center gap-1.5 mt-1">
              <span
                className={clsx(
                  "font-mono text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded",
                  positive
                    ? "text-[#00d4aa] bg-[#00d4aa]/10"
                    : "text-red-400 bg-red-500/10",
                )}
              >
                {positive ? "+" : "−"}{Math.abs(change).toFixed(2)}%
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
