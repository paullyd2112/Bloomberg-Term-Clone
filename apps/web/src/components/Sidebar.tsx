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
  { href: "/dashboard/screener",   label: "Screener",      icon: "🔎", tier: "pro" },
  { href: "/dashboard/watchlist",  label: "Watchlist",     icon: "★" },
  { href: "/dashboard/portfolio",  label: "Portfolio",     icon: "◈",  tier: "pro" },
  { href: "/dashboard/performance", label: "Performance",  icon: "📈", tier: "pro" },
  { href: "/dashboard/history",     label: "Trade History", icon: "📋", tier: "pro" },
  { href: "/dashboard/alerts",     label: "Alerts",        icon: "🔔", tier: "pro" },
  { href: "/dashboard/congress",   label: "Congress",      icon: "🏛" },
  { href: "/dashboard/insiders",   label: "Insiders",      icon: "🕵" },
  { href: "/dashboard/referrals",  label: "Referrals",     icon: "🎁" },
  { href: "/dashboard/allocator",  label: "Allocator",     icon: "◈",  tier: "elite" },
  { href: "/dashboard/pleby",      label: "Pleby AI",      icon: "🤖", tier: "elite" },
];

export default function Sidebar({ tier, billingInterval }: { tier: Tier; billingInterval?: string | null }) {
  const pathname = usePathname();
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const displayLabel = billingInterval === "lifetime"
    ? `Lifetime ${capitalize(tier)}`
    : `${capitalize(tier)} plan`;

  return (
    <aside className="hidden lg:flex w-56 flex-shrink-0 bg-black/40 backdrop-blur-xl border-r border-white/[0.06] flex-col">
      {/* Logo */}
      <div className="h-14 flex items-center px-5 border-b border-white/[0.06]">
        <span className="text-lg font-semibold tracking-tight text-white">
          Plebs<span className="text-emerald-400">.</span>
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 space-y-0.5 overflow-y-auto px-2">
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
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all",
                active
                  ? "bg-white/[0.08] text-white ring-hairline"
                  : "text-zinc-400 hover:text-white hover:bg-white/[0.04]",
                locked && "opacity-40",
              )}
            >
              <span className="text-base flex-shrink-0">{icon}</span>
              <span className="truncate">{label}</span>
              {locked && (
                <span className="ml-auto text-[9px] text-emerald-400/60 uppercase tracking-wider font-medium">
                  {requiredTier}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Tier badge */}
      <div className="p-4 border-t border-white/[0.06]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={clsx(
              "w-1.5 h-1.5 rounded-full",
              tier === "elite" ? "bg-emerald-400" : tier === "pro" ? "bg-amber-400" : "bg-zinc-500"
            )} />
            <span className="text-xs text-zinc-400">{displayLabel}</span>
          </div>
          {tier === "free" && (
            <Link
              href="/dashboard/upgrade"
              className="text-xs text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
            >
              Upgrade
            </Link>
          )}
        </div>
      </div>
    </aside>
  );
}
