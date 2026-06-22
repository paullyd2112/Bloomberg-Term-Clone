"use client";

import { useEffect, useState } from "react";

type TickerItem = {
  identifier: string;
  price: number;
  change_24h: number;
  asset_type: string;
};

// Representative signal directions shown on the marketing page.
// Real, account-specific signals live behind auth in the dashboard.
const DISPLAY = [
  { symbol: "NVDA", asset: "Equity", dir: "BUY" },
  { symbol: "BTC", asset: "Crypto", dir: "BUY" },
  { symbol: "TSLA", asset: "Equity", dir: "SELL" },
  { symbol: "ETH", asset: "Crypto", dir: "BUY" },
  { symbol: "SOL", asset: "Crypto", dir: "BUY" },
] as const;

function formatPrice(n: number) {
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (n >= 1) return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

export default function LiveSignalFeed() {
  const [prices, setPrices] = useState<Record<string, TickerItem>>({});
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [now, setNow] = useState<Date | null>(null);

  // Tick the clock every second so the timestamp stays live.
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const res = await fetch("/api/ticker", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { items: TickerItem[] };
        if (!active) return;
        const map: Record<string, TickerItem> = {};
        for (const item of data.items) map[item.identifier] = item;
        setPrices(map);
        setUpdatedAt(new Date());
      } catch {
        // keep last good values
      }
    };

    load();
    const id = setInterval(load, 60_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="relative">
      <div className="pointer-events-none absolute -inset-6 bg-emerald-500/[0.06] blur-3xl rounded-full" />

      <div className="relative rounded-2xl border border-white/10 bg-zinc-950/90 backdrop-blur-sm overflow-hidden ring-hairline shadow-2xl shadow-black/60">
        {/* window chrome */}
        <div className="flex items-center gap-2 border-b border-white/[0.06] bg-white/[0.02] px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
          <div className="ml-3 font-mono text-[11px] text-zinc-500">
            <span className="text-zinc-400">plebs</span>
            <span className="text-zinc-700"> / </span>
            <span>live signal feed</span>
          </div>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-emerald-700/40 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] text-emerald-400">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            LIVE
          </span>
        </div>

        {/* rows */}
        <div className="divide-y divide-white/[0.04]">
          {DISPLAY.map((row) => {
            const live = prices[row.symbol];
            const change = live?.change_24h ?? 0;
            const up = change >= 0;
            return (
              <div
                key={row.symbol}
                className="grid grid-cols-[52px_1fr_auto] gap-3 px-4 py-3.5 items-center hover:bg-white/[0.02] transition-colors"
              >
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded border font-mono text-center ${
                    row.dir === "SELL"
                      ? "text-rose-400 border-rose-700/50 bg-rose-500/10"
                      : "text-emerald-400 border-emerald-700/50 bg-emerald-500/10"
                  }`}
                >
                  {row.dir}
                </span>

                <div className="min-w-0">
                  <div className="font-mono font-semibold text-white text-sm tabular-nums truncate">
                    {row.symbol}
                  </div>
                  <div className="text-[11px] text-zinc-600">{row.asset}</div>
                </div>

                <div className="flex flex-col items-end">
                  <span className="font-mono text-sm text-white tabular-nums">
                    {live ? `$${formatPrice(live.price)}` : "—"}
                  </span>
                  <span
                    className={`font-mono text-[11px] tabular-nums ${
                      up ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {live ? `${up ? "+" : ""}${change.toFixed(2)}%` : "··"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t border-white/[0.06] bg-white/[0.02] px-4 py-2.5 font-mono text-[10px] text-zinc-600">
          <span>Live prices · signals are representative</span>
          <span className="tabular-nums">
            {now && updatedAt
              ? `Live ${now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
              : "Connecting…"}
          </span>
        </div>
      </div>
    </div>
  );
}
