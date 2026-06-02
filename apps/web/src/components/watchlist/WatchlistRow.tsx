"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type WatchlistItem = {
  id: number;
  asset_type: string;
  identifier: string;
  created_at: string;
  latest_signal?: {
    direction: string;
    confidence: number;
    created_at: string;
  } | null;
  latest_price?: {
    price: number | null;
    change_24h: number | null;
  } | null;
};

const DIR_COLOR: Record<string, string> = {
  BUY:  "text-green-400",
  YES:  "text-green-400",
  SELL: "text-red-400",
  NO:   "text-red-400",
  HOLD: "text-zinc-400",
};

export default function WatchlistRow({ item }: { item: WatchlistItem }) {
  const router  = useRouter();
  const [removing, setRemoving] = useState(false);

  async function handleRemove() {
    setRemoving(true);
    await fetch(`/api/watchlist?id=${item.id}`, { method: "DELETE" });
    router.refresh();
  }

  const change = item.latest_price?.change_24h;

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 hover:bg-zinc-800/30 transition-colors group">
      {/* Asset info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/asset/${item.asset_type}/${encodeURIComponent(item.identifier)}`}
            className="font-mono font-semibold text-white text-sm hover:text-green-400 transition-colors"
          >
            {item.identifier}
          </Link>
          <span className="text-xs text-zinc-600 capitalize">{item.asset_type}</span>
        </div>
      </div>

      {/* Price */}
      <div className="text-right min-w-[80px]">
        {item.latest_price?.price != null ? (
          <>
            <div className="text-sm text-white font-mono tabular-nums">
              {item.asset_type === "prediction"
                ? `${(item.latest_price.price * 100).toFixed(1)}%`
                : `$${Number(item.latest_price.price).toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
            </div>
            {change != null && (
              <div className={`text-xs tabular-nums ${change >= 0 ? "text-green-400" : "text-red-400"}`}>
                {change >= 0 ? "+" : ""}{Number(change).toFixed(2)}%
              </div>
            )}
          </>
        ) : (
          <span className="text-xs text-zinc-600">—</span>
        )}
      </div>

      {/* Latest signal */}
      <div className="min-w-[64px] text-right">
        {item.latest_signal ? (
          <div className="flex items-center gap-1 justify-end">
            <span className={`text-xs font-bold ${DIR_COLOR[item.latest_signal.direction] ?? "text-zinc-400"}`}>
              {item.latest_signal.direction}
            </span>
            <span className="text-xs text-zinc-500 tabular-nums">
              {item.latest_signal.confidence}%
            </span>
          </div>
        ) : (
          <span className="text-xs text-zinc-700">No signal</span>
        )}
      </div>

      {/* Remove button */}
      <button
        onClick={handleRemove}
        disabled={removing}
        className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all text-sm px-1"
        title="Remove from watchlist"
      >
        {removing ? "…" : "✕"}
      </button>
    </div>
  );
}
