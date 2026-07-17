"use client";

import { useEffect, useState, useCallback } from "react";
import { Landmark, ExternalLink, RefreshCw } from "lucide-react";

type Catalyst = {
  id?: number;
  bill_title: string;
  bill_url: string;
  description: string;
  feed_type: string;
  crypto_relevance: string;
  macro_sentiment: string;
  ai_summary: string;
  published_at: string;
  classified_at: string;
};

const RELEVANCE_STYLES: Record<string, string> = {
  high: "bg-amber-500/10 text-amber-400 border-amber-700/30",
  medium: "bg-blue-500/10 text-blue-400 border-blue-700/30",
  low: "bg-zinc-500/10 text-zinc-400 border-zinc-700/30",
  none: "bg-zinc-800/50 text-zinc-600 border-zinc-700/20",
  unknown: "bg-zinc-800/50 text-zinc-600 border-zinc-700/20",
};

const SENTIMENT_STYLES: Record<string, { label: string; cls: string }> = {
  bullish: { label: "Bullish", cls: "text-emerald-400" },
  bearish: { label: "Bearish", cls: "text-red-400" },
  neutral: { label: "Neutral", cls: "text-zinc-500" },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hrs = Math.floor(diff / 3_600_000);
  if (hrs < 1) return "< 1h ago";
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function LegislativeCatalysts() {
  const [catalysts, setCatalysts] = useState<Catalyst[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchCatalysts = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await fetch("/api/legislative-catalysts");
      if (res.ok) {
        const data = await res.json();
        setCatalysts(data);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchCatalysts();
    const interval = setInterval(() => fetchCatalysts(), 120_000);
    return () => clearInterval(interval);
  }, [fetchCatalysts]);

  return (
    <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-purple-700/30 bg-purple-500/10">
            <Landmark className="h-4 w-4 text-purple-400" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-white">Legislative Catalysts</h3>
            <p className="text-[10px] text-zinc-500">AI-parsed crypto &amp; macro bills</p>
          </div>
        </div>
        <button
          onClick={() => fetchCatalysts(true)}
          disabled={refreshing}
          className="p-1.5 rounded-md hover:bg-white/[0.06] transition-colors disabled:opacity-40"
        >
          <RefreshCw className={`h-3.5 w-3.5 text-zinc-500 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="max-h-[400px] overflow-y-auto scrollbar-none">
        {loading ? (
          <div className="space-y-0">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="px-5 py-4 border-b border-white/[0.04] animate-pulse">
                <div className="h-3.5 w-4/5 bg-white/[0.06] rounded mb-2" />
                <div className="h-3 w-2/3 bg-white/[0.04] rounded mb-2" />
                <div className="h-2.5 w-1/4 bg-white/[0.04] rounded" />
              </div>
            ))}
          </div>
        ) : catalysts.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <Landmark className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
            <p className="text-xs text-zinc-500">No relevant legislation detected</p>
            <p className="text-[10px] text-zinc-600 mt-1">Scanning Congress.gov every 4 hours</p>
          </div>
        ) : (
          catalysts.map((cat, idx) => {
            const sentiment = SENTIMENT_STYLES[cat.macro_sentiment] ?? SENTIMENT_STYLES.neutral;
            const relevanceCls = RELEVANCE_STYLES[cat.crypto_relevance] ?? RELEVANCE_STYLES.unknown;
            return (
              <div
                key={cat.id ?? idx}
                className="group px-5 py-4 border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.03] transition-colors animate-in fade-in slide-in-from-top-1 duration-300"
                style={{ animationDelay: `${idx * 60}ms` }}
              >
                <div className="flex items-start justify-between gap-2">
                  <a
                    href={cat.bill_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-zinc-300 leading-relaxed line-clamp-2 hover:text-white transition-colors flex-1"
                  >
                    {cat.bill_title}
                    <ExternalLink className="inline h-2.5 w-2.5 ml-1 opacity-0 group-hover:opacity-50 transition-opacity" />
                  </a>
                </div>

                {cat.ai_summary && (
                  <p className="text-[11px] text-zinc-500 mt-1.5 leading-relaxed">
                    {cat.ai_summary}
                  </p>
                )}

                <div className="flex items-center gap-2 mt-2">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${relevanceCls}`}>
                    {cat.crypto_relevance.toUpperCase()}
                  </span>
                  <span className={`text-[10px] font-medium ${sentiment.cls}`}>
                    {sentiment.label}
                  </span>
                  <span className="text-[10px] text-zinc-600 capitalize">
                    {cat.feed_type}
                  </span>
                  <span className="text-[10px] text-zinc-700 ml-auto">
                    {timeAgo(cat.published_at)}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
