"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { Search, WifiOff, Zap } from "lucide-react";
import { clsx } from "clsx";
import { createClient } from "@/lib/supabase/client";
import PredictionCard, { type PredictionMarket, type SmartMoneyData, type WhaleActivityData } from "@/components/predictions/PredictionCard";
import Sparkline from "@/components/predictions/Sparkline";
import ConnectWalletButton from "@/components/predictions/ConnectWalletButton";
import ConfidenceCheck from "@/components/predictions/ConfidenceCheck";

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

const CATEGORY_PILLS = [
  { id: "all",         label: "All" },
  { id: "politics",    label: "Politics" },
  { id: "economics",   label: "Economics" },
  { id: "crypto",      label: "Crypto" },
  { id: "technology",  label: "Tech" },
  { id: "geopolitics", label: "Geopolitics" },
  { id: "science",     label: "Science" },
] as const;

type CategoryId = (typeof CATEGORY_PILLS)[number]["id"];

type SortKey = "volume" | "prob_high" | "prob_low" | "resolution" | "ai_first" | "smart_money";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "volume",      label: "Volume" },
  { value: "resolution",  label: "Time to Resolution" },
  { value: "ai_first",    label: "AI Scored" },
  { value: "smart_money", label: "Smart Money" },
  { value: "prob_high",   label: "Prob: High → Low" },
  { value: "prob_low",    label: "Prob: Low → High" },
];

function daysUntilEnd(iso: string | null): number {
  if (!iso) return 9999;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

function formatVolume(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

export default function PredictionsPage() {
  const [markets, setMarkets]       = useState<PredictionMarket[]>([]);
  const [loading, setLoading]       = useState(true);
  const [category, setCategory]     = useState<CategoryId>("all");
  const [sort, setSort]             = useState<SortKey>("volume");
  const [search, setSearch]         = useState("");
  const [wsConnected, setWsConnected] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();

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

      const seen = new Map<string, (typeof rawRows)[0]>();
      for (const row of rawRows) {
        if (!seen.has(row.identifier)) seen.set(row.identifier, row);
      }
      const uniqueRows = Array.from(seen.values());

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

      const { data: smartMoneyRows } = await supabase
        .from("prediction_smart_money")
        .select("condition_id, consensus_direction, consensus_strength, wallet_count, total_volume_usd, top_wallet_pnl, breakdown_yes, breakdown_no")
        .in("condition_id", conditionIds);

      const smartMoneyByCondition = new Map<string, SmartMoneyData>();
      for (const sm of smartMoneyRows ?? []) {
        smartMoneyByCondition.set(sm.condition_id, {
          consensus_direction: sm.consensus_direction as "YES" | "NO" | "SPLIT",
          consensus_strength: Number(sm.consensus_strength),
          wallet_count: Number(sm.wallet_count),
          total_volume_usd: Number(sm.total_volume_usd),
        });
      }

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
            smart_money: smartMoneyByCondition.get(r.identifier) ?? null,
            whale_activity: whaleByMarket.get(r.identifier) ?? null,
          };
        });

      const now = new Date();
      setMarkets(
        assembled.filter(
          (m) =>
            m.category !== "sports" &&
            (!m.end_date || new Date(m.end_date) > now)
        )
      );
      setLoading(false);
    }

    load();
  }, []);

  const refreshLivePrices = useCallback(async () => {
    try {
      const res = await fetch("/api/prediction-prices");
      if (!res.ok) return;
      const data = await res.json();
      const prices = data.prices as Record<string, { yes_price?: number; no_price?: number }>;
      setWsConnected(data.ws?.connected ?? false);
      if (!prices || Object.keys(prices).length === 0) return;

      setMarkets((prev) =>
        prev.map((m) => {
          const live = prices[m.condition_id];
          if (!live || live.yes_price == null) return m;
          const sparkline = [...m.sparkline];
          if (sparkline.length > 0 && sparkline[sparkline.length - 1] !== live.yes_price) {
            sparkline.push(live.yes_price);
            if (sparkline.length > 100) sparkline.shift();
          }
          return {
            ...m,
            yes_price: live.yes_price,
            no_price: live.no_price ?? m.no_price,
            sparkline,
          };
        }),
      );
      setLastRefresh(new Date());
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    if (loading) return;
    const id = setInterval(refreshLivePrices, 30_000);
    refreshLivePrices();
    return () => clearInterval(id);
  }, [loading, refreshLivePrices]);

  const filtered = useMemo(() => {
    let result = markets;

    if (category !== "all") {
      result = result.filter((m) => m.category.toLowerCase().includes(category));
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
        case "resolution":
          return daysUntilEnd(a.end_date) - daysUntilEnd(b.end_date);
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

  const featuredMarket = useMemo(() => {
    const withSignal = markets.filter((m) => m.signal && m.signal.direction !== "HOLD");
    if (withSignal.length === 0) return null;
    return withSignal.sort((a, b) => (b.signal?.confidence ?? 0) - (a.signal?.confidence ?? 0))[0];
  }, [markets]);

  const aiScoredCount = markets.filter((m) => m.signal && m.signal.direction !== "HOLD").length;
  const smartMoneyCount = markets.filter((m) => m.smart_money && m.smart_money.wallet_count >= 3).length;
  const totalVolume = markets.reduce((sum, m) => sum + m.volume, 0);

  return (
    <div className="p-5 md:p-8 max-w-[1200px] mx-auto space-y-0">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <h1 className="text-[1.375rem] font-semibold tracking-tight text-white">Prediction Markets</h1>
            {!loading && (
              <span className={clsx(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.625rem] font-semibold uppercase tracking-wide",
                wsConnected
                  ? "bg-[#00d4aa]/10 border border-[#00d4aa]/20 text-[#00d4aa]"
                  : "bg-zinc-500/10 border border-zinc-500/20 text-zinc-500",
              )}>
                {wsConnected ? (
                  <>
                    <span className="w-[5px] h-[5px] rounded-full bg-[#00d4aa] animate-pulse" />
                    LIVE
                  </>
                ) : (
                  <>
                    <WifiOff className="h-2.5 w-2.5" />
                    POLLING
                  </>
                )}
              </span>
            )}
          </div>
          <ConnectWalletButton />
        </div>
        <p className="text-[0.8125rem] text-zinc-600">
          Real-time Polymarket probabilities · AI-scored edges · Smart money tracking
        </p>
      </div>

      {/* Stats strip */}
      <div className="flex gap-8 pb-6">
        <div>
          <div className="text-xl font-bold tabular-nums text-white">{markets.length}</div>
          <div className="text-[0.6875rem] text-zinc-600 mt-0.5">Markets tracked</div>
        </div>
        <div>
          <div className="text-xl font-bold tabular-nums text-[#00d4aa]">{aiScoredCount}</div>
          <div className="text-[0.6875rem] text-zinc-600 mt-0.5">AI signals active</div>
        </div>
        <div>
          <div className="text-xl font-bold tabular-nums text-[#4f8cff]">{smartMoneyCount}</div>
          <div className="text-[0.6875rem] text-zinc-600 mt-0.5">Smart money alerts</div>
        </div>
        <div>
          <div className="text-xl font-bold tabular-nums text-white">{formatVolume(totalVolume)}</div>
          <div className="text-[0.6875rem] text-zinc-600 mt-0.5">24h volume tracked</div>
        </div>
      </div>

      {/* Confidence Check */}
      <div className="pb-6">
        <ConfidenceCheck />
      </div>

      {/* Category pills */}
      <div className="flex items-center gap-2 pb-6 border-b border-white/[0.06] overflow-x-auto scrollbar-none">
        {CATEGORY_PILLS.map((pill) => {
          const count = pill.id === "all"
            ? markets.length
            : markets.filter((m) => m.category.toLowerCase().includes(pill.id)).length;
          return (
            <button
              key={pill.id}
              onClick={() => setCategory(pill.id)}
              className={clsx(
                "flex-shrink-0 px-3.5 py-[7px] rounded-full text-xs font-medium border transition-all whitespace-nowrap",
                category === pill.id
                  ? "bg-white text-[#06070a] border-white font-semibold"
                  : "bg-transparent text-zinc-400 border-white/[0.08] hover:border-white/[0.15] hover:text-white",
              )}
            >
              {pill.label}
              <span className={clsx("ml-1.5 tabular-nums", category === pill.id ? "opacity-50" : "opacity-40")}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Search + Sort */}
      <div className="flex items-center gap-3 py-5">
        <div className="relative flex-1 max-w-[280px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-600" />
          <input
            type="text"
            placeholder="Search markets…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#10131a] border border-white/[0.06] rounded-lg pl-8 pr-3 py-2 text-[0.8125rem] text-white placeholder-zinc-600 focus:outline-none focus:border-[#00d4aa]/30 transition-colors"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="appearance-none bg-[#10131a] border border-white/[0.06] rounded-lg px-3 py-2 text-[0.6875rem] text-zinc-400 focus:outline-none focus:border-[#00d4aa]/30 cursor-pointer"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Featured market */}
      {featuredMarket && !search && category === "all" && (
        <div className="relative rounded-2xl p-6 mb-6 bg-gradient-to-br from-[#10131a] to-[#00d4aa]/[0.03] border border-[#00d4aa]/15 overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#00d4aa] to-transparent opacity-40" />

          <div className="inline-flex items-center gap-1.5 mb-4 px-2 py-1 rounded bg-[#00d4aa]/10 text-[0.625rem] font-bold uppercase tracking-wider text-[#00d4aa]">
            <Zap className="h-2.5 w-2.5" />
            TOP AI SIGNAL
          </div>

          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex-1">
              <h2 className="text-lg font-semibold tracking-tight text-white leading-snug mb-3">
                {featuredMarket.title}
              </h2>
              <div className="flex items-center gap-3 flex-wrap">
                {featuredMarket.signal && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#00d4aa]/10 border border-[#00d4aa]/20 text-[0.6875rem] font-semibold text-[#00d4aa]">
                    AI {featuredMarket.signal.direction} · {featuredMarket.signal.confidence}%
                  </span>
                )}
                {featuredMarket.smart_money && featuredMarket.smart_money.wallet_count >= 3 && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#4f8cff]/10 border border-[#4f8cff]/20 text-[0.6875rem] font-medium text-[#4f8cff]">
                    Smart Money: {Math.round(featuredMarket.smart_money.consensus_strength * 100)}% {featuredMarket.smart_money.consensus_direction} ({featuredMarket.smart_money.wallet_count})
                  </span>
                )}
                <span className="text-[0.6875rem] text-zinc-600">
                  {formatVolume(featuredMarket.volume)} vol
                </span>
                {featuredMarket.end_date && (
                  <span className="text-[0.6875rem] text-zinc-600">
                    {daysUntilEnd(featuredMarket.end_date)}d remaining
                  </span>
                )}
              </div>

              {/* Featured sparkline */}
              {featuredMarket.sparkline.length >= 2 && (
                <div className="mt-4 h-12 w-full max-w-md">
                  <Sparkline
                    points={featuredMarket.sparkline}
                    width={400}
                    height={48}
                    className="w-full h-full"
                  />
                </div>
              )}
            </div>

            <div className="text-right sm:min-w-[120px]">
              <div className={clsx(
                "text-[3rem] font-bold tabular-nums leading-none tracking-tight",
                featuredMarket.yes_price >= 0.65 ? "text-[#00d4aa]"
                  : featuredMarket.yes_price >= 0.35 ? "text-amber-400"
                  : "text-red-400",
              )}>
                {Math.round(featuredMarket.yes_price * 100)}
                <span className="text-lg font-medium opacity-60">%</span>
              </div>
              <div className="text-[0.6875rem] text-zinc-600 uppercase tracking-wide mt-1">YES probability</div>
            </div>
          </div>
        </div>
      )}

      {/* Market grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-[#10131a] border border-white/[0.06] rounded-xl h-52 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-zinc-600 text-sm">
          No markets match your filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered
            .filter((m) => m.condition_id !== featuredMarket?.condition_id || search || category !== "all")
            .map((m) => (
              <PredictionCard key={m.condition_id} market={m} />
            ))}
        </div>
      )}

      {/* Footer */}
      <div className="mt-8 pt-4 border-t border-white/[0.06] text-[0.6875rem] text-zinc-700">
        Source: Polymarket{wsConnected ? " (WebSocket)" : " (Gamma API)"} ·{" "}
        {wsConnected ? "Live prices, auto-refresh every 30s" : "Updated every 30 minutes"} ·{" "}
        Probabilities reflect current YES price
        {lastRefresh && (
          <span className="ml-1">· Last update: {lastRefresh.toLocaleTimeString()}</span>
        )}
      </div>
    </div>
  );
}
