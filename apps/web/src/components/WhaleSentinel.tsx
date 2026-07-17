"use client";

import { useCallback, useEffect, useState } from "react";
import { clsx } from "clsx";

type WhaleAlert = {
  id: string;
  market_title: string;
  outcome: string;
  price: number;
  size: number;
  usd_value: number;
  created_at: string;
};

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export default function WhaleSentinel({ limit = 10 }: { limit?: number }) {
  const [alerts, setAlerts] = useState<WhaleAlert[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/whale-alerts?limit=${limit}`);
      if (!res.ok) return;
      const data = await res.json();
      setAlerts(data.alerts ?? []);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  if (loading) {
    return (
      <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl p-5">
        <div className="flex items-center gap-2.5 font-mono text-[11px] font-semibold text-zinc-500 uppercase tracking-[0.18em] mb-4">
          <span className="text-emerald-400 text-[10px] leading-none">●</span>
          Whale Sentinel
        </div>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 bg-white/[0.03] rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl p-5">
        <div className="flex items-center gap-2.5 font-mono text-[11px] font-semibold text-zinc-500 uppercase tracking-[0.18em] mb-4">
          <span className="text-emerald-400 text-[10px] leading-none">●</span>
          Whale Sentinel
        </div>
        <p className="text-zinc-500 text-sm text-center py-6">
          No whale trades detected yet. Monitoring Polymarket for trades above $5K.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5 font-mono text-[11px] font-semibold text-zinc-500 uppercase tracking-[0.18em]">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          Whale Sentinel
        </div>
        <span className="font-mono text-[10px] text-zinc-600 uppercase tracking-wider">
          Polymarket CLOB
        </span>
      </div>

      <div className="space-y-2">
        {alerts.map((alert, i) => (
          <div
            key={alert.id}
            className={clsx(
              "group flex items-start gap-3 rounded-lg px-3 py-2.5 transition-all hover:bg-white/[0.04]",
              i === 0 && "bg-white/[0.02]",
            )}
          >
            {/* USD badge */}
            <div className="flex-shrink-0 mt-0.5">
              <span
                className={clsx(
                  "inline-flex items-center font-mono text-[11px] font-bold tabular-nums rounded-md px-2 py-1",
                  alert.usd_value >= 50_000
                    ? "text-red-400 bg-red-500/10"
                    : alert.usd_value >= 20_000
                      ? "text-amber-400 bg-amber-500/10"
                      : "text-emerald-400 bg-emerald-500/10",
                )}
              >
                {formatUsd(alert.usd_value)}
              </span>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-zinc-200 leading-snug line-clamp-2">
                {alert.market_title}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={clsx(
                    "font-mono text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded",
                    alert.outcome === "YES"
                      ? "text-emerald-400 bg-emerald-500/10"
                      : alert.outcome === "NO"
                        ? "text-red-400 bg-red-500/10"
                        : "text-zinc-400 bg-white/[0.06]",
                  )}
                >
                  {alert.outcome}
                </span>
                <span className="text-[10px] text-zinc-600 tabular-nums">
                  @ {(alert.price * 100).toFixed(0)}c
                </span>
                <span className="text-[10px] text-zinc-600">
                  {timeAgo(alert.created_at)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
