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
  PieChart,
  Bot,
  ArrowUpRight,
  Calculator,
  BarChart3,
  Layers,
  Trophy,
  type LucideIcon,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Core",
    items: [
      { href: "/dashboard",             label: "Signals",     icon: Zap },
      { href: "/dashboard/predictions", label: "Predictions", icon: BarChart3 },
      { href: "/dashboard/positions",   label: "Positions",   icon: Layers },
      { href: "/dashboard/watchlist",   label: "Watchlist",   icon: Star },
    ],
  },
  {
    label: "Tools",
    items: [
      { href: "/dashboard/screener",        label: "Screener",     icon: Search },
      { href: "/dashboard/portfolio",       label: "Portfolio",    icon: Wallet },
      { href: "/dashboard/performance",     label: "Performance",  icon: TrendingUp },
      { href: "/dashboard/backtest",        label: "Backtest",     icon: ArrowUpRight },
      { href: "/dashboard/history",         label: "Pleby Trades", icon: Receipt },
      { href: "/dashboard/alerts",          label: "Alerts",       icon: Bell },
      { href: "/dashboard/challenge",        label: "Challenge",    icon: Trophy },
      { href: "/dashboard/prop-calculator", label: "Prop Sizing",  icon: Calculator },
      { href: "/dashboard/allocator",       label: "Allocator",    icon: PieChart },
      { href: "/dashboard/pleby",           label: "Pleby AI",     icon: Bot },
    ],
  },
  {
    label: "",
    items: [
      { href: "/dashboard/congress",  label: "Congress",  icon: Landmark },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex w-56 flex-shrink-0 bg-black/40 backdrop-blur-xl border-r border-white/[0.06] flex-col">
      {/* Logo */}
      <div className="h-14 flex items-center px-5 border-b border-white/[0.06]">
        <Link href="/dashboard" className="text-lg font-semibold tracking-tight text-white" aria-label="Plebs dashboard">
          Plebs<span className="text-emerald-400">.</span>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 overflow-y-auto px-3 space-y-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label || "ungrouped"}>
            {group.label && (
              <div className="px-3 pb-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-zinc-600">
                {group.label}
              </div>
            )}
            <div className="space-y-0.5">
              {group.items.map(({ href, label, icon: Icon }) => {
                const active =
                  href === "/dashboard"
                    ? pathname === "/dashboard"
                    : pathname.startsWith(href);

                return (
                  <Link
                    key={href}
                    href={href}
                    className={clsx(
                      "group relative flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all",
                      active
                        ? "bg-white/[0.06] text-white ring-hairline"
                        : "text-zinc-400 hover:text-white hover:bg-white/[0.04]",
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
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
