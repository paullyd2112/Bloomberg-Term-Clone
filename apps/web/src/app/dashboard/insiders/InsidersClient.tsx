"use client";

import { useEffect, useState, useTransition } from "react";
import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type InsiderTrade = {
  id:            number;
  insider_name:  string;
  insider_title: string;
  ticker:        string;
  transaction:   "buy" | "sell";
  shares:        number | null;
  price:         number | null;
  value_usd:     number | null;
  trade_date:    string;
  report_date:   string | null;
  created_at:    string;
};

type Filter = {
  transaction: "all" | "buy" | "sell";
  search:      string;
};

function fmtValue(v: number | null): string {
  if (v == null) return "—";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function fmtShares(s: number | null): string {
  if (s == null) return "—";
  return s.toLocaleString();
}

function shortTitle(title: string): string {
  if (!title) return "—";
  // "officer: CEO" → "CEO", "director" → "Director"
  const parts = title.split(":");
  const t = (parts.length > 1 ? parts[1] : parts[0]).trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export default function InsidersClient() {
  const [trades, setTrades]   = useState<InsiderTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState<Filter>({ transaction: "all", search: "" });
  const [, startTransition]   = useTransition();

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("insider_trades")
      .select("*")
      .order("trade_date", { ascending: false })
      .limit(500)
      .then(({ data }) => {
        setTrades((data as InsiderTrade[]) ?? []);
        setLoading(false);
      });
  }, []);

  const filtered = trades.filter((t) => {
    if (filter.transaction !== "all" && t.transaction !== filter.transaction) return false;
    if (filter.search) {
      const q = filter.search.toUpperCase();
      if (!t.ticker.includes(q) && !t.insider_name.toUpperCase().includes(q)) return false;
    }
    return true;
  });

  const buys  = filtered.filter((t) => t.transaction === "buy").length;
  const sells = filtered.filter((t) => t.transaction === "sell").length;

  return (
    <div className="p-5 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-700/30 bg-emerald-500/10 text-emerald-400">
            <Users className="h-4 w-4" />
          </span>
          <h1 className="text-xl font-semibold tracking-tight text-white">Insider Trades</h1>
        </div>
        <p className="text-zinc-500 text-sm">
          SEC Form 4 — officer &amp; director buys and sells (filed within 2 days).
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total trades", value: filtered.length, cls: "text-white" },
          { label: "Buys",         value: buys,            cls: "text-emerald-400" },
          { label: "Sells",        value: sells,           cls: "text-red-400" },
        ].map(({ label, value, cls }) => (
          <div key={label} className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl p-4 hover:bg-white/[0.05] hover:border-white/[0.1] transition-all">
            <div className={`text-2xl font-bold tabular-nums ${cls}`}>{value}</div>
            <div className="text-zinc-500 text-xs mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search ticker or name…"
          value={filter.search}
          onChange={(e) =>
            startTransition(() => setFilter((f) => ({ ...f, search: e.target.value })))
          }
          className="bg-white/[0.04] border border-white/[0.1] rounded-lg px-3 py-1.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 w-full sm:w-52"
        />

        <div className="flex rounded-lg overflow-hidden border border-white/[0.1]">
          {(["all", "buy", "sell"] as const).map((tx) => (
            <button
              key={tx}
              onClick={() => setFilter((f) => ({ ...f, transaction: tx }))}
              className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                filter.transaction === tx
                  ? "bg-white/[0.1] text-white"
                  : "bg-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {tx === "all" ? "All" : tx}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-zinc-500 text-sm">Loading trades…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-zinc-500 text-sm">
            No trades match your filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.08]">
                  {["Insider", "Title", "Ticker", "Type", "Shares", "Value", "Trade Date", "Filed"].map(
                    (h) => (
                      <th
                        key={h}
                        className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr
                    key={t.id}
                    className="border-b border-white/[0.06] hover:bg-white/[0.04] transition-colors"
                  >
                    {/* Insider */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-zinc-200 font-medium truncate max-w-[180px] inline-block">
                        {t.insider_name || "—"}
                      </span>
                    </td>

                    {/* Title */}
                    <td className="px-4 py-3 text-zinc-400 text-xs whitespace-nowrap">
                      {shortTitle(t.insider_title)}
                    </td>

                    {/* Ticker */}
                    <td className="px-4 py-3">
                      <a
                        href={`/dashboard/asset/stock/${encodeURIComponent(t.ticker)}`}
                        className="font-mono font-bold text-white hover:text-emerald-400 transition-colors"
                      >
                        {t.ticker}
                      </a>
                    </td>

                    {/* Transaction */}
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center border rounded px-2 py-0.5 text-xs font-bold ${
                          t.transaction === "buy"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-700/30"
                            : "bg-red-500/10 text-red-400 border-red-700/30"
                        }`}
                      >
                        {t.transaction === "buy" ? "BUY" : "SELL"}
                      </span>
                    </td>

                    {/* Shares */}
                    <td className="px-4 py-3 text-zinc-400 text-xs whitespace-nowrap tabular-nums">
                      {fmtShares(t.shares)}
                    </td>

                    {/* Value */}
                    <td className="px-4 py-3 text-zinc-300 text-xs whitespace-nowrap tabular-nums font-medium">
                      {fmtValue(t.value_usd)}
                    </td>

                    {/* Trade date */}
                    <td className="px-4 py-3 text-zinc-400 text-xs whitespace-nowrap">
                      {t.trade_date}
                    </td>

                    {/* Filed date */}
                    <td className="px-4 py-3 text-zinc-400 text-xs whitespace-nowrap">
                      {t.report_date ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer note */}
      <p className="text-zinc-600 text-xs">
        Source: SEC Form 4 disclosures via FMP · Last 60 days · Officers &amp; directors must file within 2 business days
      </p>
    </div>
  );
}
