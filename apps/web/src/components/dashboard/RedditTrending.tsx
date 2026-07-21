import Link from "next/link";
import { ArrowUp, ArrowDown, Minus, MessageCircle } from "lucide-react";
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

async function fetchRedditTrending(): Promise<SentimentRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("social_sentiment")
    .select("ticker, mentions, rank, rank_24h_ago, upvotes, metadata, captured_at")
    .eq("source", "apewisdom")
    .eq("asset_type", "crypto")
    .order("captured_at", { ascending: false })
    .limit(80);

  if (error || !data) return [];

  const seen = new Map<string, SentimentRow>();
  for (const row of data as SentimentRow[]) {
    if (!seen.has(row.ticker)) seen.set(row.ticker, row);
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

export default async function RedditTrending({ bare = false }: { bare?: boolean }) {
  const rows = await fetchRedditTrending();
  if (rows.length === 0) return null;

  const table = (
    <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/[0.04]">
              <th className="text-left font-mono text-[10px] uppercase tracking-wider text-zinc-600 px-5 py-2">#</th>
              <th className="text-left font-mono text-[10px] uppercase tracking-wider text-zinc-600 px-3 py-2">Ticker</th>
              <th className="text-right font-mono text-[10px] uppercase tracking-wider text-zinc-600 px-3 py-2">Mentions</th>
              <th className="text-right font-mono text-[10px] uppercase tracking-wider text-zinc-600 px-3 py-2">24h Δ</th>
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
                    <Link
                      href={`/dashboard/asset/crypto/${row.ticker}`}
                      className="font-mono font-semibold text-white hover:text-emerald-400 transition-colors"
                    >
                      {row.ticker}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-zinc-300">
                    {row.mentions.toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {delta.pct !== null ? (
                      <span
                        className={
                          delta.pct > 50
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
  );

  if (bare) return table;

  return (
    <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-3.5 w-3.5 text-orange-400" />
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-400">
            Reddit Trending
          </span>
        </div>
        <span className="text-[10px] text-zinc-600">via ApeWisdom</span>
      </div>
      {table}
    </div>
  );
}
