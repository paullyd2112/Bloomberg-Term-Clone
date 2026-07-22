"use client";

import { useEffect, useState } from "react";

type PeriodData = {
  label: string;
  price: number | null;
  change: number | null;
  date: string | null;
};

type PerformanceData = {
  currentPrice: number | null;
  periods: PeriodData[];
};

function formatPrice(price: number | null): string {
  if (price == null) return "—";
  if (price >= 1000) return `$${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (price >= 1) return `$${price.toFixed(2)}`;
  return `$${price.toFixed(4).replace(/\.?0+$/, "")}`;
}

function formatChange(change: number | null): string {
  if (change == null) return "—";
  return `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`;
}

export default function PricePerformance({
  identifier,
  assetType,
}: {
  identifier: string;
  assetType: string;
}) {
  const [data, setData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(
          `/api/price-performance?identifier=${encodeURIComponent(identifier)}&assetType=${encodeURIComponent(assetType)}`
        );
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [identifier, assetType]);

  if (loading) {
    return (
      <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl p-3 text-center animate-pulse h-[72px]"
          />
        ))}
      </div>
    );
  }

  if (!data || !data.periods.length) return null;

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-zinc-500 uppercase tracking-wider font-mono">
        Price performance
      </p>
      <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
        {data.periods.map((period) => (
          <div
            key={period.label}
            className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl p-2.5 text-center"
          >
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 font-mono">
              {period.label}
            </p>
            {period.price != null ? (
              <>
                <p className="text-xs font-mono tabular-nums text-zinc-300 mb-0.5">
                  {formatPrice(period.price)}
                </p>
                <p
                  className={`text-xs font-semibold font-mono tabular-nums ${
                    period.change != null && period.change >= 0
                      ? "text-emerald-400"
                      : "text-red-400"
                  }`}
                >
                  {formatChange(period.change)}
                </p>
              </>
            ) : (
              <p className="text-xs text-zinc-700 mt-2">—</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function PricePerformanceCompact({
  identifier,
  assetType,
}: {
  identifier: string;
  assetType: string;
}) {
  const [data, setData] = useState<PerformanceData | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(
          `/api/price-performance?identifier=${encodeURIComponent(identifier)}&assetType=${encodeURIComponent(assetType)}`
        );
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch {
        // silent
      }
    }
    load();
    return () => { cancelled = true; };
  }, [identifier, assetType]);

  if (!data?.periods.length) return null;

  // Show a compact subset: 1D, 1W, 1M, 90D
  const compact = data.periods.filter((p) =>
    ["1D", "1W", "1M", "90D"].includes(p.label)
  );

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {compact.map((period) => {
        if (period.change == null) return null;
        return (
          <span
            key={period.label}
            className={`inline-flex items-center gap-0.5 text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded ${
              period.change >= 0
                ? "bg-emerald-500/10 text-emerald-400"
                : "bg-red-500/10 text-red-400"
            }`}
          >
            <span className="text-zinc-500">{period.label}</span>
            {period.change >= 0 ? "+" : ""}
            {period.change.toFixed(1)}%
          </span>
        );
      })}
    </div>
  );
}
