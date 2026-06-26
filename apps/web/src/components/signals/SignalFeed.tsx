"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { Target } from "lucide-react";
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
      ? signals.filter((s) => s.asset_type !== "prediction")
      : signals.filter((s) => s.asset_type === activeTab);

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-white/[0.08] pb-0 overflow-x-auto scrollbar-none">
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
