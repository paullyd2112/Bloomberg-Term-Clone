"use client";

import { useCallback, useEffect, useState } from "react";

type TickerItem = {
  identifier: string;
  price:      number;
  change_24h: number | null;
  asset_type: string;
};

type MarketStatus = "open" | "closed" | "weekend";

function getMarketStatus(): MarketStatus {
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = et.getDay();
  if (day === 0 || day === 6) return "weekend";
  const yyyy = et.getFullYear();
  const mm = String(et.getMonth() + 1).padStart(2, "0");
  const dd = String(et.getDate()).padStart(2, "0");
  if (NYSE_HOLIDAYS.has(`${yyyy}-${mm}-${dd}`)) return "weekend"; // holidays treated like weekends
  const mins = et.getHours() * 60 + et.getMinutes();
  if (mins >= 570 && mins < 960) return "open"; // 9:30am – 4:00pm ET
  return "closed";
}

const STATUS_CONFIG: Record<MarketStatus, { dot: string; ping: string; label: string; bg: string; border: string; text: string }> = {
  open: {
    dot: "bg-emerald-400",
    ping: "bg-emerald-400",
    label: "Markets Open",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    text: "text-emerald-400",
  },
  closed: {
    dot: "bg-amber-400",
    ping: "bg-amber-400",
    label: "Crypto 24/7",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    text: "text-amber-400",
  },
  weekend: {
    dot: "bg-blue-400",
    ping: "bg-blue-400",
    label: "Crypto 24/7",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
    text: "text-blue-400",
  },
};

export function MarketStatusBadge({ className = "" }: { className?: string }) {
  const [status, setStatus] = useState<MarketStatus>(getMarketStatus);

  useEffect(() => {
    const id = setInterval(() => setStatus(getMarketStatus()), 30_000);
    return () => clearInterval(id);
  }, []);

  const cfg = STATUS_CONFIG[status];

  return (
    <div className={`inline-flex items-center gap-2 rounded-full border ${cfg.border} ${cfg.bg} px-3 py-1 ${className}`}>
      <span className="relative flex h-1.5 w-1.5">
        <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${cfg.ping} opacity-60`} />
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      </span>
      <span className={`font-mono text-[10px] font-medium uppercase tracking-[0.15em] ${cfg.text} whitespace-nowrap`}>
        {cfg.label}
      </span>
    </div>
  );
}

function fmt(price: number): string {
  if (price >= 10_000) return price.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (price >= 1)      return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return price.toPrecision(4);
}

function Item({ item }: { item: TickerItem }) {
  const change = item.change_24h;
  const positive = change != null && change >= 0;

  return (
    <div className="inline-flex items-center gap-2.5 pl-5 whitespace-nowrap">
      <span className="font-mono text-[12px] font-semibold text-zinc-200 tracking-wide">{item.identifier}</span>
      <span className="font-mono text-[12px] text-zinc-500 tabular-nums">${fmt(item.price)}</span>
      {change != null && (
        <span
          className={`inline-flex items-center font-mono text-[10px] font-semibold tabular-nums rounded px-1.5 py-0.5 ${
            positive
              ? "text-emerald-400 bg-emerald-500/10"
              : "text-red-400 bg-red-500/10"
          }`}
        >
          {positive ? "+" : "\u2212"}{Math.abs(change).toFixed(2)}%
        </span>
      )}
      <span className="ml-3 h-3.5 w-px bg-white/[0.08]" />
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

export default function TickerBar({ showStatus = true }: { showStatus?: boolean } = {}) {
  const [items, setItems] = useState<TickerItem[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/ticker");
      if (!res.ok) return;
      const data = await res.json();
      const valid = (data.items as TickerItem[]).filter((i) => i.price != null);
      if (valid.length > 0) {
        setItems(valid);
      }
    } catch {}
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  if (items.length === 0) return null;

  return (
    <div className="relative bg-black/60 backdrop-blur-sm border-b border-white/[0.06] h-10 flex items-center overflow-hidden select-none">
      {showStatus && (
        <div className="relative z-20 flex-shrink-0 pl-3 pr-2">
          <MarketStatusBadge />
        </div>
      )}

      <div className={`pointer-events-none absolute top-0 bottom-0 w-12 z-10 bg-gradient-to-r from-black/60 to-transparent ${showStatus ? "left-[145px]" : "left-0"}`} />
      <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-20 z-10 bg-gradient-to-l from-black to-transparent" />

      <div className="flex animate-marquee">
        <div className="flex">
          {items.map((item) => (
            <Item key={item.identifier} item={item} />
          ))}
        </div>
        <div className="flex" aria-hidden="true">
          {items.map((item) => (
            <Item key={item.identifier} item={item} />
          ))}
        </div>
      </div>
    </div>
  );
}
