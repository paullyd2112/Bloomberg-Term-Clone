import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getUserTierAndProfile } from "@/lib/user";
import { applyFreeDelay, applyFreeLimit, FREE_TIER_SIGNAL_LIMIT, FREE_TIER_DELAY_HOURS } from "@/lib/tier";
import SignalFeed from "@/components/signals/SignalFeed";
import type { Signal } from "@/components/signals/SignalCard";
import FreeSignalGate from "@/components/ui/FreeSignalGate";
import WhaleSentinel from "@/components/WhaleSentinel";
import SectionHeader from "@/components/ui/SectionHeader";
import SkipTrialBanner from "@/components/SkipTrialBanner";
import SystemSafeguards from "@/components/dashboard/SystemSafeguards";
import RedditTrending from "@/components/dashboard/RedditTrending";
import MarketPulse from "@/components/dashboard/MarketPulse";
import TrackRecord from "@/components/dashboard/TrackRecord";
import CryptoMarketGrid from "@/components/dashboard/CryptoMarketGrid";
import PerformanceBar from "@/components/dashboard/PerformanceBar";

export const revalidate = 60;

// Keep in sync with apps/data-service/scoring/engine.py's ENGINE_CUTOFF.
const ENGINE_CUTOFF = "2026-07-15T00:00:00Z";

type MonthBucket = { month: string; wins: number; losses: number; winRate: number };

type PlatformAccuracy = {
  overallWinRate: number;
  totalResolved: number;
  totalWins: number;
  totalLosses: number;
  byAssetClass: { asset_type: string; winRate: number; resolved: number }[];
  byMonth: MonthBucket[];
  yesterday: { wins: number; losses: number; winRate: number; resolved: number } | null;
};

async function fetchPlatformAccuracy(): Promise<PlatformAccuracy | null> {
  const supabase = createClient();

  // Crypto-only pivot (July 2026): stock outcomes are excluded so the
  // headline track record reflects the asset classes we actually signal.
  const { data, error } = await supabase
    .from("signals")
    .select("asset_type, outcome, created_at")
    .in("asset_type", ["crypto", "prediction"])
    .eq("is_backtest", false)
    .in("outcome", ["WIN", "LOSS"])
    .gte("created_at", ENGINE_CUTOFF)
    .limit(5000);

  if (error || !data || data.length === 0) {
    return null;
  }

  let totalWins = 0;
  let totalLosses = 0;
  const assetGrouped = new Map<string, { wins: number; losses: number }>();
  const monthGrouped = new Map<string, { wins: number; losses: number }>();

  const now = new Date();
  const yesterdayStr = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  let ydayWins = 0;
  let ydayLosses = 0;

  for (const row of data) {
    const isWin = row.outcome === "WIN";
    if (isWin) totalWins++;
    else totalLosses++;

    const assetKey = row.asset_type ?? "unknown";
    const ag = assetGrouped.get(assetKey) ?? { wins: 0, losses: 0 };
    if (isWin) ag.wins++;
    else ag.losses++;
    assetGrouped.set(assetKey, ag);

    const monthKey = (row.created_at as string).slice(0, 7);
    const mg = monthGrouped.get(monthKey) ?? { wins: 0, losses: 0 };
    if (isWin) mg.wins++;
    else mg.losses++;
    monthGrouped.set(monthKey, mg);

    const dayStr = (row.created_at as string).slice(0, 10);
    if (dayStr === yesterdayStr) {
      if (isWin) ydayWins++;
      else ydayLosses++;
    }
  }

  const totalResolved = totalWins + totalLosses;
  if (totalResolved < 5) return null;
  const overallWinRate = totalWins / totalResolved;

  const byAssetClass = Array.from(assetGrouped.entries()).map(([asset_type, g]) => {
    const resolved = g.wins + g.losses;
    return { asset_type, winRate: resolved > 0 ? g.wins / resolved : 0, resolved };
  });

  const byMonth = Array.from(monthGrouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, g]) => {
      const resolved = g.wins + g.losses;
      return { month, wins: g.wins, losses: g.losses, winRate: resolved > 0 ? g.wins / resolved : 0 };
    });

  const ydayResolved = ydayWins + ydayLosses;
  const yesterday = ydayResolved >= 3
    ? { wins: ydayWins, losses: ydayLosses, winRate: ydayWins / ydayResolved, resolved: ydayResolved }
    : null;

  return { overallWinRate, totalResolved, totalWins, totalLosses, byAssetClass, byMonth, yesterday };
}

async function fetchSignals(): Promise<Signal[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("signals")
    .select("*")
    .in("asset_type", ["crypto", "prediction"])
    .eq("is_backtest", false)
    .gte("created_at", ENGINE_CUTOFF)
    .gte("confidence", 60)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    console.error("fetchSignals error:", error.message);
    return [];
  }
  const signals = (data as Signal[]) ?? [];

  // market_title is stored directly on the signal row since migration 012.

  // Compute unrealized P&L for PENDING signals using latest prices.
  const pendingSignals = signals.filter((s) => s.outcome === "PENDING" && s.price_at_signal != null);
  if (pendingSignals.length > 0) {
    const cryptoPending = pendingSignals.filter((s) => s.asset_type === "crypto");
    const predPending = pendingSignals.filter((s) => s.asset_type === "prediction");

    const priceMap = new Map<string, number>();

    const cryptoIds = cryptoPending.length > 0
      ? Array.from(new Set(cryptoPending.map((s) => s.identifier)))
      : [];
    const predIds = predPending.length > 0
      ? Array.from(new Set(predPending.map((s) => s.identifier)))
      : [];

    const [cryptoPricesRes, predPricesRes] = await Promise.all([
      cryptoIds.length > 0
        ? supabase
            .from("raw_prices")
            .select("identifier, price")
            .eq("asset_type", "crypto")
            .in("identifier", cryptoIds)
            .order("captured_at", { ascending: false })
        : Promise.resolve({ data: null }),
      predIds.length > 0
        ? supabase
            .from("raw_prices")
            .select("identifier, metadata")
            .eq("asset_type", "prediction")
            .in("identifier", predIds)
            .order("captured_at", { ascending: false })
        : Promise.resolve({ data: null }),
    ]);

    for (const row of cryptoPricesRes.data ?? []) {
      if (!priceMap.has(`crypto:${row.identifier}`)) {
        priceMap.set(`crypto:${row.identifier}`, Number(row.price));
      }
    }
    for (const row of predPricesRes.data ?? []) {
      const yesPrice = (row.metadata as Record<string, unknown> | null)?.yes_price;
      if (yesPrice != null && !priceMap.has(`prediction:${row.identifier}`)) {
        priceMap.set(`prediction:${row.identifier}`, Number(yesPrice));
      }
    }

    for (const s of signals) {
      if (s.outcome !== "PENDING" || s.price_at_signal == null) continue;
      const currentPrice = priceMap.get(`${s.asset_type}:${s.identifier}`);
      if (currentPrice == null) continue;

      const entry = Number(s.price_at_signal);
      if (entry === 0) continue;

      if (s.asset_type === "prediction") {
        // For predictions, show probability point change (current - entry) * 100
        // Direction matters: YES signal profits when price goes up, NO when it goes down
        const diff = (currentPrice - entry) * 100;
        s.unrealized_pnl = s.direction === "NO" ? -diff : diff;
      } else {
        // For crypto, show % change adjusted for direction
        const pctChange = ((currentPrice - entry) / entry) * 100;
        s.unrealized_pnl = s.direction === "SELL" ? -pctChange : pctChange;
      }
    }
  }

  return signals;
}

async function fetchTopMovers() {
  const supabase = createClient();

  const cryptoRes = await supabase
    .from("raw_prices")
    .select("identifier, asset_type, price, change_24h")
    .eq("asset_type", "crypto")
    .not("change_24h", "is", null)
    .neq("identifier", "MARKET_SENTIMENT")
    .order("captured_at", { ascending: false })
    .limit(80);

  const allData = cryptoRes.data ?? [];

  const seen = new Map<string, (typeof allData)[0]>();
  for (const row of allData) {
    if (!seen.has(row.identifier)) seen.set(row.identifier, row);
  }

  const top = Array.from(seen.values())
    .sort((a, b) => Math.abs(b.change_24h ?? 0) - Math.abs(a.change_24h ?? 0))
    .slice(0, 10);

  // Fetch sparkline data (last 24h price history) for the top movers
  const identifiers = top.map((t) => t.identifier);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: historyRows } = await supabase
    .from("raw_prices")
    .select("identifier, price, captured_at")
    .eq("asset_type", "crypto")
    .in("identifier", identifiers)
    .gte("captured_at", since)
    .order("captured_at", { ascending: true })
    .limit(1000);

  const sparklines = new Map<string, number[]>();
  for (const h of historyRows ?? []) {
    const arr = sparklines.get(h.identifier) ?? [];
    arr.push(Number(h.price));
    sparklines.set(h.identifier, arr);
  }

  return top.map((t) => ({
    ...t,
    sparkline: sparklines.get(t.identifier) ?? [],
  }));
}

export default async function DashboardPage() {
  const [{ tier, profile }, [signals, movers, accuracy]] = await Promise.all([
    getUserTierAndProfile(),
    Promise.all([fetchSignals(), fetchTopMovers(), fetchPlatformAccuracy()]),
  ]);

  const winCount  = signals.filter((s) => s.outcome === "WIN").length;
  const lossCount = signals.filter((s) => s.outcome === "LOSS").length;
  const pending   = signals.filter((s) => s.outcome === "PENDING").length;
  const resolved  = winCount + lossCount;
  const allPending = resolved === 0 && pending > 0;

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-5 max-w-7xl mx-auto">
      {/* Page header — compact, exchange-style */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00d4aa] opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#00d4aa]" />
          </span>
          <h1 className="text-lg font-semibold tracking-tight text-white">Crypto Signals</h1>
          <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider hidden sm:inline">
            {signals.length} signals · {pending} pending
          </span>
        </div>
        <div className="flex items-center gap-3">
          {!allPending && (
            <div className="flex items-baseline gap-1.5">
              <span className="text-[10px] text-zinc-600 font-mono uppercase tracking-wider">W/L</span>
              <span className="font-mono text-sm font-bold tabular-nums text-[#00d4aa]">{winCount}</span>
              <span className="text-zinc-600">/</span>
              <span className="font-mono text-sm font-bold tabular-nums text-red-400">{lossCount}</span>
            </div>
          )}
        </div>
      </header>

      {tier !== "free" && profile?.billing_interval !== "lifetime" && (
        <SkipTrialBanner />
      )}

      {/* Crypto market grid — Kraken-style top movers with sparklines */}
      {movers.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[11px] font-mono font-semibold uppercase tracking-[0.15em] text-zinc-500">
              Top Movers
            </h2>
            <span className="text-[10px] text-zinc-600 font-mono">24h change</span>
          </div>
          <CryptoMarketGrid coins={movers} />
        </section>
      )}

      {/* Performance — visual monthly bar chart */}
      {accuracy && !allPending && (
        <PerformanceBar
          overallWinRate={accuracy.overallWinRate}
          totalWins={accuracy.totalWins}
          totalLosses={accuracy.totalLosses}
          totalResolved={accuracy.totalResolved}
          byMonth={accuracy.byMonth}
          yesterday={accuracy.yesterday}
        />
      )}

      {/* Market intelligence — whales + reddit */}
      <MarketPulse
        moversContent={null}
        whalesContent={<WhaleSentinel bare />}
        redditContent={
          <Suspense
            fallback={
              <div className="h-40 bg-white/[0.02] rounded-lg animate-pulse" />
            }
          >
            <RedditTrending bare />
          </Suspense>
        }
      />

      {/* Pending indicator */}
      {allPending && (
        <div className="bg-white/[0.02] border border-amber-500/20 rounded-xl px-5 py-4 flex items-center gap-3">
          <span className="relative flex h-2 w-2 flex-shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
          </span>
          <div>
            <p className="text-sm font-medium text-white">{pending} signal{pending === 1 ? "" : "s"} pending</p>
            <p className="text-xs text-zinc-500">Win rate appears once signals resolve (6–24h)</p>
          </div>
        </div>
      )}

      {/* Signal feed — the product, front and center */}
      <section>
        <SectionHeader primary divider className="mb-3">Latest Signals</SectionHeader>
        {tier === "free" ? (
          <>
            <SignalFeed signals={applyFreeLimit(applyFreeDelay(signals) as Signal[])} hideTrade />
            <FreeSignalGate
              delayHours={FREE_TIER_DELAY_HOURS}
              dailyLimit={FREE_TIER_SIGNAL_LIMIT}
              totalAvailable={signals.length}
            />
          </>
        ) : (
          <SignalFeed signals={signals} />
        )}
      </section>

      {/* Detailed track record (expandable) */}
      {accuracy && (
        <section>
          <SectionHeader divider className="mb-3">Detailed Track Record</SectionHeader>
          <TrackRecord accuracy={accuracy} />
        </section>
      )}

      {/* System safeguards */}
      <SystemSafeguards />
    </div>
  );
}

