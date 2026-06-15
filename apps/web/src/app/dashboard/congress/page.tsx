"use client";

import { useEffect, useState, useTransition } from "react";
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
  party:       "all" | "D" | "R" | "I";
  transaction: "all" | "buy" | "sell";
  search:      string;
};

const PARTY_LABEL: Record<string, { label: string; cls: string }> = {
  D:          { label: "D", cls: "bg-blue-500/15 text-blue-400 border-blue-700" },
  Democrat:   { label: "D", cls: "bg-blue-500/15 text-blue-400 border-blue-700" },
  R:          { label: "R", cls: "bg-red-500/15 text-red-400 border-red-700" },
  Republican: { label: "R", cls: "bg-red-500/15 text-red-400 border-red-700" },
  I:          { label: "I", cls: "bg-zinc-600/40 text-zinc-400 border-zinc-500" },
};

function partyKey(party: string): string {
  const p = party.trim();
  if (p === "D" || p.toLowerCase().startsWith("dem")) return "D";
  if (p === "R" || p.toLowerCase().startsWith("rep")) return "R";
  return "I";
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
  const [filter, setFilter]       = useState<Filter>({ party: "all", transaction: "all", search: "" });
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
    if (filter.party !== "all" && partyKey(t.party) !== filter.party) return false;
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
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white">Congress Tracker</h1>
        <p className="text-zinc-500 text-sm mt-1">
          STOCK Act disclosures — House &amp; Senate trades
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 sm:grid-cols-3 gap-3">
        {[
          { label: "Total trades",  value: filtered.length, cls: "text-white" },
          { label: "Buys",          value: buys,            cls: "text-green-400" },
          { label: "Sells",         value: sells,           cls: "text-red-400" },
        ].map(({ label, value, cls }) => (
          <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <div className={`text-2xl font-bold ${cls}`}>{value}</div>
            <div className="text-zinc-500 text-xs mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        {/* Search */}
        <input
          type="text"
          placeholder="Search ticker or name…"
          value={filter.search}
          onChange={(e) =>
            startTransition(() => setFilter((f) => ({ ...f, search: e.target.value })))
          }
          className="bg-zinc-900 border border-zinc-700 rounded-md px-3 py-1.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 w-full sm:w-52"
        />

        {/* Party filter */}
        <div className="flex rounded-md overflow-hidden border border-zinc-700">
          {(["all", "D", "R", "I"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setFilter((f) => ({ ...f, party: p }))}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                filter.party === p
                  ? "bg-zinc-700 text-white"
                  : "bg-zinc-900 text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {p === "all" ? "All" : p === "D" ? "Dem" : p === "R" ? "Rep" : "Ind"}
            </button>
          ))}
        </div>

        {/* Transaction filter */}
        <div className="flex rounded-md overflow-hidden border border-zinc-700">
          {(["all", "buy", "sell"] as const).map((tx) => (
            <button
              key={tx}
              onClick={() => setFilter((f) => ({ ...f, transaction: tx }))}
              className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                filter.transaction === tx
                  ? "bg-zinc-700 text-white"
                  : "bg-zinc-900 text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {tx === "all" ? "All" : tx}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
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
                <tr className="border-b border-zinc-800">
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
                  const pk    = partyKey(t.party);
                  const pInfo = PARTY_LABEL[pk] ?? PARTY_LABEL["I"];
                  const delay = reportingDelay(t.trade_date, t.report_date);
                  const delayNum = delay ? parseInt(delay) : null;

                  return (
                    <tr
                      key={t.id}
                      className="border-b border-zinc-800/60 hover:bg-zinc-800/40 transition-colors"
                    >
                      {/* Politician */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center border rounded px-1.5 py-0.5 text-[10px] font-bold ${pInfo.cls}`}
                          >
                            {pInfo.label}
                          </span>
                          <span className="text-zinc-200 font-medium truncate max-w-[160px]">
                            {t.politician || "—"}
                          </span>
                        </div>
                      </td>

                      {/* Ticker */}
                      <td className="px-4 py-3">
                        <a
                          href={`/dashboard/asset/stock/${encodeURIComponent(t.ticker)}`}
                          className="font-mono font-bold text-white hover:text-green-400 transition-colors"
                        >
                          {t.ticker}
                        </a>
                      </td>

                      {/* Transaction */}
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center border rounded px-2 py-0.5 text-xs font-bold ${
                            t.transaction === "buy"
                              ? "bg-green-500/10 text-green-400 border-green-700"
                              : "bg-red-500/10 text-red-400 border-red-700"
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
        Source: Quiver Quant · STOCK Act disclosures · Last 90 days ·{" "}
        <span className="text-amber-500/70">Delays &gt;30 days highlighted</span>
      </p>
    </div>
  );
}
