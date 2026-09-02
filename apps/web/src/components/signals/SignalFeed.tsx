"use client";

import { useState, useMemo } from "react";
import { clsx } from "clsx";
import { ChevronDown } from "lucide-react";
import SignalList from "./SignalList";
import { type Signal } from "./SignalCard";
import { ChallengeProvider } from "./ChallengeContext";

const TABS = [
  { id: "all",        label: "All" },
  // Crypto-only pivot (July 2026): stock scoring is off, tab hidden so the
  // filter bar doesn't advertise an empty feed. Restore when stocks return.
  // { id: "stock",   label: "Stocks" },
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

export default function SignalFeed({ signals, hideTrade }: { signals: Signal[]; hideTrade?: boolean }) {
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const [selectedDay, setSelectedDay] = useState<string>("all");

  const typeFiltered = useMemo(() => {
    return activeTab === "all"
      ? signals
      : signals.filter((s) => s.asset_type === activeTab);
  }, [signals, activeTab]);

  const days = useMemo(() => getUniqueDays(typeFiltered), [typeFiltered]);

  const filtered = useMemo(() => {
    if (selectedDay === "all") return typeFiltered;
    return typeFiltered.filter((s) => s.created_at.slice(0, 10) === selectedDay);
  }, [typeFiltered, selectedDay]);

  return (
    <ChallengeProvider>
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
              <span className="ml-1.5 text-xs text-zinc-600 tabular-nums">
                {tab.id === "all"
                  ? signals.length
                  : signals.filter((s) => s.asset_type === tab.id).length}
              </span>
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

      {filtered.length === 0 ? (
        <div className="py-16 text-center text-zinc-500 text-sm">
          No signals for this day yet.
        </div>
      ) : (
        <SignalList signals={filtered} hideTrade={hideTrade} />
      )}
    </div>
    </ChallengeProvider>
  );
}
