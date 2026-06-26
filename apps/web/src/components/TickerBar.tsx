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
    <div className="inline-flex items-center gap-2 px-5 sm:px-6 whitespace-nowrap">
      <span className="font-mono text-[12px] font-semibold text-zinc-300 tracking-wide">{item.identifier}</span>
      <span className="font-mono text-[12px] text-zinc-400 tabular-nums">${fmt(item.price)}</span>
      {change != null && (
        <span className={`font-mono text-[10px] font-medium tabular-nums ${changeColor}`}>
          {positive ? "+" : ""}{Math.abs(change).toFixed(2)}%
        </span>
      )}
      <span className="text-white/[0.06] ml-1">|</span>
    </div>
  );
}

const NYSE_HOLIDAYS: Set<string> = new Set([
  // 2026
  "2026-01-01","2026-01-19","2026-02-16","2026-04-03","2026-05-25",
  "2026-06-19","2026-07-03","2026-09-07","2026-11-26","2026-12-25",
  // 2027
  "2027-01-01","2027-01-18","2027-02-15","2027-03-26","2027-05-31",
  "2027-06-18","2027-07-05","2027-09-06","2027-11-25","2027-12-24",
]);

function isMarketOpen(): boolean {
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = et.getDay();
  if (day === 0 || day === 6) return false;
  const yyyy = et.getFullYear();
  const mm = String(et.getMonth() + 1).padStart(2, "0");
  const dd = String(et.getDate()).padStart(2, "0");
  if (NYSE_HOLIDAYS.has(`${yyyy}-${mm}-${dd}`)) return false;
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
    <div className="relative bg-black/60 backdrop-blur-sm border-b border-white/[0.06] h-10 flex items-center overflow-hidden select-none">
      <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-20 z-10 bg-gradient-to-r from-black to-transparent" />
      <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-20 z-10 bg-gradient-to-l from-black to-transparent" />

      <div className="flex animate-marquee">
        {[...items, ...items].map((item, i) => (
          <Item key={`${item.identifier}-${i}`} item={item} />
        ))}
      </div>
    </div>
  );
}
