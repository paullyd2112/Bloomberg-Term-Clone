"use client";

import { useState, useMemo } from "react";
import { clsx } from "clsx";
import { Target, ChevronDown } from "lucide-react";
import SignalCard, { type Signal } from "./SignalCard";

const TABS = [
  { id: "all",        label: "All" },
  { id: "stock",      label: "Stocks" },
  { id: "crypto",     label: "Crypto" },
  { id: "prediction", label: "Predictions" },
] as const;

type Tab = (typeof TABS)[number]["id"];

function getUniqueDays(signals: Signal[]): string[] {
  const days = new Set<string>();
  for (const s of signals) {
    days.add(s.created_at.slice(0, 10));
  }
  return Array.from(days).sort((a, b) => b.localeCompare(a));
}

function formatDayLabel(dateStr: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (dateStr === today) return "Today";
  if (dateStr === yesterday) return "Yesterday";
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export default function SignalFeed({ signals }: { signals: Signal[] }) {
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const [selectedDay, setSelectedDay] = useState<string>("all");

  const typeFiltered = useMemo(() => {
    return activeTab === "all"
      ? signals.filter((s) => s.asset_type !== "prediction")
      : signals.filter((s) => s.asset_type === activeTab);
  }, [signals, activeTab]);

  const days = useMemo(() => getUniqueDays(typeFiltered), [typeFiltered]);

  const filtered = useMemo(() => {
    if (selectedDay === "all") return typeFiltered;
    return typeFiltered.filter((s) => s.created_at.slice(0, 10) === selectedDay);
  }, [typeFiltered, selectedDay]);

  return (
    <div className="space-y-4">
      {/* Asset type tabs + day dropdown */}
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] pb-0 overflow-x-auto scrollbar-none">
        <div className="flex items-center gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px flex-shrink-0",
                activeTab === tab.id
                  ? "border-emerald-500 text-white"
                  : "border-transparent text-zinc-400 hover:text-white",
              )}
            >
              {tab.label}
              {tab.id === "prediction" && (
                <span className="ml-1.5 text-[10px] text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded px-1 py-px">
                  Soon
                </span>
              )}
              {tab.id !== "prediction" && (
                <span className="ml-1.5 text-xs text-zinc-600 tabular-nums">
                  {tab.id === "all"
                    ? signals.filter((s) => s.asset_type !== "prediction").length
                    : signals.filter((s) => s.asset_type === tab.id).length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Day dropdown */}
        <div className="relative flex-shrink-0 mb-1">
          <select
            value={selectedDay}
            onChange={(e) => setSelectedDay(e.target.value)}
            className="appearance-none bg-white/[0.04] border border-white/[0.1] rounded-lg pl-3 pr-8 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-emerald-500/50 cursor-pointer"
          >
            <option value="all">All days ({typeFiltered.length})</option>
            {days.map((day) => {
              const count = typeFiltered.filter((s) => s.created_at.slice(0, 10) === day).length;
              return (
                <option key={day} value={day}>
                  {formatDayLabel(day)} ({count})
                </option>
              );
            })}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
        </div>
      </div>

      {/* Coming Soon overlay for predictions */}
      {activeTab === "prediction" ? (
        <div className="py-20 text-center flex flex-col items-center gap-4">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-700/30 bg-emerald-500/10 text-emerald-400">
            <Target className="h-6 w-6" />
          </span>
          <div>
            <h3 className="text-lg font-semibold text-white tracking-tight">Prediction Markets — Coming Soon</h3>
            <p className="text-sm text-zinc-400 mt-2 max-w-sm mx-auto leading-relaxed">
              AI-powered signals for Kalshi and Polymarket contracts.
              We&apos;re building a live track record before going live.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 text-xs text-zinc-400 bg-white/[0.03] border border-white/[0.08] ring-hairline rounded-full px-4 py-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            Scoring in background — launching soon
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-zinc-500 text-sm">
          No signals for this day yet.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-1 xl:grid-cols-2">
          {filtered.map((signal) => (
            <SignalCard key={signal.id} signal={signal} />
          ))}
        </div>
      )}
    </div>
  );
}
