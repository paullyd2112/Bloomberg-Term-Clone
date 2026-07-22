import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getUser, getUserTier } from "@/lib/user";
import { canAccessFeature } from "@/lib/tier";
import SignalList from "@/components/signals/SignalList";
import type { Signal } from "@/components/signals/SignalCard";
import WatchlistToggle from "@/components/watchlist/WatchlistToggle";
import AccuracyBadge from "@/components/asset/AccuracyBadge";
import OptionsFlowTable from "@/components/asset/OptionsFlowTable";
import PriceHeader from "@/components/asset/PriceHeader";
import PriceChart, { type PricePoint } from "@/components/asset/PriceChart";
import OnDemandScore from "@/components/asset/OnDemandScore";
import SectionHeader from "@/components/ui/SectionHeader";
import PricePerformance from "@/components/asset/PricePerformance";

export const revalidate = 60;

const VALID_TYPES = ["stock", "crypto", "prediction"] as const;
type AssetType = (typeof VALID_TYPES)[number];

type PageProps = {
  params: { type: string; identifier: string };
};

async function fetchAssetData(assetType: AssetType, identifier: string, userId: string) {
  const supabase = createClient();

  const [priceRes, historyRes, signalsRes, accuracyRes, newsRes, optionsRes, watchlistRes, shortInterestRes, earningsRes, sentimentRes, corporateActionsRes] =
    await Promise.all([
      supabase
        .from("raw_prices")
        .select("price, change_24h, volume, metadata, captured_at")
        .eq("asset_type", assetType)
        .eq("identifier", identifier)
        .order("captured_at", { ascending: false })
        .limit(1)
        .single(),

      supabase
        .from("raw_prices")
        .select("price, captured_at")
        .eq("asset_type", assetType)
        .eq("identifier", identifier)
        .order("captured_at", { ascending: false })
        .limit(500),

      supabase
        .from("signals")
        .select("*")
        .eq("asset_type", assetType)
        .eq("identifier", identifier)
        .eq("is_backtest", false)
        .gte("confidence", 60)
        .order("created_at", { ascending: false })
        .limit(20),

      supabase
        .from("asset_accuracy")
        .select("*")
        .eq("asset_type", assetType)
        .eq("identifier", identifier)
        .single(),

      supabase
        .from("news_items")
        .select("id, headline, source, url, published_at")
        .eq("identifier", identifier)
        .order("published_at", { ascending: false })
        .limit(8),

      assetType === "stock"
        ? supabase
            .from("options_flow")
            .select("contract_type, strike, expiry, volume, premium_usd, is_unusual, captured_at")
            .eq("ticker", identifier)
            .order("captured_at", { ascending: false })
            .limit(10)
        : Promise.resolve({ data: null }),

      supabase
        .from("watchlist")
        .select("id")
        .eq("user_id", userId)
        .eq("asset_type", assetType)
        .eq("identifier", identifier)
        .limit(1)
        .single(),

      // Short interest (stocks only)
      assetType === "stock"
        ? supabase
            .from("short_interest")
            .select("short_float_pct, short_ratio, shares_short, vs_previous, is_high_short")
            .eq("identifier", identifier)
            .order("reported_at", { ascending: false })
            .limit(1)
            .single()
        : Promise.resolve({ data: null }),

      // Upcoming earnings (stocks only)
      assetType === "stock"
        ? supabase
            .from("earnings_events")
            .select("report_date, report_time, consensus_eps")
            .eq("identifier", identifier)
            .gte("report_date", new Date().toISOString().slice(0, 10))
            .order("report_date", { ascending: true })
            .limit(1)
            .single()
        : Promise.resolve({ data: null }),

      // Fear & Greed sentiment (crypto only)
      assetType === "crypto"
        ? supabase
            .from("raw_prices")
            .select("metadata")
            .eq("identifier", "MARKET_SENTIMENT")
            .eq("asset_type", "crypto")
            .order("captured_at", { ascending: false })
            .limit(1)
            .single()
        : Promise.resolve({ data: null }),

      // Corporate actions — splits, dividends, spinoffs, mergers (stocks only)
      assetType === "stock"
        ? supabase
            .from("corporate_actions")
            .select("ca_type, ex_date, cash_amount, old_rate, new_rate")
            .eq("ticker", identifier)
            .gte("ex_date", new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10))
            .order("ex_date", { ascending: true })
            .limit(10)
        : Promise.resolve({ data: null }),
    ]);

  // Build chart points: dedupe by timestamp, ascending, drop nulls
  const seen = new Set<number>();
  const history: PricePoint[] = [];
  for (const row of (historyRes.data ?? [])) {
    if (row.price == null) continue;
    const time = Math.floor(new Date(row.captured_at).getTime() / 1000);
    if (seen.has(time)) continue;
    seen.add(time);
    history.push({ time, value: Number(row.price) });
  }
  history.sort((a, b) => a.time - b.time);

  return {
    price:         priceRes.data,
    history,
    signals:       (signalsRes.data ?? []) as Signal[],
    accuracy:      accuracyRes.data,
    news:          newsRes.data ?? [],
    options:       optionsRes.data ?? [],
    watchlistId:   watchlistRes.data?.id ?? null,
    shortInterest: shortInterestRes.data,
    earnings:      earningsRes.data,
    sentiment:     sentimentRes.data,
    corporateActions: corporateActionsRes.data ?? [],
  };
}

export default async function AssetPage({ params }: PageProps) {
  const type = params.type as AssetType;
  if (!VALID_TYPES.includes(type)) notFound();

  // Prediction-market identifiers are Polymarket conditionId hex hashes —
  // case-sensitive, unlike ticker symbols. Only uppercase for stock/crypto.
  const rawIdentifier = decodeURIComponent(params.identifier);
  const identifier = type === "prediction" ? rawIdentifier : rawIdentifier.toUpperCase();

  const user = await getUser();
  const tier = await getUserTier();
  const canSeeOptions = canAccessFeature(tier, "real_time");
  const canScoreOnDemand = canAccessFeature(tier, "on_demand_scoring");

  const { price, history, signals, accuracy, news, options, watchlistId, shortInterest, earnings, sentiment, corporateActions } =
    await fetchAssetData(type, identifier, user!.id);

  if (!price && signals.length === 0) notFound();

  // Prediction markets: identifier is a Polymarket conditionId hex hash, not
  // human-readable — show the market question instead wherever a title goes.
  const predictionMeta = type === "prediction" ? (price?.metadata as Record<string, unknown> | null) : null;
  const predictionTitle = predictionMeta?.title as string | undefined;
  const headerTitle = type === "prediction" && predictionTitle ? predictionTitle : identifier;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1
              className={
                type === "prediction"
                  ? "text-xl font-bold text-white tracking-tight leading-snug max-w-2xl"
                  : "text-2xl font-bold font-mono text-white tracking-tight"
              }
            >
              {headerTitle}
            </h1>
            <span className="text-xs text-zinc-400 capitalize bg-white/[0.05] border border-white/[0.08] px-2 py-0.5 rounded-md">
              {type}
            </span>
            {accuracy && <AccuracyBadge accuracy={accuracy} />}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {type === "prediction"
              ? price && <PredictionPriceHeader price={price} />
              : price && <PriceHeader price={price} assetType={type} />}
            {type === "stock" && earnings && (
              <EarningsBadge reportDate={earnings.report_date} reportTime={earnings.report_time} />
            )}
            {type === "crypto" && sentiment?.metadata && (
              <FearGreedBadge metadata={sentiment.metadata as Record<string, unknown>} />
            )}
          </div>
        </div>

        <WatchlistToggle
          assetType={type}
          identifier={identifier}
          watchlistId={watchlistId}
        />
      </div>

      {/* Key Stats (stocks & crypto) */}
      {(type === "stock" || type === "crypto") && price && (
        <KeyStatsGrid
          metadata={price.metadata as Record<string, unknown> | null}
          change24h={price.change_24h}
        />
      )}

      {/* Price performance across timeframes */}
      {(type === "stock" || type === "crypto") && (
        <PricePerformance identifier={identifier} assetType={type} />
      )}

      {/* Price chart */}
      {history.length > 1 && (
        <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl p-4">
          <PriceChart data={history} assetType={type} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: signals */}
        <div className="lg:col-span-2 space-y-4">
          <SectionHeader count={signals.length}>Signal history</SectionHeader>
          {signals.length === 0 ? (
            canScoreOnDemand ? (
              <OnDemandScore assetType={type} identifier={identifier} />
            ) : (
              <div className="text-sm text-zinc-500 py-8 text-center">No signals yet for {headerTitle}.</div>
            )
          ) : (
            <SignalList signals={signals} />
          )}
        </div>

        {/* Right: sidebar */}
        <div className="space-y-4">
          {/* Short Interest (stocks only) */}
          {type === "stock" && shortInterest && (
            <ShortInterestCard data={shortInterest} />
          )}

          {/* Corporate actions (stocks only) */}
          {type === "stock" && corporateActions.length > 0 && (
            <CorporateActionsList actions={corporateActions} />
          )}

          {/* Market Stats (crypto only) */}
          {type === "crypto" && price?.metadata && (
            <MarketStatsCard metadata={price.metadata as Record<string, unknown>} />
          )}

          {/* Fundamentals (crypto only) */}
          {type === "crypto" && price?.metadata && (
            <FundamentalsCard metadata={price.metadata as Record<string, unknown>} />
          )}

          {/* Prediction market stats (predictions only) */}
          {type === "prediction" && predictionMeta && (
            <PredictionStatsCard metadata={predictionMeta} volume={price?.volume ?? null} />
          )}

          {/* News */}
          {news.length > 0 && (
            <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl p-4 space-y-3">
              <SectionHeader>News</SectionHeader>
              <div className="space-y-2">
                {news.map((item) => (
                  <a
                    key={item.id}
                    href={item.url ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block group"
                  >
                    <p className="text-xs text-zinc-300 group-hover:text-white leading-snug transition-colors line-clamp-2">
                      {item.headline}
                    </p>
                    <p className="text-[11px] text-zinc-600 mt-0.5">
                      {item.source}
                      {item.published_at &&
                        ` · ${new Date(item.published_at).toLocaleDateString()}`}
                    </p>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Options flow (stocks only, pro/elite) */}
          {type === "stock" && (
            <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl p-4 space-y-3">
              <SectionHeader>Options flow</SectionHeader>
              {canSeeOptions ? (
                options.length > 0 ? (
                  <OptionsFlowTable rows={options} />
                ) : (
                  <p className="text-xs text-zinc-600">No unusual flow recorded.</p>
                )
              ) : (
                <div className="text-center py-4 space-y-2">
                  <p className="text-xs text-zinc-500">Options flow is a Pro feature.</p>
                  <a
                    href="/dashboard/upgrade"
                    className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300"
                  >
                    Upgrade
                    <ArrowRight className="h-3 w-3" />
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Accuracy stats */}
          {accuracy && (
            <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl p-4 space-y-3">
              <SectionHeader>AI accuracy</SectionHeader>
              <div className="space-y-2">
                <StatRow label="Total signals" value={accuracy.total_signals} />
                <StatRow label="Win rate" value={`${((accuracy.win_rate ?? 0) * 100).toFixed(1)}% (${accuracy.wins + accuracy.losses} resolved)`} highlight />
                <StatRow label="Wins" value={accuracy.wins} />
                <StatRow label="Losses" value={accuracy.losses} />
                <StatRow label="Neutral" value={accuracy.neutrals} />
                <StatRow
                  label="Avg confidence"
                  value={`${Number(accuracy.avg_confidence ?? 0).toFixed(0)}%`}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatRow({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className={`text-xs font-semibold tabular-nums ${highlight ? "text-emerald-400" : "text-white"}`}>
        {value}
      </span>
    </div>
  );
}

/* ---------- Earnings badge ---------- */
function EarningsBadge({ reportDate, reportTime }: { reportDate: string; reportTime: string | null }) {
  const d = new Date(reportDate + "T00:00:00");
  const formatted = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const timeLabel =
    reportTime === "AMC" ? "AMC" : reportTime === "BMO" ? "BMO" : reportTime ?? "";

  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-700/40 px-2 py-0.5 rounded-md">
      Earnings: {formatted} {timeLabel}
    </span>
  );
}

/* ---------- Key stats grid (stocks only) ---------- */
function KeyStatsGrid({
  metadata,
  change24h,
}: {
  metadata: Record<string, unknown> | null;
  change24h: number | null;
}) {
  const rsi = metadata?.rsi_14 != null ? Number(metadata.rsi_14) : null;
  const volumeRatio = metadata?.volume_ratio != null ? Number(metadata.volume_ratio) : null;

  // Show nothing if there are no stats to display
  if (rsi == null && volumeRatio == null && change24h == null) return null;

  const rsiColor =
    rsi == null
      ? "text-white"
      : rsi > 70
      ? "text-red-400"
      : rsi < 30
      ? "text-emerald-400"
      : "text-white";

  const rsiLabel =
    rsi == null ? null : rsi > 70 ? "Overbought" : rsi < 30 ? "Oversold" : "Neutral";

  return (
    <div className="grid grid-cols-3 gap-3">
      {rsi != null && (
        <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl p-3 text-center">
          <p className="text-[11px] text-zinc-500 uppercase tracking-wider mb-1">RSI (14)</p>
          <p className={`text-lg font-bold font-mono tabular-nums ${rsiColor}`}>
            {rsi.toFixed(1)}
          </p>
          <p className={`text-[10px] mt-0.5 ${rsiColor}`}>{rsiLabel}</p>
        </div>
      )}
      {volumeRatio != null && (
        <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl p-3 text-center">
          <p className="text-[11px] text-zinc-500 uppercase tracking-wider mb-1">Vol Ratio</p>
              <p className={`text-lg font-bold font-mono tabular-nums ${volumeRatio > 2 ? "text-amber-400" : "text-white"}`}>
            {volumeRatio.toFixed(2)}x
          </p>
          <p className="text-[10px] text-zinc-600 mt-0.5">vs avg</p>
        </div>
      )}
      {change24h != null && (
        <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl p-3 text-center">
          <p className="text-[11px] text-zinc-500 uppercase tracking-wider mb-1">24h Change</p>
          <p className={`text-lg font-bold font-mono tabular-nums ${change24h >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {change24h >= 0 ? "+" : ""}{Number(change24h).toFixed(2)}%
          </p>
        </div>
      )}
    </div>
  );
}

/* ---------- Short Interest card ---------- */
function ShortInterestCard({
  data,
}: {
  data: {
    short_float_pct: number | null;
    short_ratio: number | null;
    shares_short: number | null;
    vs_previous: number | null;
    is_high_short: boolean | null;
  };
}) {
  function fmtShares(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
  }

  return (
    <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <SectionHeader>Short interest</SectionHeader>
        {data.is_high_short && (
          <span className="text-[10px] font-bold bg-red-500/15 text-red-400 border border-red-700/40 px-1.5 py-0.5 rounded-md uppercase tracking-wider">
            High
          </span>
        )}
      </div>
      <div className="space-y-2">
        {data.short_float_pct != null && (
          <StatRow label="Short float" value={`${Number(data.short_float_pct).toFixed(2)}%`} />
        )}
        {data.short_ratio != null && (
          <StatRow label="Short ratio" value={Number(data.short_ratio).toFixed(2)} />
        )}
        {data.shares_short != null && (
          <StatRow label="Shares short" value={fmtShares(data.shares_short)} />
        )}
        {data.vs_previous != null && (
          <StatRow
            label="vs previous"
            value={`${data.vs_previous >= 0 ? "+" : ""}${Number(data.vs_previous).toFixed(2)}%`}
            highlight={data.vs_previous < 0}
          />
        )}
      </div>
    </div>
  );
}

/* ---------- Corporate actions (stocks only) — dense rows, not cards ---------- */
const CA_TYPE_LABEL: Record<string, string> = {
  forward_split:        "Split",
  reverse_split:        "Reverse split",
  unit_split:           "Split",
  cash_dividend:        "Dividend",
  stock_dividend:       "Stock dividend",
  spin_off:             "Spinoff",
  cash_merger:          "Merger",
  stock_merger:         "Merger",
  stock_and_cash_merger: "Merger",
};

function CorporateActionsList({
  actions,
}: {
  actions: {
    ca_type: string;
    ex_date: string | null;
    cash_amount: number | null;
    old_rate: number | null;
    new_rate: number | null;
  }[];
}) {
  function detail(a: (typeof actions)[number]): string {
    if (a.cash_amount != null) return `$${Number(a.cash_amount).toFixed(2)}/sh`;
    if (a.old_rate != null && a.new_rate != null) return `${a.old_rate}:${a.new_rate}`;
    return "";
  }

  return (
    <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl p-4 space-y-2">
      <SectionHeader>Corporate actions</SectionHeader>
      <div className="divide-y divide-white/[0.05]">
        {actions.map((a, i) => (
          <div key={i} className="flex items-center justify-between gap-3 py-2 text-xs">
            <span className="text-zinc-300">{CA_TYPE_LABEL[a.ca_type] ?? a.ca_type}</span>
            <span className="flex items-center gap-3 font-mono text-zinc-500">
              {detail(a) && <span className="text-zinc-400">{detail(a)}</span>}
              <span>{a.ex_date ?? "—"}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Fear & Greed badge (crypto only) ---------- */
function FearGreedBadge({ metadata }: { metadata: Record<string, unknown> }) {
  const value = metadata?.value != null ? Number(metadata.value) : null;
  const classification = metadata?.value_classification as string | undefined;

  if (value == null || !classification) return null;

  const lc = classification.toLowerCase();
  const isRed = lc.includes("fear");
  const isGreen = lc.includes("greed");
  const colorClasses = isRed
    ? "bg-red-500/15 text-red-400 border-red-500/30"
    : isGreen
    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
    : "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";

  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-semibold border px-2 py-0.5 rounded-md ${colorClasses}`}
    >
      Fear &amp; Greed: {value} {classification}
    </span>
  );
}

/* ---------- Prediction price header (predictions only) ---------- */
function PredictionPriceHeader({
  price: data,
}: {
  price: { price: number | null; metadata: Record<string, unknown> | null; captured_at: string };
}) {
  const metadata = data.metadata as Record<string, unknown> | null;
  const yesPrice = metadata?.yes_price != null ? Number(metadata.yes_price) : data.price;
  const noPrice = metadata?.no_price != null ? Number(metadata.no_price) : yesPrice != null ? 1 - yesPrice : null;

  return (
    <div className="flex items-baseline gap-3 flex-wrap">
      {yesPrice != null && (
        <span className="text-2xl font-bold font-mono tabular-nums text-emerald-400">
          {(yesPrice * 100).toFixed(0)}<span className="text-sm font-semibold opacity-70">¢ YES</span>
        </span>
      )}
      {noPrice != null && (
        <span className="text-2xl font-bold font-mono tabular-nums text-red-400">
          {(noPrice * 100).toFixed(0)}<span className="text-sm font-semibold opacity-70">¢ NO</span>
        </span>
      )}
    </div>
  );
}

/* ---------- Prediction stats card (predictions only) ---------- */
function PredictionStatsCard({
  metadata,
  volume,
}: {
  metadata: Record<string, unknown>;
  volume: number | null;
}) {
  const yesPrice = metadata?.yes_price != null ? Number(metadata.yes_price) : null;
  const noPrice = metadata?.no_price != null ? Number(metadata.no_price) : null;
  const endDate = metadata?.end_date as string | undefined;
  const category = metadata?.category as string | undefined;

  if (yesPrice == null && noPrice == null && !endDate && !category && volume == null) return null;

  function fmtEndDate(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  }

  function fmtVolume(n: number): string {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
    return `$${n.toLocaleString()}`;
  }

  return (
    <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl p-4 space-y-3">
      <SectionHeader>Market stats</SectionHeader>
      <div className="space-y-2">
        {yesPrice != null && (
          <StatRow label="Yes" value={`${(yesPrice * 100).toFixed(0)}%`} highlight />
        )}
        {noPrice != null && (
          <StatRow label="No" value={`${(noPrice * 100).toFixed(0)}%`} />
        )}
        {volume != null && <StatRow label="Volume" value={fmtVolume(Number(volume))} />}
        {category && <StatRow label="Category" value={category} />}
        {endDate && <StatRow label="Resolves" value={fmtEndDate(endDate)} />}
      </div>
    </div>
  );
}

/* ---------- Market Stats card (crypto only) ---------- */
function MarketStatsCard({ metadata }: { metadata: Record<string, unknown> }) {
  const marketCap = metadata?.market_cap != null ? Number(metadata.market_cap) : null;
  const marketCapRank = metadata?.market_cap_rank != null ? Number(metadata.market_cap_rank) : null;
  const ath = metadata?.ath != null ? Number(metadata.ath) : null;
  const athChangePct = metadata?.ath_change_pct != null ? Number(metadata.ath_change_pct) : null;

  if (marketCap == null && marketCapRank == null && ath == null && athChangePct == null) return null;

  function fmtMarketCap(n: number): string {
    if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
    return `$${n.toLocaleString()}`;
  }

  return (
    <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl p-4 space-y-3">
      <SectionHeader>Market stats</SectionHeader>
      <div className="space-y-2">
        {marketCapRank != null && (
          <StatRow label="Rank" value={`#${marketCapRank}`} />
        )}
        {marketCap != null && (
          <StatRow label="Market cap" value={fmtMarketCap(marketCap)} />
        )}
        {ath != null && (
          <StatRow label="All-time high" value={`$${ath.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
        )}
        {athChangePct != null && (
          <StatRow
            label="From ATH"
            value={`${athChangePct >= 0 ? "+" : ""}${athChangePct.toFixed(1)}%`}
            highlight={athChangePct >= 0}
          />
        )}
      </div>
    </div>
  );
}

/* ---------- Fundamentals card (crypto only) ---------- */
function FundamentalsCard({ metadata }: { metadata: Record<string, unknown> }) {
  const roi30d = metadata?.messari_roi_30d != null ? Number(metadata.messari_roi_30d) : null;
  const roi90d = metadata?.messari_roi_90d != null ? Number(metadata.messari_roi_90d) : null;
  const devCommits = metadata?.messari_dev_commits_30d != null ? Number(metadata.messari_dev_commits_30d) : null;
  const liquidSupply = metadata?.messari_liquid_supply_pct != null ? Number(metadata.messari_liquid_supply_pct) : null;

  if (roi30d == null && roi90d == null && devCommits == null && liquidSupply == null) return null;

  return (
    <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl p-4 space-y-3">
      <SectionHeader>Fundamentals</SectionHeader>
      <div className="space-y-2">
        {roi30d != null && (
          <StatRow
            label="30d ROI"
            value={`${roi30d >= 0 ? "+" : ""}${roi30d.toFixed(1)}%`}
            highlight={roi30d > 0}
          />
        )}
        {roi90d != null && (
          <StatRow
            label="90d ROI"
            value={`${roi90d >= 0 ? "+" : ""}${roi90d.toFixed(1)}%`}
            highlight={roi90d > 0}
          />
        )}
        {devCommits != null && (
          <StatRow label="Dev commits (30d)" value={devCommits.toLocaleString()} />
        )}
        {liquidSupply != null && (
          <StatRow label="Liquid supply" value={`${liquidSupply.toFixed(1)}%`} />
        )}
      </div>
    </div>
  );
}
