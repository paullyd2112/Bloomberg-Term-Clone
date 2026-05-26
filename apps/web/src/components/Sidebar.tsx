"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import type { Tier } from "@/lib/tier";

const NAV: {
  href: string;
  label: string;
  icon: string;
  tier?: "pro" | "elite";
}[] = [
  { href: "/dashboard",            label: "Signals",       icon: "⚡" },
  { href: "/dashboard/watchlist",  label: "Watchlist",     icon: "★" },
  { href: "/dashboard/portfolio",  label: "Portfolio",     icon: "◈",  tier: "pro" },
  { href: "/dashboard/alerts",     label: "Alerts",        icon: "🔔", tier: "pro" },
  { href: "/dashboard/congress",   label: "Congress",      icon: "🏛" },
  { href: "/dashboard/calendar",   label: "Econ Calendar", icon: "📅" },
  { href: "/dashboard/briefing",   label: "Morning Brief", icon: "☀" },
  { href: "/dashboard/backtest",    label: "Backtester",    icon: "📊", tier: "pro" },
  { href: "/dashboard/referrals",  label: "Referrals",     icon: "🎁" },
  { href: "/dashboard/pleby",      label: "Pleby AI",      icon: "🤖", tier: "elite" },
];

export default function Sidebar({ tier, billingInterval }: { tier: Tier; billingInterval?: string | null }) {
  const pathname = usePathname();
  const displayLabel = billingInterval === "lifetime" ? "Lifetime Pro" : `${tier} plan`;

  return (
    <aside className="hidden lg:flex w-52 flex-shrink-0 bg-zinc-950 border-r border-zinc-800 flex-col">
      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b border-zinc-800">
        <span className="font-bold text-white tracking-tight">
          plebs<span className="text-green-400">.io</span>
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 space-y-0.5 overflow-y-auto">
        {NAV.map(({ href, label, icon, tier: requiredTier }) => {
          const locked =
            requiredTier === "elite"
              ? tier !== "elite"
              : requiredTier === "pro"
              ? tier === "free"
              : false;

          const active =
            href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={locked ? "/dashboard/upgrade" : href}
              className={clsx(
                "flex items-center gap-3 px-4 py-2.5 mx-1.5 rounded-md text-sm transition-colors",
                active
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800/50",
                locked && "opacity-50",
              )}
            >
              <span className="text-base flex-shrink-0">{icon}</span>
              <span className="truncate">{label}</span>
              {locked && (
                <span className="ml-auto text-[10px] text-zinc-500 uppercase tracking-wide">
                  {requiredTier}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Tier badge */}
      <div className="p-3 border-t border-zinc-800">
        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-500 capitalize">{displayLabel}</span>
          {tier === "free" && (
            <Link
              href="/dashboard/upgrade"
              className="text-xs text-green-400 hover:text-green-300 font-medium"
            >
              Upgrade →
            </Link>
          )}
        </div>
      </div>
    </aside>
  );
}
