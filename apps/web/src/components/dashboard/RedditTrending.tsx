import Link from "next/link";
import { ArrowUp, ArrowDown, Minus, MessageCircle, Flame, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

type SentimentRow = {
  ticker: string;
  mentions: number;
  rank: number | null;
  rank_24h_ago: number | null;
  upvotes: number;
  metadata: { mentions_24h_ago?: number; name?: string } | null;
  captured_at: string;
};

type TrackedTicker = { identifier: string };

async function fetchRedditTrending(): Promise<
  (SentimentRow & { tracked: boolean; upvoteRatio: number; heatingUp: boolean; controversial: boolean })[]
> {
  const supabase = createClient();

  const [sentimentRes, trackedRes] = await Promise.all([
    supabase
      .from("social_sentiment")
      .select("ticker, mentions, rank, rank_24h_ago, upvotes, metadata, captured_at")
      .eq("source", "apewisdom")
      .eq("asset_type", "crypto")
      .order("captured_at", { ascending: false })
      .limit(80),
    supabase
      .from("raw_prices")
      .select("identifier")
      .eq("asset_type", "crypto")
      .order("captured_at", { ascending: false })
      .limit(500),
  ]);

  if (sentimentRes.error || !sentimentRes.data) return [];

  const trackedSet = new Set(
    (trackedRes.data as TrackedTicker[] | null)?.map((r) => r.identifier) ?? [],
  );

  const seen = new Map<string, SentimentRow & { tracked: boolean; upvoteRatio: number; heatingUp: boolean; controversial: boolean }>();
  for (const row of sentimentRes.data as SentimentRow[]) {
    if (!seen.has(row.ticker)) {
      const prev = row.metadata?.mentions_24h_ago;
      const changePct =
        prev && prev > 0
          ? Math.round(((row.mentions - prev) / prev) * 100)
          : null;
      const upvoteRatio = row.mentions > 0 ? row.upvotes / row.mentions : 0;

      seen.set(row.ticker, {
        ...row,
        tracked: trackedSet.has(row.ticker),
        upvoteRatio: Math.round(upvoteRatio * 100) / 100,
        heatingUp: changePct !== null && changePct >= 200,
        controversial: upvoteRatio < 0.3 && row.mentions >= 5,
      });
    }
    if (seen.size >= 20) break;
  }

  return Array.from(seen.values()).sort(
    (a, b) => (a.rank ?? 999) - (b.rank ?? 999),
  );
}

function mentionDelta(row: SentimentRow): { pct: number | null; label: string } {
  const prev = row.metadata?.mentions_24h_ago;
  if (!prev || prev <= 0) return { pct: null, label: "" };
  const pct = Math.round(((row.mentions - prev) / prev) * 100);
  const sign = pct >= 0 ? "+" : "";
  return { pct, label: `${sign}${pct}%` };
}

function rankDelta(row: SentimentRow): number | null {
  if (row.rank == null || row.rank_24h_ago == null) return null;
  return row.rank_24h_ago - row.rank;
}

export default async function RedditTrending() {
  const rows = await fetchRedditTrending();
  if (rows.length === 0) return null;

  return (
    <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-3.5 w-3.5 text-orange-400" />
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-400">
            Reddit Trending
          </span>
        </div>
        <span className="text-[10px] text-zinc-600">via ApeWisdom</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/[0.04]">
              <th className="text-left font-mono text-[10px] uppercase tracking-wider text-zinc-600 px-5 py-2">#</th>
              <th className="text-left font-mono text-[10px] uppercase tracking-wider text-zinc-600 px-3 py-2">Ticker</th>
              <th className="text-right font-mono text-[10px] uppercase tracking-wider text-zinc-600 px-3 py-2">Mentions</th>
              <th className="text-right font-mono text-[10px] uppercase tracking-wider text-zinc-600 px-3 py-2">24h Δ</th>
              <th className="text-right font-mono text-[10px] uppercase tracking-wider text-zinc-600 px-3 py-2">Up/Mention</th>
              <th className="text-right font-mono text-[10px] uppercase tracking-wider text-zinc-600 px-5 py-2">Rank Δ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const delta = mentionDelta(row);
              const rd = rankDelta(row);

              return (
                <tr
                  key={row.ticker}
                  className="border-b border-white/[0.03] hover:bg-white/[0.03] transition-colors"
                >
                  <td className="px-5 py-2.5 text-zinc-600 tabular-nums">
                    {row.rank ?? "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <Link
                        href={`/dashboard/asset/crypto/${row.ticker}`}
                        className="font-mono font-semibold text-white hover:text-emerald-400 transition-colors"
                      >
                        {row.ticker}
                      </Link>
                      {row.tracked ? (
                        <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-400 leading-none">
                          TRACKED
                        </span>
                      ) : (
                        <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-zinc-700/50 text-zinc-500 leading-none">
                          UNTRACKED
                        </span>
                      )}
                      {row.heatingUp && (
                        <Flame className="h-3 w-3 text-orange-400" />
                      )}
                      {row.controversial && (
                        <AlertTriangle className="h-3 w-3 text-yellow-500" />
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-zinc-300">
                    {row.mentions.toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {delta.pct !== null ? (
                      <span
                        className={
                          delta.pct >= 200
                            ? "text-orange-400 font-semibold"
                            : delta.pct > 50
                            ? "text-emerald-400"
                            : delta.pct > 0
                            ? "text-emerald-400/70"
                            : delta.pct < -20
                            ? "text-red-400"
                            : "text-zinc-500"
                        }
                      >
                        {delta.label}
                      </span>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    <span
                      className={
                        row.upvoteRatio >= 1.0
                          ? "text-emerald-400"
                          : row.upvoteRatio >= 0.3
                          ? "text-zinc-400"
                          : "text-yellow-500"
                      }
                    >
                      {row.upvoteRatio.toFixed(1)}
                    </span>
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    {rd !== null ? (
                      <span className="inline-flex items-center gap-0.5">
                        {rd > 0 ? (
                          <ArrowUp className="h-3 w-3 text-emerald-400" />
                        ) : rd < 0 ? (
                          <ArrowDown className="h-3 w-3 text-red-400" />
                        ) : (
                          <Minus className="h-3 w-3 text-zinc-600" />
                        )}
                        <span
                          className={`tabular-nums text-xs ${
                            rd > 0
                              ? "text-emerald-400"
                              : rd < 0
                              ? "text-red-400"
                              : "text-zinc-600"
                          }`}
                        >
                          {Math.abs(rd)}
                        </span>
                      </span>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-5 py-2 border-t border-white/[0.04] text-[9px] text-zinc-600">
        <span className="flex items-center gap-1">
          <Flame className="h-2.5 w-2.5 text-orange-400" /> Heating up (&gt;200% spike)
        </span>
        <span className="flex items-center gap-1">
          <AlertTriangle className="h-2.5 w-2.5 text-yellow-500" /> Controversial (low upvotes)
        </span>
      </div>
    </div>
  );
}
