"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import type { MarketVertical } from "@/types";
import {
  TrendingUp, Bitcoin, Target,
  Zap, Search, Bell, Settings, ChevronDown, Crown
} from "lucide-react";

const VERTICALS: { id: MarketVertical; label: string; icon: React.ReactNode }[] = [
  { id: "stocks",      label: "Stocks",      icon: <TrendingUp  size={14} /> },
  { id: "crypto",      label: "Crypto",      icon: <Bitcoin     size={14} /> },
  { id: "predictions", label: "Predictions", icon: <Target      size={14} /> },
];

interface TopNavProps {
  onUpgradeClick: () => void;
}

export function TopNav({ onUpgradeClick }: TopNavProps) {
  const { activeVertical, setActiveVertical, subscription, searchQuery, setSearchQuery } = useAppStore();
  const [searchFocused, setSearchFocused] = useState(false);

  return (
    <header className="h-12 flex items-center justify-between px-4 bg-[#0f1117] border-b border-[#1e2433] flex-shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Zap size={16} className="text-[#00d4aa]" fill="currentColor" />
          <span className="text-sm font-bold tracking-tight text-[#e2e8f0]">
            Plebs<span className="text-[#00d4aa]">.io</span>
          </span>
        </div>

        {/* Market vertical tabs */}
        <nav className="flex items-center gap-0.5 ml-4">
          {VERTICALS.map((v) => (
            <button
              key={v.id}
              onClick={() => setActiveVertical(v.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all",
                activeVertical === v.id
                  ? "bg-[#1e2433] text-[#00d4aa]"
                  : "text-[#64748b] hover:text-[#94a3b8] hover:bg-[#141820]"
              )}
            >
              {v.icon}
              {v.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2">
        {/* Search */}
        <div className={cn(
          "flex items-center gap-2 px-2.5 py-1.5 rounded border text-xs transition-all w-48",
          searchFocused
            ? "border-[#00d4aa] bg-[#141820]"
            : "border-[#1e2433] bg-[#141820]"
        )}>
          <Search size={12} className="text-[#64748b] flex-shrink-0" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder="Search ticker, market..."
            className="bg-transparent outline-none text-[#e2e8f0] placeholder-[#64748b] w-full"
          />
        </div>

        {/* Alerts */}
        <button className="p-1.5 rounded text-[#64748b] hover:text-[#e2e8f0] hover:bg-[#1e2433] transition-colors relative">
          <Bell size={14} />
          <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-[#f43f5e]" />
        </button>

        {/* Upgrade CTA or pro badge */}
        {subscription === "free" ? (
          <button
            onClick={onUpgradeClick}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[#00d4aa] text-[#0a0b0d] text-xs font-semibold hover:bg-[#00bfa0] transition-colors"
          >
            <Crown size={11} />
            Go Pro
          </button>
        ) : (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[color-mix(in_srgb,#8b5cf6_20%,transparent)] text-[#8b5cf6] text-xs font-semibold">
            <Crown size={11} />
            Pro
          </div>
        )}

        {/* Settings */}
        <button className="p-1.5 rounded text-[#64748b] hover:text-[#e2e8f0] hover:bg-[#1e2433] transition-colors">
          <Settings size={14} />
        </button>
      </div>
    </header>
  );
}
