"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type MacroEvent = {
  id:         number;
  event_date: string;
  event_time: string | null;
  event_name: string;
  category:   string;
  importance: string;
  forecast:   string | null;
  previous:   string | null;
  actual:     string | null;
  notes:      string | null;
};

type EarningsEvent = {
  id:              number;
  ticker:          string;
  report_date:     string;
  report_time:     string | null;
  consensus_eps:   number | null;
  last_quarter_eps:number | null;
};

type DayGroup = {
  date:     string;
  label:    string;
  macro:    MacroEvent[];
  earnings: EarningsEvent[];
};

const IMPORTANCE_STYLES: Record<string, string> = {
  high:   "bg-red-500/15 text-red-400 border-red-700/40",
  medium: "bg-amber-500/15 text-amber-400 border-amber-700/40",
  low:    "bg-white/[0.06] text-zinc-400 border-white/[0.1]",
};

const CATEGORY_STYLES: Record<string, string> = {
  fed:        "bg-amber-500/15 text-amber-400 border-amber-700/40",
  inflation:  "bg-orange-500/15 text-orange-400 border-orange-700/40",
  employment: "bg-blue-500/15 text-blue-400 border-blue-700/40",
  gdp:        "bg-emerald-500/15 text-emerald-400 border-emerald-700/40",
  consumer:   "bg-cyan-500/15 text-cyan-400 border-cyan-700/40",
  earnings:   "bg-white/[0.06] text-zinc-300 border-white/[0.1]",
  other:      "bg-white/[0.06] text-zinc-400 border-white/[0.1]",
};

const CATEGORY_LABELS: Record<string, string> = {
  fed:        "Fed",
  inflation:  "Inflation",
  employment: "Jobs",
  gdp:        "GDP",
  consumer:   "Consumer",
  earnings:   "Earnings",
  other:      "Other",
};

function formatDate(dateStr: string): { label: string; isToday: boolean; isTomorrow: boolean } {
  const d     = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const isToday    = d.getTime() === today.getTime();
  const isTomorrow = d.getTime() === tomorrow.getTime();

  const label = isToday
    ? "Today"
    : isTomorrow
    ? "Tomorrow"
    : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  return { label, isToday, isTomorrow };
}

function groupByDate(macro: MacroEvent[], earnings: EarningsEvent[]): DayGroup[] {
  const map = new Map<string, DayGroup>();

  for (const e of macro) {
    if (!map.has(e.event_date)) {
      const { label } = formatDate(e.event_date);
      map.set(e.event_date, { date: e.event_date, label, macro: [], earnings: [] });
    }
    map.get(e.event_date)!.macro.push(e);
  }

  for (const e of earnings) {
    if (!map.has(e.report_date)) {
      const { label } = formatDate(e.report_date);
      map.set(e.report_date, { date: e.report_date, label, macro: [], earnings: [] });
    }
    map.get(e.report_date)!.earnings.push(e);
  }

  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export default function CalendarPage() {
  const [macro,    setMacro]    = useState<MacroEvent[]>([]);
  const [earnings, setEarnings] = useState<EarningsEvent[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState<"all" | "high" | "fed" | "earnings">("all");

  useEffect(() => {
    const supabase = createClient();
    const today    = new Date().toISOString().split("T")[0];
    const cutoff   = new Date(Date.now() + 30 * 86_400_000).toISOString().split("T")[0];

    Promise.all([
      supabase
        .from("macro_events")
        .select("*")
        .gte("event_date", today)
        .lte("event_date", cutoff)
        .order("event_date")
        .order("event_time"),
      supabase
        .from("earnings_events")
        .select("*")
        .gte("report_date", today)
        .lte("report_date", cutoff)
        .order("report_date"),
    ]).then(([macroRes, earningsRes]) => {
      setMacro(macroRes.data    ?? []);
      setEarnings(earningsRes.data ?? []);
      setLoading(false);
    });
  }, []);

  const filteredMacro = macro.filter((e) => {
    if (filter === "high")    return e.importance === "high";
    if (filter === "fed")     return e.category === "fed";
    if (filter === "earnings") return false;
    return true;
  });

  const filteredEarnings = filter === "fed" ? [] : earnings;

  const groups = groupByDate(filteredMacro, filteredEarnings);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 md:py-10">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-white">Economic Calendar</h1>
        <p className="text-zinc-500 text-sm">Next 30 days: macro events and earnings.</p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {(["all", "high", "fed", "earnings"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f
                ? "bg-emerald-500 text-black"
                : "bg-white/[0.03] border border-white/[0.1] text-zinc-400 hover:text-white hover:bg-white/[0.06]"
            }`}
          >
            {f === "all" ? "All events" : f === "high" ? "High impact" : f === "fed" ? "Fed" : "Earnings"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 bg-white/[0.03] border border-white/[0.06] rounded-xl animate-pulse" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="text-center py-20 text-zinc-600">No events in the next 30 days</div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => {
            const { isToday, isTomorrow } = formatDate(group.date);
            return (
              <div key={group.date}>
                {/* Date header */}
                <div className="flex items-center gap-3 mb-3">
                  <span
                    className={`text-sm font-bold ${
                      isToday ? "text-emerald-400" : isTomorrow ? "text-white" : "text-zinc-500"
                    }`}
                  >
                    {group.label}
                  </span>
                  <div className="flex-1 h-px bg-white/[0.08]" />
                </div>

                <div className="space-y-2">
                  {/* Macro events */}
                  {group.macro.map((event) => (
                    <div
                      key={event.id}
                      className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl p-4 flex items-start justify-between gap-4 hover:bg-white/[0.05] hover:border-white/[0.1] transition-all"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <span
                          className={`mt-0.5 flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-md border ${
                            CATEGORY_STYLES[event.category] ?? CATEGORY_STYLES.other
                          }`}
                        >
                          {CATEGORY_LABELS[event.category] ?? event.category}
                        </span>
                        <div className="min-w-0">
                          <div className="text-white font-medium text-sm truncate">{event.event_name}</div>
                          {event.event_time && (
                            <div className="text-zinc-500 text-xs mt-0.5">{event.event_time}</div>
                          )}
                          {(event.forecast || event.previous) && (
                            <div className="flex gap-3 mt-1.5 text-xs text-zinc-500">
                              {event.forecast && <span>Forecast: <span className="text-zinc-300">{event.forecast}</span></span>}
                              {event.previous && <span>Prev: <span className="text-zinc-300">{event.previous}</span></span>}
                            </div>
                          )}
                          {event.actual && (
                            <div className="mt-1.5 text-xs font-semibold text-emerald-400">
                              Actual: {event.actual}
                            </div>
                          )}
                        </div>
                      </div>
                      <span
                        className={`flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-md border ${
                          IMPORTANCE_STYLES[event.importance] ?? IMPORTANCE_STYLES.medium
                        }`}
                      >
                        {event.importance.toUpperCase()}
                      </span>
                    </div>
                  ))}

                  {/* Earnings */}
                  {group.earnings.map((e) => (
                    <div
                      key={e.id}
                      className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl p-4 flex items-start justify-between gap-4 hover:bg-white/[0.05] hover:border-white/[0.1] transition-all"
                    >
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-md border bg-white/[0.06] text-zinc-300 border-white/[0.1]">
                          Earnings
                        </span>
                        <div>
                          <div className="text-white font-mono font-semibold text-sm">{e.ticker}</div>
                          {e.report_time && (
                            <div className="text-zinc-500 text-xs mt-0.5">
                              {e.report_time === "before_market" ? "Before market open" : "After market close"}
                            </div>
                          )}
                          {e.consensus_eps != null && (
                            <div className="flex gap-3 mt-1.5 text-xs text-zinc-500">
                              <span>EPS est: <span className="text-zinc-300">${e.consensus_eps.toFixed(2)}</span></span>
                              {e.last_quarter_eps != null && (
                                <span>Last qtr: <span className="text-zinc-300">${e.last_quarter_eps.toFixed(2)}</span></span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <span className="flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-md border bg-amber-500/15 text-amber-400 border-amber-700/40">
                        MEDIUM
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
