"use client";

import { useEffect, useState } from "react";

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

export default function TickerBar() {
  const [items, setItems] = useState<TickerItem[]>([]);

  async function load() {
    try {
      const res = await fetch("/api/ticker");
      if (!res.ok) return;
      const { items } = await res.json();
      if (Array.isArray(items) && items.length > 0) setItems(items);
    } catch {}
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

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
