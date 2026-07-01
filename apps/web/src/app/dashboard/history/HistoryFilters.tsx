"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { clsx } from "clsx";

const ASSET_TYPES = ["all", "stock", "crypto"] as const;
const OUTCOMES    = ["all", "WIN", "LOSS", "NEUTRAL"] as const;
const HORIZONS    = ["all", "intraday", "swing", "longterm"] as const;

const HORIZON_LABELS: Record<string, string> = {
  all:       "All",
  intraday:  "Intraday",
  swing:     "Swing",
  longterm:  "Long-term",
};

export default function HistoryFilters() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const activeAsset   = searchParams.get("asset")   ?? "all";
  const activeOutcome = searchParams.get("outcome")  ?? "all";
  const activeHorizon = searchParams.get("horizon")  ?? "all";

  function setFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.push(`/dashboard/history?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-4">
      {/* Asset type */}
      <FilterGroup
        label="Asset"
        options={ASSET_TYPES}
        active={activeAsset}
        displayFn={(v) => v === "all" ? "All" : v.charAt(0).toUpperCase() + v.slice(1)}
        onChange={(v) => setFilter("asset", v)}
      />

      {/* Outcome */}
      <FilterGroup
        label="Outcome"
        options={OUTCOMES}
        active={activeOutcome}
        displayFn={(v) => v === "all" ? "All" : v}
        onChange={(v) => setFilter("outcome", v)}
      />

      {/* Horizon */}
      <FilterGroup
        label="Horizon"
        options={HORIZONS}
        active={activeHorizon}
        displayFn={(v) => HORIZON_LABELS[v] ?? v}
        onChange={(v) => setFilter("horizon", v)}
      />
    </div>
  );
}

function FilterGroup<T extends string>({
  label,
  options,
  active,
  displayFn,
  onChange,
}: {
  label: string;
  options: readonly T[];
  active: string;
  displayFn: (v: T) => string;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-zinc-600 uppercase tracking-wide mr-1">{label}</span>
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={clsx(
            "text-xs px-2.5 py-1 rounded-md transition-colors",
            active === opt
              ? "bg-white/[0.1] text-white ring-hairline"
              : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]",
          )}
        >
          {displayFn(opt)}
        </button>
      ))}
    </div>
  );
}
