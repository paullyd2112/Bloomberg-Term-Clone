import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUser, getUserTier } from "@/lib/user";
import { canAccessFeature } from "@/lib/tier";
import SignalCard from "@/components/signals/SignalCard";
import type { Signal } from "@/components/signals/SignalCard";
import WatchlistToggle from "@/components/watchlist/WatchlistToggle";
import AccuracyBadge from "@/components/asset/AccuracyBadge";
import OptionsFlowTable from "@/components/asset/OptionsFlowTable";
import PriceHeader from "@/components/asset/PriceHeader";
import PriceChart, { type PricePoint } from "@/components/asset/PriceChart";

export const revalidate = 60;

const VALID_TYPES = ["stock", "crypto", "prediction"] as const;
type AssetType = (typeof VALID_TYPES)[number];

type PageProps = {
  params: { type: string; identifier: string };
};

async function fetchAssetData(assetType: AssetType, identifier: string, userId: string) {
  const supabase = createClient();

  const [priceRes, historyRes, signalsRes, accuracyRes, newsRes, optionsRes, watchlistRes] =
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
    price:       priceRes.data,
    history,
    signals:     (signalsRes.data ?? []) as Signal[],
    accuracy:    accuracyRes.data,
    news:        newsRes.data ?? [],
    options:     optionsRes.data ?? [],
    watchlistId: watchlistRes.data?.id ?? null,
  };
}

export default async function AssetPage({ params }: PageProps) {
  const type = params.type as AssetType;
  if (!VALID_TYPES.includes(type)) notFound();

  const identifier = decodeURIComponent(params.identifier).toUpperCase();

  const user = await getUser();
  const tier = await getUserTier();
  const canSeeOptions = canAccessFeature(tier, "real_time");

  const { price, history, signals, accuracy, news, options, watchlistId } =
    await fetchAssetData(type, identifier, user!.id);

  if (!price && signals.length === 0) notFound();

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold font-mono text-white">{identifier}</h1>
            <span className="text-xs text-zinc-500 capitalize bg-zinc-800 px-2 py-0.5 rounded">
              {type}
            </span>
            {accuracy && <AccuracyBadge accuracy={accuracy} />}
          </div>
          {price && <PriceHeader price={price} assetType={type} />}
        </div>

        <WatchlistToggle
          assetType={type}
          identifier={identifier}
          watchlistId={watchlistId}
        />
      </div>

      {/* Price chart */}
      {history.length > 1 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <PriceChart data={history} assetType={type} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: signals */}
        <div className="lg:col-span-2 space-y-4">
          <SectionHeader label="Signal history" count={signals.length} />
          {signals.length === 0 ? (
            <div className="text-sm text-zinc-500 py-8 text-center">No signals yet for {identifier}.</div>
          ) : (
            <div className="space-y-3">
              {signals.map((s) => (
                <SignalCard key={s.id} signal={s} />
              ))}
            </div>
          )}
        </div>

        {/* Right: sidebar */}
        <div className="space-y-4">
          {/* News */}
          {news.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
              <SectionHeader label="News" />
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
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
              <SectionHeader label="Options flow" />
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
                    className="text-xs text-green-400 hover:text-green-300"
                  >
                    Upgrade →
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Accuracy stats */}
          {accuracy && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
              <SectionHeader label="AI accuracy" />
              <div className="space-y-2">
                <StatRow label="Total signals" value={accuracy.total_signals} />
                <StatRow label="Win rate" value={`${((accuracy.win_rate ?? 0) * 100).toFixed(1)}%`} highlight />
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

function SectionHeader({ label, count }: { label: string; count?: number }) {
  return (
    <div className="flex items-center gap-2">
      <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{label}</h2>
      {count !== undefined && (
        <span className="text-xs text-zinc-700 tabular-nums">{count}</span>
      )}
    </div>
  );
}

function StatRow({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className={`text-xs font-semibold tabular-nums ${highlight ? "text-green-400" : "text-white"}`}>
        {value}
      </span>
    </div>
  );
}
