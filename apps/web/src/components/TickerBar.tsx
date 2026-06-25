"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type TickerItem = {
  identifier: string;
  price:      number;
  change_24h: number | null;
  asset_type: string;
};

function fmt(price: number): string {
  if (price >= 10_000) return price.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (price >= 1)      return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return price.toPrecision(4);
}

function Item({ item }: { item: TickerItem }) {
  const change = item.change_24h;
  const positive = change != null && change >= 0;
  const changeColor = positive ? "text-emerald-400" : "text-red-400";
  const bgColor = positive ? "bg-emerald-500/10" : "bg-red-500/10";

  return (
    <div className="inline-flex items-center gap-2.5 px-4 sm:px-5 whitespace-nowrap">
      <span className="font-mono text-[13px] font-semibold text-white">{item.identifier}</span>
      <span className="font-mono text-[13px] text-zinc-300 tabular-nums">${fmt(item.price)}</span>
      {change != null && (
        <span className={`font-mono text-[11px] font-medium tabular-nums px-1.5 py-0.5 rounded ${changeColor} ${bgColor}`}>
          {positive ? "▲" : "▼"} {Math.abs(change).toFixed(2)}%
        </span>
      )}
    </div>
  );
}

function isMarketOpen(): boolean {
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = et.getDay();
  if (day === 0 || day === 6) return false;
  const mins = et.getHours() * 60 + et.getMinutes();
  return mins >= 570 && mins < 960; // 9:30am – 4:00pm ET
}

function nudgePrice(base: number): number {
  const magnitude = base * 0.0003;
  const delta = (Math.random() - 0.5) * 2 * magnitude;
  return Math.max(0.0001, base + delta);
}

export default function TickerBar() {
  const [items, setItems] = useState<TickerItem[]>([]);
  const baseItems = useRef<TickerItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/ticker");
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.items) && data.items.length > 0) {
        baseItems.current = data.items;
        setItems(data.items);
        setLoaded(true);
      }
    } catch {}
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (!loaded) return;
    const id = setInterval(() => {
      const open = isMarketOpen();
      setItems(baseItems.current.map((item) => ({
        ...item,
        price: (item.asset_type === "crypto" || open)
          ? nudgePrice(item.price)
          : item.price,
      })));
    }, 2500);
    return () => clearInterval(id);
  }, [loaded]);

  if (items.length === 0) return null;

  return (
    <div className="relative bg-black border-b border-white/[0.06] h-10 flex items-center overflow-hidden select-none">
      {/* Fade edges */}
      <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-12 z-10 bg-gradient-to-r from-black to-transparent" />
      <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-12 z-10 bg-gradient-to-l from-black to-transparent" />

      <div className="flex animate-marquee">
        {[...items, ...items].map((item, i) => (
          <Item key={`${item.identifier}-${i}`} item={item} />
        ))}
      </div>
    </div>
  );
}
