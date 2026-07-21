"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import SignalList from "@/components/signals/SignalList";
import { type Signal } from "@/components/signals/SignalCard";

type AssetFilter     = "all" | "crypto" | "prediction";
type DirectionFilter = "all" | "BUY" | "SELL" | "YES" | "NO";
type HorizonFilter   = "all" | "intraday" | "swing" | "longterm";
type OutcomeFilter   = "all" | "PENDING" | "WIN" | "LOSS";

type Filters = {
  asset:      AssetFilter;
  direction:  DirectionFilter;
  horizon:    HorizonFilter;
  outcome:    OutcomeFilter;
  minConf:    number;
  insiderBuy: boolean;
  search:     string;
};

const DEFAULT_FILTERS: Filters = {
  asset:      "all",
  direction:  "all",
  horizon:    "all",
  outcome:    "all",
  minConf:    0,
  insiderBuy: false,
  search:     "",
};

const CONF_STEPS = [0, 50, 70, 80, 90] as const;

export default function ScreenerClient() {
  const [signals, setSignals]   = useState<Signal[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filters, setFilters]   = useState<Filters>(DEFAULT_FILTERS);
  const [, startTransition]     = useTransition();

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const signalRes = await supabase
        .from("signals")
        .select("id, asset_type, identifier, direction, confidence, reasoning, time_horizon, price_at_signal, news_context, created_at, outcome")
        .eq("is_backtest", false)
        .in("asset_type", ["crypto", "prediction"])
        .gte("confidence", 60)
        .order("created_at", { ascending: false })
        .limit(500);

      const signals = (signalRes.data as Signal[]) ?? [];

      const missingTitleIds = Array.from(
        new Set(
          signals
            .filter((s) => s.asset_type === "prediction" && !s.market_title)
            .map((s) => s.identifier),
        ),
      );
      if (missingTitleIds.length > 0) {
        const { data: priceRows } = await supabase
          .from("raw_prices")
          .select("identifier, metadata")
          .eq("asset_type", "prediction")
          .in("identifier", missingTitleIds);
        const titleByIdentifier = new Map<string, string>();
        for (const row of priceRows ?? []) {
          const title = (row.metadata as Record<string, unknown> | null)?.title;
          if (typeof title === "string" && title && !titleByIdentifier.has(row.identifier)) {
            titleByIdentifier.set(row.identifier, title);
          }
        }
        for (const s of signals) {
          if (s.asset_type === "prediction" && !s.market_title) {
            s.market_title = titleByIdentifier.get(s.identifier) ?? null;
          }
        }
      }

      setSignals(signals);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    return signals.filter((s) => {
      if (filters.asset !== "all" && s.asset_type !== filters.asset) return false;
      if (filters.direction !== "all" && s.direction !== filters.direction) return false;
      if (filters.horizon !== "all" && s.time_horizon !== filters.horizon) return false;
      if (filters.outcome !== "all" && s.outcome !== filters.outcome) return false;
      if (s.confidence < filters.minConf) return false;
      if (filters.insiderBuy) return false;
      if (filters.search) {
        const q = filters.search.toUpperCase();
        const searchable = (s.market_title ?? s.identifier).toUpperCase();
        if (!searchable.includes(q) && !s.identifier.toUpperCase().includes(q)) return false;
      }
      return true;
    });
  }, [signals, filters]);

  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    startTransition(() => setFilters((f) => ({ ...f, [key]: value })));

  const activeCount =
    Number(filters.asset !== "all") +
    Number(filters.direction !== "all") +
    Number(filters.horizon !== "all") +
    Number(filters.outcome !== "all") +
    Number(filters.minConf > 0) +
    Number(filters.insiderBuy) +
    Number(filters.search !== "");

  return (
    <div className="p-5 md:p-8 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight text-white">Screener</h1>
          <p className="text-sm text-zinc-500">
            {loading ? "Loading signals…" : `${filtered.length} of ${signals.length} signals`}
          </p>
        </div>
        {activeCount > 0 && (
          <button
            onClick={() => setFilters(DEFAULT_FILTERS)}
            className="text-xs text-zinc-300 hover:text-white border border-white/[0.1] hover:border-white/20 bg-white/[0.03] rounded-lg px-3 py-1.5 transition-colors"
          >
            Clear filters ({activeCount})
          </button>
        )}
      </div>

      {/* Filter bar */}
      <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl p-4 space-y-4">
        {/* Search */}
        <input
          type="text"
          placeholder="Search ticker or market…"
          value={filters.search}
          onChange={(e) => set("search", e.target.value)}
          className="w-full sm:w-64 bg-white/[0.04] border border-white/[0.1] rounded-lg px-3 py-1.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50"
        />

        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <FilterGroup label="Asset">
            <Segmented
              options={[["all", "All"], ["crypto", "Crypto"], ["prediction", "Predictions"]] as const}
              value={filters.asset}
              onChange={(v) => set("asset", v as AssetFilter)}
            />
          </FilterGroup>

          <FilterGroup label="Direction">
            <Segmented
              options={[["all", "All"], ["BUY", "Buy"], ["SELL", "Sell"], ["YES", "Yes"], ["NO", "No"]] as const}
              value={filters.direction}
              onChange={(v) => set("direction", v as DirectionFilter)}
            />
          </FilterGroup>

          <FilterGroup label="Horizon">
            <Segmented
              options={[["all", "All"], ["intraday", "Intraday"], ["swing", "Swing"], ["longterm", "Long"]] as const}
              value={filters.horizon}
              onChange={(v) => set("horizon", v as HorizonFilter)}
            />
          </FilterGroup>

          <FilterGroup label="Outcome">
            <Segmented
              options={[["all", "All"], ["PENDING", "Open"], ["WIN", "Win"], ["LOSS", "Loss"]] as const}
              value={filters.outcome}
              onChange={(v) => set("outcome", v as OutcomeFilter)}
            />
          </FilterGroup>

          <FilterGroup label="Min confidence">
            <Segmented
              options={CONF_STEPS.map((c) => [String(c), c === 0 ? "Any" : `${c}%+`] as const)}
              value={String(filters.minConf)}
              onChange={(v) => set("minConf", Number(v))}
            />
          </FilterGroup>
        </div>

        {/* Insider toggle hidden — stock-only feature (crypto-only pivot) */}
      </div>

      {/* Results */}
      {loading ? (
        <div className="py-16 text-center text-zinc-500 text-sm">Loading signals…</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-zinc-500 text-sm">
          No signals match your filters.
        </div>
      ) : (
        <SignalList signals={filtered} />
      )}
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">{label}</div>
      {children}
    </div>
  );
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: readonly (readonly [string, string])[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex rounded-lg overflow-hidden border border-white/[0.1] w-fit">
      {options.map(([val, label]) => (
        <button
          key={val}
          onClick={() => onChange(val)}
          className={`px-3 py-1.5 text-xs font-medium transition-colors ${
            value === val
              ? "bg-white/[0.1] text-white"
              : "bg-transparent text-zinc-500 hover:text-zinc-300"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
