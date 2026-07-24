"use client";

import { useEffect, useState, useMemo } from "react";
import { Layers, TrendingUp, TrendingDown, RefreshCw } from "lucide-react";
import { clsx } from "clsx";
import { useAccount } from "wagmi";
import ConnectWalletButton from "@/components/predictions/ConnectWalletButton";
import { getCachedCredentials } from "@/lib/polymarket/auth";
import { getOpenOrders, getTradeHistory, type OpenOrder, type TradeRecord } from "@/lib/polymarket/clob";
import { createClient } from "@/lib/supabase/client";

type Position = {
  asset_id: string;
  condition_id: string;
  market_title: string;
  direction: "YES" | "NO";
  size: number;
  avg_price: number;
  current_price: number | null;
  unrealized_pnl: number | null;
  pnl_pct: number | null;
};

type PerformanceStats = {
  total_trades: number;
  total_volume: number;
  realized_pnl: number;
  win_count: number;
  loss_count: number;
};

type TabId = "positions" | "orders" | "history";

export default function PositionsPage() {
  const { address, isConnected } = useAccount();
  const [positions, setPositions] = useState<Position[]>([]);
  const [openOrders, setOpenOrders] = useState<OpenOrder[]>([]);
  const [tradeHistory, setTradeHistory] = useState<TradeRecord[]>([]);
  const [stats, setStats] = useState<PerformanceStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<TabId>("positions");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isConnected || !address) return;
    loadData();
  }, [isConnected, address]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    setLoading(true);
    setError(null);
    const creds = getCachedCredentials();
    if (!creds) {
      setError("CLOB credentials not found. Please reconnect your wallet on the Predictions page.");
      setLoading(false);
      return;
    }

    try {
      const [orders, history] = await Promise.all([
        getOpenOrders(creds).catch(() => [] as OpenOrder[]),
        getTradeHistory(creds, 100).catch(() => [] as TradeRecord[]),
      ]);

      setOpenOrders(orders);
      setTradeHistory(history);

      // Build positions from trade history
      const posMap = new Map<string, { size: number; cost: number; direction: string; asset_id: string }>();
      for (const t of history) {
        const key = t.asset_id;
        const existing = posMap.get(key) ?? { size: 0, cost: 0, direction: t.side, asset_id: t.asset_id };
        if (t.side === "BUY") {
          existing.size += Number(t.size);
          existing.cost += Number(t.size) * Number(t.price);
        } else {
          existing.size -= Number(t.size);
          existing.cost -= Number(t.size) * Number(t.price);
        }
        posMap.set(key, existing);
      }

      // Fetch current prices and market titles from Supabase (single query)
      const conditionIds = Array.from(new Set(history.map((t) => t.asset_id).filter(Boolean)));
      let priceMap = new Map<string, number>();
      let titleMap = new Map<string, string>();
      if (conditionIds.length > 0) {
        const supabase = createClient();
        const { data: rows } = await supabase
          .from("raw_prices")
          .select("identifier, metadata")
          .eq("asset_type", "prediction")
          .in("identifier", conditionIds)
          .order("captured_at", { ascending: false })
          .limit(conditionIds.length * 2);

        if (rows) {
          for (const row of rows) {
            const meta = (row.metadata as Record<string, unknown>) ?? {};
            if (!priceMap.has(row.identifier)) {
              const yp = meta.yes_price != null ? Number(meta.yes_price) : null;
              if (yp != null) priceMap.set(row.identifier, yp);
            }
            if (!titleMap.has(row.identifier)) {
              if (meta.title) titleMap.set(row.identifier, String(meta.title));
            }
          }
        }
      }

      const positionsList: Position[] = [];
      for (const [assetId, pos] of Array.from(posMap.entries())) {
        if (Math.abs(pos.size) < 0.001) continue;
        const avgPrice = pos.size > 0 ? pos.cost / pos.size : 0;
        const condId = assetId;
        const currentPrice = priceMap.get(condId) ?? null;
        const direction = pos.size > 0 ? "YES" : "NO";
        const size = Math.abs(pos.size);
        const unrealizedPnl = currentPrice != null
          ? direction === "YES"
            ? (currentPrice - avgPrice) * size
            : (avgPrice - currentPrice) * size
          : null;
        const pnlPct = unrealizedPnl != null && avgPrice > 0
          ? (unrealizedPnl / (avgPrice * size)) * 100
          : null;

        positionsList.push({
          asset_id: assetId,
          condition_id: condId,
          market_title: titleMap.get(condId) ?? condId.slice(0, 12) + "...",
          direction: direction as "YES" | "NO",
          size,
          avg_price: Math.abs(avgPrice),
          current_price: currentPrice,
          unrealized_pnl: unrealizedPnl,
          pnl_pct: pnlPct,
        });
      }

      setPositions(positionsList);

      // Compute performance stats
      let totalVol = 0;
      let wins = 0;
      let losses = 0;
      for (const t of history) {
        totalVol += Number(t.size) * Number(t.price);
      }
      // Simplified: count sells above buy avg as wins
      setStats({
        total_trades: history.length,
        total_volume: totalVol,
        realized_pnl: 0,
        win_count: wins,
        loss_count: losses,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load positions");
    } finally {
      setLoading(false);
    }
  }

  const totalUnrealized = useMemo(() => {
    return positions.reduce((sum, p) => sum + (p.unrealized_pnl ?? 0), 0);
  }, [positions]);

  if (!isConnected) {
    return (
      <div className="p-5 md:p-8 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-violet-700/30 bg-violet-500/10 text-violet-400">
            <Layers className="h-4 w-4" />
          </span>
          <h1 className="text-xl font-semibold tracking-tight text-white">Positions</h1>
        </div>
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <p className="text-zinc-400 text-sm">Connect your wallet to view your Polymarket positions.</p>
          <ConnectWalletButton />
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 md:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-violet-700/30 bg-violet-500/10 text-violet-400">
            <Layers className="h-4 w-4" />
          </span>
          <h1 className="text-xl font-semibold tracking-tight text-white">Positions</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            disabled={loading}
            className="text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw className={clsx("h-4 w-4", loading && "animate-spin")} />
          </button>
          <ConnectWalletButton />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
          <div className="text-2xl font-bold tabular-nums text-white">{positions.length}</div>
          <div className="text-zinc-500 text-xs mt-1">Open positions</div>
        </div>
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
          <div className={clsx("text-2xl font-bold tabular-nums", totalUnrealized >= 0 ? "text-emerald-400" : "text-red-400")}>
            {totalUnrealized >= 0 ? "+" : ""}{totalUnrealized.toFixed(2)}
          </div>
          <div className="text-zinc-500 text-xs mt-1">Unrealized P&L</div>
        </div>
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
          <div className="text-2xl font-bold tabular-nums text-white">{openOrders.length}</div>
          <div className="text-zinc-500 text-xs mt-1">Open orders</div>
        </div>
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
          <div className="text-2xl font-bold tabular-nums text-zinc-400">{stats?.total_trades ?? 0}</div>
          <div className="text-zinc-500 text-xs mt-1">Total trades</div>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-white/[0.08]">
        {([
          { id: "positions" as TabId, label: "Positions", count: positions.length },
          { id: "orders" as TabId, label: "Open Orders", count: openOrders.length },
          { id: "history" as TabId, label: "Trade History", count: tradeHistory.length },
        ]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={clsx(
              "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
              tab === t.id
                ? "border-violet-500 text-white"
                : "border-transparent text-zinc-400 hover:text-white",
            )}
          >
            {t.label}
            <span className="ml-1.5 text-xs text-zinc-600 tabular-nums">{t.count}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white/[0.03] border border-white/[0.06] rounded-xl h-16 animate-pulse" />
          ))}
        </div>
      ) : tab === "positions" ? (
        positions.length === 0 ? (
          <div className="py-16 text-center text-zinc-500 text-sm">
            No open positions found.
          </div>
        ) : (
          <div className="space-y-2">
            {positions.map((p) => (
              <div
                key={p.asset_id}
                className="bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 flex items-center justify-between gap-4 hover:bg-white/[0.05] transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white font-medium truncate">{p.market_title}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={clsx(
                      "text-xs font-semibold px-1.5 py-0.5 rounded",
                      p.direction === "YES"
                        ? "bg-emerald-500/10 text-emerald-400"
                        : "bg-red-500/10 text-red-400",
                    )}>
                      {p.direction}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {p.size.toFixed(1)} @ ${p.avg_price.toFixed(3)}
                    </span>
                    {p.current_price != null && (
                      <span className="text-xs text-zinc-500">
                        Now: ${p.current_price.toFixed(3)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  {p.unrealized_pnl != null ? (
                    <div className="flex items-center gap-1">
                      {p.unrealized_pnl >= 0 ? (
                        <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <TrendingDown className="h-3.5 w-3.5 text-red-400" />
                      )}
                      <span className={clsx(
                        "text-sm font-semibold tabular-nums",
                        p.unrealized_pnl >= 0 ? "text-emerald-400" : "text-red-400",
                      )}>
                        {p.unrealized_pnl >= 0 ? "+" : ""}{p.unrealized_pnl.toFixed(2)}
                      </span>
                      {p.pnl_pct != null && (
                        <span className={clsx(
                          "text-xs tabular-nums",
                          p.pnl_pct >= 0 ? "text-emerald-400/70" : "text-red-400/70",
                        )}>
                          ({p.pnl_pct >= 0 ? "+" : ""}{p.pnl_pct.toFixed(1)}%)
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-zinc-600">--</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      ) : tab === "orders" ? (
        openOrders.length === 0 ? (
          <div className="py-16 text-center text-zinc-500 text-sm">
            No open orders.
          </div>
        ) : (
          <div className="space-y-2">
            {openOrders.map((o, i) => (
              <div
                key={o.id ?? i}
                className="bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 flex items-center justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={clsx(
                      "text-xs font-semibold px-1.5 py-0.5 rounded",
                      o.side === "BUY"
                        ? "bg-emerald-500/10 text-emerald-400"
                        : "bg-red-500/10 text-red-400",
                    )}>
                      {o.side}
                    </span>
                    <span className="text-sm text-white tabular-nums">{Number(o.original_size).toFixed(1)} @ ${Number(o.price).toFixed(3)}</span>
                  </div>
                  <div className="text-xs text-zinc-500 mt-1">{o.asset_id?.slice(0, 20)}...</div>
                </div>
                <div className="text-xs text-zinc-500">{o.status}</div>
              </div>
            ))}
          </div>
        )
      ) : (
        tradeHistory.length === 0 ? (
          <div className="py-16 text-center text-zinc-500 text-sm">
            No trade history found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-zinc-500 text-xs border-b border-white/[0.06]">
                  <th className="pb-2 font-medium">Side</th>
                  <th className="pb-2 font-medium">Size</th>
                  <th className="pb-2 font-medium">Price</th>
                  <th className="pb-2 font-medium">Total</th>
                  <th className="pb-2 font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {tradeHistory.slice(0, 50).map((t, i) => (
                  <tr key={t.id ?? i} className="border-b border-white/[0.04]">
                    <td className="py-2">
                      <span className={clsx(
                        "text-xs font-semibold",
                        t.side === "BUY" ? "text-emerald-400" : "text-red-400",
                      )}>
                        {t.side}
                      </span>
                    </td>
                    <td className="py-2 text-zinc-300 tabular-nums">{Number(t.size).toFixed(2)}</td>
                    <td className="py-2 text-zinc-300 tabular-nums">${Number(t.price).toFixed(3)}</td>
                    <td className="py-2 text-zinc-300 tabular-nums">${(Number(t.size) * Number(t.price)).toFixed(2)}</td>
                    <td className="py-2 text-zinc-500 text-xs">
                      {t.created_at ? new Date(t.created_at).toLocaleDateString() : "--"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      <p className="text-zinc-600 text-xs">
        Positions derived from trade history via Polymarket CLOB API. Prices from latest ingestion snapshot.
      </p>
    </div>
  );
}
