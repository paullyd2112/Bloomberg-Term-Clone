"use client";

import { useState } from "react";
import { clsx } from "clsx";
import SignalCard, { type Signal } from "./SignalCard";

const TABS = [
  { id: "all",        label: "All" },
  { id: "stock",      label: "Stocks" },
  { id: "crypto",     label: "Crypto" },
  { id: "prediction", label: "Predictions" },
] as const;

type Tab = (typeof TABS)[number]["id"];

export default function SignalFeed({ signals }: { signals: Signal[] }) {
  const [activeTab, setActiveTab] = useState<Tab>("all");

  const filtered =
    activeTab === "all"
      ? signals
      : signals.filter((s) => s.asset_type === activeTab);

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-zinc-800 pb-0 overflow-x-auto scrollbar-none">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px flex-shrink-0",
              activeTab === tab.id
                ? "border-green-500 text-white"
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

      {/* Feed */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center text-zinc-500 text-sm">
          No signals yet — check back soon.
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
