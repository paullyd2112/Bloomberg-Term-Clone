"use client";

import { useState, useEffect, type ReactNode } from "react";
import { clsx } from "clsx";
import { TrendingUp, Fish, MessageCircle } from "lucide-react";

const TABS = [
  { id: "movers",  label: "Movers",  icon: TrendingUp },
  { id: "whales",  label: "Whales",  icon: Fish },
  { id: "reddit",  label: "Reddit",  icon: MessageCircle },
] as const;

type TabId = (typeof TABS)[number]["id"];

const STORAGE_KEY_TAB = "mp-tab";
const STORAGE_KEY_COLLAPSED = "mp-collapsed";

function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const v = localStorage.getItem(key);
    return v !== null ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

export default function MarketPulse({
  moversContent,
  whalesContent,
  redditContent,
}: {
  moversContent: ReactNode;
  whalesContent: ReactNode;
  redditContent: ReactNode;
}) {
  const contentMap: Record<TabId, ReactNode> = {
    movers: moversContent,
    whales: whalesContent,
    reddit: redditContent,
  };

  const availableTabs = TABS.filter((tab) => contentMap[tab.id] != null);
  const defaultTab = availableTabs.length > 0 ? availableTabs[0].id : "whales";

  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const stored = readStorage<TabId>(STORAGE_KEY_TAB, defaultTab);
    return contentMap[stored] != null ? stored : defaultTab;
  });
  const [collapsed, setCollapsed] = useState(() => readStorage(STORAGE_KEY_COLLAPSED, false));
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    if (!localStorage.getItem(STORAGE_KEY_COLLAPSED)) {
      const mql = window.matchMedia("(max-width: 639px)");
      if (mql.matches) setCollapsed(true);
    }
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY_TAB, JSON.stringify(activeTab)); } catch {}
  }, [activeTab]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY_COLLAPSED, JSON.stringify(collapsed)); } catch {}
  }, [collapsed]);

  const isOpen = hydrated ? !collapsed : true;

  if (availableTabs.length === 0) return null;

  return (
    <section className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl overflow-hidden">
      {/* Header bar with tabs */}
      <div className="flex items-center gap-0 border-b border-white/[0.06]">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-2 px-4 py-3 hover:bg-white/[0.02] transition-colors flex-shrink-0"
          aria-label={collapsed ? "Expand market pulse" : "Collapse market pulse"}
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          <span className="font-mono text-[11px] font-semibold text-zinc-400 uppercase tracking-[0.15em]">
            Market Pulse
          </span>
          <svg
            className={clsx("h-3.5 w-3.5 text-zinc-600 transition-transform", collapsed && "-rotate-90")}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isOpen && (
          <div className="flex items-center gap-0.5 ml-auto pr-2">
            {availableTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={clsx(
                    "flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-medium transition-colors",
                    activeTab === tab.id
                      ? "bg-white/[0.06] text-white"
                      : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]",
                  )}
                >
                  <Icon className={clsx(
                    "h-3 w-3",
                    activeTab === tab.id ? "text-emerald-400" : "text-zinc-600",
                  )} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Tab content — only active tab is mounted */}
      {isOpen && (
        <div className="p-4">
          {contentMap[activeTab]}
        </div>
      )}
    </section>
  );
}
