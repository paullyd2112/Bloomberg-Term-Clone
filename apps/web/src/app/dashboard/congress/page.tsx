"use client";

import { useEffect, useState, useTransition } from "react";
import { Landmark, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type CongressTrade = {
  id:           number;
  politician:   string;
  party:        string;
  ticker:       string;
  transaction:  "buy" | "sell";
  amount_range: string;
  trade_date:   string;
  report_date:  string | null;
  created_at:   string;
};

type Filter = {
  transaction: "all" | "buy" | "sell";
  search:      string;
};

const PARTY_LABEL: Record<string, { label: string; cls: string }> = {
  D:          { label: "D", cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  Democrat:   { label: "D", cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  R:          { label: "R", cls: "bg-red-500/15 text-red-400 border-red-500/30" },
  Republican: { label: "R", cls: "bg-red-500/15 text-red-400 border-red-500/30" },
  I:          { label: "I", cls: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" },
};

function partyBadge(party: string): { label: string; cls: string } {
  const p = party.trim();
  if (p === "D" || p.toLowerCase().startsWith("dem")) return PARTY_LABEL["D"];
  if (p === "R" || p.toLowerCase().startsWith("rep")) return PARTY_LABEL["R"];
  return PARTY_LABEL["I"];
}

function reportingDelay(tradeDate: string, reportDate: string | null): string | null {
  if (!reportDate) return null;
  const diff = Math.round(
    (new Date(reportDate).getTime() - new Date(tradeDate).getTime()) / 86_400_000,
  );
  if (diff < 0) return null;
  return `${diff}d`;
}

export default function CongressPage() {
  const [trades, setTrades]       = useState<CongressTrade[]>([]);
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState<Filter>({ transaction: "all", search: "" });
  const [, startTransition]       = useTransition();

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("congressional_trades")
      .select("*")
      .order("trade_date", { ascending: false })
      .limit(500)
      .then(({ data }) => {
        setTrades((data as CongressTrade[]) ?? []);
        setLoading(false);
      });
  }, []);

  const filtered = trades.filter((t) => {
    if (filter.transaction !== "all" && t.transaction !== filter.transaction) return false;
    if (filter.search) {
      const q = filter.search.toUpperCase();
      if (!t.ticker.includes(q) && !t.politician.toUpperCase().includes(q)) return false;
    }
    return true;
  });

  const buys  = filtered.filter((t) => t.transaction === "buy").length;
  const sells = filtered.filter((t) => t.transaction === "sell").length;

  return (
    <div className="p-5 md:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-700/30 bg-emerald-500/10 text-emerald-400">
            <Landmark className="h-4 w-4" />
          </span>
          <h1 className="text-xl font-semibold tracking-tight text-white">Congress Tracker</h1>
        </div>
        <p className="text-zinc-500 text-sm">
          STOCK Act disclosures — House &amp; Senate trades.
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
        {/* Search */}
        <div className="relative w-full sm:w-52">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
          <input
            type="text"
            placeholder="Search ticker or name…"
            value={filter.search}
            onChange={(e) =>
              startTransition(() => setFilter((f) => ({ ...f, search: e.target.value })))
            }
            className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg pl-8 pr-3 py-1.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500/40 focus:bg-white/[0.05] transition-colors"
          />
        </div>

        {/* Transaction filter */}
        <div className="flex rounded-lg overflow-hidden border border-white/[0.08]">
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
                  {["Politician", "Ticker", "Type", "Amount", "Trade Date", "Report Date", "Delay"].map(
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
                {filtered.map((t) => {
                  const pInfo = partyBadge(t.party);
                  const delay = reportingDelay(t.trade_date, t.report_date);
                  const delayNum = delay ? parseInt(delay) : null;

                  return (
                    <tr
                      key={t.id}
                      className="border-b border-white/[0.06] last:border-0 hover:bg-white/[0.04] transition-colors"
                    >
                      {/* Politician */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {t.party && (
                            <span
                              className={`inline-flex items-center border rounded px-1.5 py-0.5 text-[10px] font-bold ${pInfo.cls}`}
                            >
                              {pInfo.label}
                            </span>
                          )}
                          <span className="text-zinc-200 font-medium truncate max-w-[180px]">
                            {t.politician || "—"}
                          </span>
                        </div>
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

                      {/* Amount */}
                      <td className="px-4 py-3 text-zinc-400 text-xs whitespace-nowrap">
                        {t.amount_range || "—"}
                      </td>

                      {/* Trade date */}
                      <td className="px-4 py-3 text-zinc-400 text-xs whitespace-nowrap">
                        {t.trade_date}
                      </td>

                      {/* Report date */}
                      <td className="px-4 py-3 text-zinc-400 text-xs whitespace-nowrap">
                        {t.report_date ?? "—"}
                      </td>

                      {/* Delay */}
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        {delay ? (
                          <span
                            className={
                              delayNum !== null && delayNum > 30
                                ? "text-amber-400"
                                : "text-zinc-500"
                            }
                          >
                            {delay}
                          </span>
                        ) : (
                          <span className="text-zinc-700">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer note */}
      <p className="text-zinc-600 text-xs">
        Source: Senate EFD (efdsearch.senate.gov) · STOCK Act disclosures · Last 90 days ·{" "}
        <span className="text-amber-500/70">Delays &gt;30 days highlighted</span>
      </p>
    </div>
  );
}
