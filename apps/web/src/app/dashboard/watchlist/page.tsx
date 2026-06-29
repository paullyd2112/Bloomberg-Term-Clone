import { Star } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getUser, getUserTier } from "@/lib/user";
import { WATCHLIST_LIMIT } from "@/lib/tier";
import AddToWatchlist from "@/components/watchlist/AddToWatchlist";
import WatchlistRow from "@/components/watchlist/WatchlistRow";
import SubscribeGate from "@/components/ui/SubscribeGate";

export const revalidate = 60;

type WatchlistItem = {
  id: number;
  asset_type: string;
  identifier: string;
  created_at: string;
  latest_signal?: {
    direction: string;
    confidence: number;
    created_at: string;
  } | null;
  latest_price?: {
    price: number | null;
    change_24h: number | null;
  } | null;
};

async function fetchWatchlist(userId: string): Promise<WatchlistItem[]> {
  const supabase = createClient();

  const { data: rows } = await supabase
    .from("watchlist")
    .select("id, asset_type, identifier, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (!rows || rows.length === 0) return [];

  const enriched = await Promise.all(
    rows.map(async (row) => {
      const [priceRes, signalRes] = await Promise.all([
        supabase
          .from("raw_prices")
          .select("price, change_24h")
          .eq("asset_type", row.asset_type)
          .eq("identifier", row.identifier)
          .order("captured_at", { ascending: false })
          .limit(1)
          .single(),
        supabase
          .from("signals")
          .select("direction, confidence, created_at")
          .eq("asset_type", row.asset_type)
          .eq("identifier", row.identifier)
          .eq("is_backtest", false)
          .gte("confidence", 70)
          .order("created_at", { ascending: false })
          .limit(1)
          .single(),
      ]);

      return {
        ...row,
        latest_price:  priceRes.data  ?? null,
        latest_signal: signalRes.data ?? null,
      };
    }),
  );

  return enriched;
}

export default async function WatchlistPage() {
  const user = await getUser();
  const tier = await getUserTier();

  if (tier === "free") return <SubscribeGate />;

  const items = await fetchWatchlist(user!.id);

  const limit        = WATCHLIST_LIMIT[tier];
  const count        = items.length;
  const limitReached = count >= limit;

  return (
    <div className="p-5 md:p-8 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-700/30 bg-emerald-500/10 text-emerald-400">
              <Star className="h-4 w-4" />
            </span>
            <h1 className="text-xl font-semibold tracking-tight text-white">Watchlist</h1>
          </div>
          <p className="text-sm text-zinc-500">
            Tracking{" "}
            <span className="tabular-nums text-zinc-300">
              {count}
              {limit === Infinity ? "" : ` / ${limit}`}
            </span>{" "}
            assets for live signals.
          </p>
        </div>
        <AddToWatchlist limitReached={limitReached} />
      </div>

      {/* Table */}
      {items.length === 0 ? (
        <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl py-16 text-center flex flex-col items-center gap-3">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-700/30 bg-emerald-500/10 text-emerald-400">
            <Star className="h-6 w-6" />
          </span>
          <p className="text-zinc-300 text-sm font-medium">Your watchlist is empty</p>
          <p className="text-zinc-500 text-xs max-w-xs leading-relaxed">
            Add stocks or crypto to track signals for them.
          </p>
        </div>
      ) : (
        <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl overflow-x-auto">
          <div className="flex items-center gap-3 px-3 sm:px-4 py-2.5 border-b border-white/[0.08] text-[11px] font-semibold text-zinc-500 uppercase tracking-widest min-w-[320px]">
            <div className="flex-1">Asset</div>
            <div className="min-w-[56px] sm:min-w-[80px] text-right">Price</div>
            <div className="min-w-[48px] sm:min-w-[64px] text-right">Signal</div>
            <div className="w-7 sm:w-6" />
          </div>

          {items.map((item) => (
            <WatchlistRow key={item.id} item={item} />
          ))}
        </div>
      )}

    </div>
  );
}
