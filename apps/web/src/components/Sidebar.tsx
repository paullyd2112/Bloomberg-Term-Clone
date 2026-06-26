"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import {
  Zap,
  Search,
  Star,
  Wallet,
  TrendingUp,
  Receipt,
  Bell,
  Landmark,
  Eye,
  Gift,
  PieChart,
  Bot,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";
import type { Tier } from "@/lib/tier";

const NAV: {
  href: string;
  label: string;
  icon: LucideIcon;
  tier?: "pro" | "elite";
}[] = [
  { href: "/dashboard",             label: "Signals",       icon: Zap },
  { href: "/dashboard/screener",    label: "Screener",      icon: Search,     tier: "pro" },
  { href: "/dashboard/watchlist",   label: "Watchlist",     icon: Star },
  { href: "/dashboard/portfolio",   label: "Portfolio",     icon: Wallet,     tier: "pro" },
  { href: "/dashboard/performance", label: "Performance",   icon: TrendingUp, tier: "pro" },
  { href: "/dashboard/history",     label: "Trade History", icon: Receipt,    tier: "pro" },
  { href: "/dashboard/alerts",      label: "Alerts",        icon: Bell,       tier: "pro" },
  { href: "/dashboard/congress",    label: "Congress",      icon: Landmark },
  { href: "/dashboard/insiders",    label: "Insiders",      icon: Eye },
  { href: "/dashboard/referrals",   label: "Referrals",     icon: Gift },
  { href: "/dashboard/allocator",   label: "Allocator",     icon: PieChart,   tier: "elite" },
  { href: "/dashboard/pleby",       label: "Pleby AI",      icon: Bot,        tier: "elite" },
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
        <Link href="/dashboard" className="text-lg font-semibold tracking-tight text-white" aria-label="Plebs dashboard">
          Plebs<span className="text-emerald-400">.</span>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 space-y-0.5 overflow-y-auto px-3">
        {NAV.map(({ href, label, icon: Icon, tier: requiredTier }) => {
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
                "group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all",
                active
                  ? "bg-white/[0.06] text-white ring-hairline"
                  : "text-zinc-400 hover:text-white hover:bg-white/[0.04]",
                locked && "opacity-50 hover:opacity-80",
              )}
            >
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-emerald-400" />
              )}
              <Icon
                className={clsx(
                  "h-[18px] w-[18px] flex-shrink-0 transition-colors",
                  active ? "text-emerald-400" : "text-zinc-500 group-hover:text-zinc-300",
                )}
                strokeWidth={2}
              />
              <span className="truncate">{label}</span>
              {locked && (
                <span className="ml-auto font-mono text-[9px] text-emerald-400/60 uppercase tracking-wider font-medium">
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
            <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-400">{displayLabel}</span>
          </div>
          {tier === "free" && (
            <Link
              href="/dashboard/upgrade"
              className="group inline-flex items-center gap-0.5 text-xs text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
            >
              Upgrade
              <ArrowUpRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          )}
        </div>
      </div>
    </aside>
  );
}
