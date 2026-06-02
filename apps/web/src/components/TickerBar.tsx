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
  return (
    <span className="inline-flex items-center gap-1.5 px-5 text-[11px] whitespace-nowrap">
      <span className="font-mono font-bold text-white tracking-wide">{item.identifier}</span>
      <span className="text-zinc-400">${fmt(item.price)}</span>
      {change != null && (
        <span className={positive ? "text-green-400" : "text-red-400"}>
          {positive ? "+" : ""}{change.toFixed(2)}%
        </span>
      )}
      <span className="text-zinc-700 pl-3">|</span>
    </span>
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
    <div className="bg-zinc-950 border-b border-zinc-800 h-8 flex items-center overflow-hidden select-none">
      <div className="flex animate-marquee">
        {[...items, ...items].map((item, i) => (
          <Item key={`${item.identifier}-${i}`} item={item} />
        ))}
      </div>
    </div>
  );
}
