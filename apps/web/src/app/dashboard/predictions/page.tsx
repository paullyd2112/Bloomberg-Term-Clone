"use client";

import { useEffect, useState, useMemo } from "react";
import { BarChart3, Search, ChevronDown } from "lucide-react";
import { clsx } from "clsx";
import { createClient } from "@/lib/supabase/client";
import PredictionCard, { type PredictionMarket, type SmartMoneyData, type WhaleActivityData } from "@/components/predictions/PredictionCard";
import ConnectWalletButton from "@/components/predictions/ConnectWalletButton";

const SPORTS_KEYWORDS = [
  "f1", "formula 1", "nfl", "nba", "mlb", "nhl", "mls",
  "premier league", "champions league", "world cup", "super bowl",
  "world series", "stanley cup", "wimbledon", "olympics", "olympic",
  "ufc", "mma", "boxing", "grand prix", "constructors' champion",
  "drivers' champion", "ballon d'or", "mvp award", "cricket", "ipl",
  "pga", "masters tournament", "nascar", "tour de france", "esports",
  "afa president",
];

function inferCategory(title: string, slug: string): string {
  const text = `${title} ${slug}`.toLowerCase();
  for (const kw of SPORTS_KEYWORDS) if (text.includes(kw)) return "sports";

  const checks: [string[], string][] = [
    [["president", "election", "midterm", "senate", "house", "governor", "congress", "democrat", "republican", "balance of power", "prime minister", "coup", "parliament"], "politics"],
    [["military clash", "war ", "invasion", "sanctions", "china x", "russia", "ukraine", "taiwan", "israel", "iran", "ceasefire"], "geopolitics"],
    [["fed ", "fed?", "federal reserve", "interest rate", "inflation", "gdp", "recession", "debt", "tariff", "s&p 500", "treasury", "bond"], "economics"],
    [["bitcoin", "btc", "ethereum", "crypto", "blockchain", "coinbase", "stablecoin", "defi"], "crypto"],
    [["ipo", "ai ", "ai?", "artificial intelligence", "openai", "anthropic", "startup"], "technology"],
    [["earthquake", "hurricane", "pandemic", "vaccine", "nasa", "spacex", "nuclear", "fusion"], "science"],
  ];
  for (const [keywords, cat] of checks) {
    for (const kw of keywords) if (text.includes(kw)) return cat;
  }
  return "";
}

const CATEGORY_TABS = [
  { id: "all",        label: "All" },
  { id: "politics",   label: "Politics" },
  { id: "economics",  label: "Economics" },
  { id: "crypto",     label: "Crypto" },
  { id: "technology", label: "Tech" },
  { id: "science",    label: "Science" },
] as const;

type CategoryTab = (typeof CATEGORY_TABS)[number]["id"];

type SortKey = "volume" | "prob_high" | "prob_low" | "newest" | "ai_first" | "smart_money";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "volume",      label: "Volume" },
  { value: "ai_first",    label: "AI Scored" },
  { value: "smart_money",  label: "Smart Money" },
  { value: "prob_high",   label: "Prob: High → Low" },
  { value: "prob_low",    label: "Prob: Low → High" },
  { value: "newest",      label: "Newest" },
];

export default function PredictionsPage() {
  const [markets, setMarkets]       = useState<PredictionMarket[]>([]);
  const [loading, setLoading]       = useState(true);
  const [category, setCategory]     = useState<CategoryTab>("all");
  const [sort, setSort]             = useState<SortKey>("volume");
  const [search, setSearch]         = useState("");

  useEffect(() => {
    async function load() {
      const supabase = createClient();

      // 1. Fetch latest prediction market snapshot per condition_id
      const { data: rawRows } = await supabase
        .from("raw_prices")
        .select("identifier, price, volume, metadata, captured_at")
        .eq("asset_type", "prediction")
        .order("captured_at", { ascending: false })
        .limit(500);

      if (!rawRows || rawRows.length === 0) {
        setLoading(false);
        return;
      }

      // Deduplicate — keep newest row per identifier
      const seen = new Map<string, (typeof rawRows)[0]>();
      for (const row of rawRows) {
        if (!seen.has(row.identifier)) seen.set(row.identifier, row);
      }
      const uniqueRows = Array.from(seen.values());

      // 2. Fetch AI signals for prediction markets
      const conditionIds = uniqueRows.map((r) => r.identifier);
      const { data: signalRows } = await supabase
        .from("signals")
        .select("id, identifier, direction, confidence, reasoning")
        .eq("asset_type", "prediction")
        .eq("is_backtest", false)
        .in("identifier", conditionIds)
        .order("created_at", { ascending: false });

      const signalByCondition = new Map<string, PredictionMarket["signal"]>();
      for (const s of signalRows ?? []) {
        if (!signalByCondition.has(s.identifier)) {
          signalByCondition.set(s.identifier, {
            id: s.id,
            direction: s.direction as "YES" | "NO" | "HOLD",
            confidence: s.confidence,
            reasoning: s.reasoning,
          });
        }
      }

      // 3. Fetch sparkline data (last 48h of price snapshots)
      const { data: historyRows } = await supabase
        .from("prediction_price_history")
        .select("condition_id, yes_price, captured_at")
        .in("condition_id", conditionIds)
        .gte("captured_at", new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
        .order("captured_at", { ascending: true });

      const sparklineByCondition = new Map<string, number[]>();
      for (const h of historyRows ?? []) {
        const arr = sparklineByCondition.get(h.condition_id) ?? [];
        arr.push(Number(h.yes_price));
        sparklineByCondition.set(h.condition_id, arr);
      }

      // 4. Fetch whale cluster data (last 4h)
      const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
      const { data: whaleRows } = await supabase
        .from("whale_alerts")
        .select("asset_id, outcome, usd_value")
        .gte("created_at", fourHoursAgo);

      const whaleByMarket = new Map<string, WhaleActivityData>();
      if (whaleRows) {
        const grouped = new Map<string, { yes: number; no: number; count: number; total: number }>();
        for (const w of whaleRows) {
          const key = w.asset_id;
          const g = grouped.get(key) ?? { yes: 0, no: 0, count: 0, total: 0 };
          g.count++;
          g.total += Number(w.usd_value || 0);
          if (w.outcome === "YES") g.yes++;
          else g.no++;
          grouped.set(key, g);
        }
        for (const [assetId, g] of Array.from(grouped.entries())) {
          if (g.count >= 2) {
            whaleByMarket.set(assetId, {
              whale_count: g.count,
              total_usd: g.total,
              direction: g.yes > g.no ? "YES" : g.no > g.yes ? "NO" : "MIXED",
            });
          }
        }
      }

      // 5. Assemble PredictionMarket objects
      const assembled: PredictionMarket[] = uniqueRows
        .filter((r) => {
          const meta = (r.metadata as Record<string, unknown>) ?? {};
          return meta.title && typeof meta.title === "string";
        })
        .map((r) => {
          const meta = (r.metadata as Record<string, unknown>) ?? {};
          const yesPrice = meta.yes_price != null ? Number(meta.yes_price) : Number(r.price);
          const noPrice = meta.no_price != null ? Number(meta.no_price) : null;
          const sparkline = sparklineByCondition.get(r.identifier) ?? [];
          if (sparkline.length === 0 && yesPrice != null) {
            sparkline.push(yesPrice);
          }

          const rawCategory = String(meta.category ?? "");
          const title = String(meta.title ?? "");
          const eventSlug = String(meta.event_slug ?? "");
          const cat = rawCategory || inferCategory(title, eventSlug);

          const clobTokenIds = meta.clobTokenIds as string[] | undefined;

          return {
            condition_id: r.identifier,
            title,
            yes_price: yesPrice,
            no_price: noPrice,
            volume: Number(r.volume ?? 0),
            category: cat,
            end_date: meta.end_date ? String(meta.end_date) : null,
            captured_at: r.captured_at,
            sparkline,
            yes_token_id: clobTokenIds?.[0],
            no_token_id: clobTokenIds?.[1],
            signal: signalByCondition.get(r.identifier) ?? null,
            smart_money: null as SmartMoneyData | null,
            whale_activity: whaleByMarket.get(r.identifier) ?? null,
          };
        });

      setMarkets(assembled.filter((m) => m.category !== "sports"));
      setLoading(false);
    }

    load();
  }, []);

  const filtered = useMemo(() => {
    let result = markets;

    if (category !== "all") {
      result = result.filter((m) => {
        const cat = m.category.toLowerCase();
        return cat.includes(category);
      });
    }

    if (search) {
      const q = search.toLowerCase();
      result = result.filter((m) => m.title.toLowerCase().includes(q));
    }

    result = [...result].sort((a, b) => {
      switch (sort) {
        case "volume":
          return b.volume - a.volume;
        case "prob_high":
          return b.yes_price - a.yes_price;
        case "prob_low":
          return a.yes_price - b.yes_price;
        case "newest":
          return new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime();
        case "ai_first": {
          const aScore = a.signal && a.signal.direction !== "HOLD" ? a.signal.confidence : 0;
          const bScore = b.signal && b.signal.direction !== "HOLD" ? b.signal.confidence : 0;
          if (bScore !== aScore) return bScore - aScore;
          return b.volume - a.volume;
        }
        case "smart_money": {
          const aS = a.smart_money ? a.smart_money.consensus_strength * a.smart_money.wallet_count : 0;
          const bS = b.smart_money ? b.smart_money.consensus_strength * b.smart_money.wallet_count : 0;
          if (bS !== aS) return bS - aS;
          return b.volume - a.volume;
        }
        default:
          return 0;
      }
    });

    return result;
  }, [markets, category, sort, search]);

  const aiScoredCount = markets.filter((m) => m.signal && m.signal.direction !== "HOLD").length;
  const smartMoneyCount = markets.filter((m) => m.smart_money && m.smart_money.wallet_count >= 3).length;

  return (
    <div className="p-5 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-700/30 bg-emerald-500/10 text-emerald-400">
              <BarChart3 className="h-4 w-4" />
            </span>
            <h1 className="text-xl font-semibold tracking-tight text-white">Prediction Markets</h1>
          </div>
          <ConnectWalletButton />
        </div>
        <p className="text-zinc-500 text-sm">
          Live Polymarket probabilities with AI-scored edge detection.
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
        {[
          { label: "Markets tracked", value: markets.length, cls: "text-white" },
          { label: "AI scored", value: aiScoredCount, cls: "text-emerald-400" },
          { label: "Smart Money", value: smartMoneyCount, cls: "text-blue-400" },
          { label: "Categories", value: new Set(markets.map((m) => m.category).filter(Boolean)).size, cls: "text-zinc-400" },
        ].map(({ label, value, cls }) => (
          <div key={label} className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl p-4 hover:bg-white/[0.05] hover:border-white/[0.1] transition-all">
            <div className={`text-2xl font-bold tabular-nums ${cls}`}>{value}</div>
            <div className="text-zinc-500 text-xs mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative w-full sm:w-56">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
          <input
            type="text"
            placeholder="Search markets…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg pl-8 pr-3 py-1.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500/40 focus:bg-white/[0.05] transition-colors"
          />
        </div>

        <div className="relative flex-shrink-0">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="appearance-none bg-white/[0.04] border border-white/[0.1] rounded-lg pl-3 pr-8 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-emerald-500/50 cursor-pointer"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex items-center gap-1 border-b border-white/[0.08] pb-0 overflow-x-auto scrollbar-none">
        {CATEGORY_TABS.map((tab) => {
          const count = tab.id === "all"
            ? markets.length
            : markets.filter((m) => m.category.toLowerCase().includes(tab.id)).length;
          return (
            <button
              key={tab.id}
              onClick={() => setCategory(tab.id)}
              className={clsx(
                "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px flex-shrink-0",
                category === tab.id
                  ? "border-emerald-500 text-white"
                  : "border-transparent text-zinc-400 hover:text-white",
              )}
            >
              {tab.label}
              <span className="ml-1.5 text-xs text-zinc-600 tabular-nums">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Market grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white/[0.03] border border-white/[0.06] rounded-xl h-48 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-zinc-500 text-sm">
          No markets match your filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((m) => (
            <PredictionCard key={m.condition_id} market={m} />
          ))}
        </div>
      )}

      {/* Footer */}
      <p className="text-zinc-600 text-xs">
        Source: Polymarket (Gamma API) · Updated every 30 minutes · Probabilities reflect current YES price
      </p>
    </div>
  );
}
