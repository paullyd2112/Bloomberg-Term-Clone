"use client";

import { useEffect, useState, useCallback } from "react";
import { Fish, ArrowUp, ArrowDown, RefreshCw } from "lucide-react";

type WhaleAlert = {
  id?: number;
  condition_id: string;
  market_title: string;
  market_slug: string;
  outcome: string;
  side: "BID" | "ASK";
  price: number;
  size: number;
  notional_usd: number;
  detected_at: string;
};

function formatUSD(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function WhaleAlertsFeed() {
  const [alerts, setAlerts] = useState<WhaleAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAlerts = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await fetch("/api/whale-alerts");
      if (res.ok) {
        const data = await res.json();
        setAlerts(data);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(() => fetchAlerts(), 60_000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  return (
    <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-blue-700/30 bg-blue-500/10">
            <Fish className="h-4 w-4 text-blue-400" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-white">Whale Alerts</h3>
            <p className="text-[10px] text-zinc-500">Polymarket orders &gt; $5K</p>
          </div>
        </div>
        <button
          onClick={() => fetchAlerts(true)}
          disabled={refreshing}
          className="p-1.5 rounded-md hover:bg-white/[0.06] transition-colors disabled:opacity-40"
        >
          <RefreshCw className={`h-3.5 w-3.5 text-zinc-500 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="max-h-[400px] overflow-y-auto scrollbar-none">
        {loading ? (
          <div className="space-y-0">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="px-5 py-3.5 border-b border-white/[0.04] animate-pulse">
                <div className="h-3.5 w-3/4 bg-white/[0.06] rounded mb-2" />
                <div className="h-3 w-1/3 bg-white/[0.04] rounded" />
              </div>
            ))}
          </div>
        ) : alerts.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <Fish className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
            <p className="text-xs text-zinc-500">No whale activity detected yet</p>
            <p className="text-[10px] text-zinc-600 mt-1">Scanning every 15 minutes</p>
          </div>
        ) : (
          alerts.map((alert, idx) => (
            <div
              key={alert.id ?? idx}
              className="group px-5 py-3.5 border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.03] transition-colors animate-in fade-in slide-in-from-top-1 duration-300"
              style={{ animationDelay: `${idx * 50}ms` }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-zinc-300 leading-relaxed line-clamp-2">
                    {alert.market_title}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span
                      className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                        alert.side === "BID"
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-700/30"
                          : "bg-red-500/10 text-red-400 border border-red-700/30"
                      }`}
                    >
                      {alert.side === "BID" ? (
                        <ArrowUp className="h-2.5 w-2.5" />
                      ) : (
                        <ArrowDown className="h-2.5 w-2.5" />
                      )}
                      {alert.side}
                    </span>
                    <span className="text-[10px] text-zinc-500">
                      {alert.outcome} @ {(alert.price * 100).toFixed(0)}¢
                    </span>
                    <span className="text-[10px] text-zinc-600">{timeAgo(alert.detected_at)}</span>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className="text-sm font-bold tabular-nums text-white">
                    {formatUSD(alert.notional_usd)}
                  </span>
                  <p className="text-[10px] text-zinc-600 tabular-nums">
                    {alert.size.toLocaleString()} contracts
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
