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
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-bold text-white">Watchlist</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            {count}
            {limit === Infinity ? "" : ` / ${limit}`} assets
          </p>
        </div>
        <AddToWatchlist limitReached={limitReached} />
      </div>

      {/* Table */}
      {items.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl py-16 text-center">
          <div className="text-3xl mb-3">★</div>
          <p className="text-zinc-400 text-sm font-medium">Your watchlist is empty</p>
          <p className="text-zinc-600 text-xs mt-1">
            Add stocks, crypto, or prediction markets to track signals for them.
          </p>
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-x-auto">
          <div className="flex items-center gap-3 px-3 sm:px-4 py-2 border-b border-zinc-800 text-xs font-semibold text-zinc-500 uppercase tracking-widest min-w-[320px]">
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
