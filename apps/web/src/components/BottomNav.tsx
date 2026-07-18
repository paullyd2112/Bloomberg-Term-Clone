"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import {
  Zap,
  Star,
  Landmark,
  Sunrise,
  Sparkles,
  Search,
  Wallet,
  Bot,
  BarChart3,
  type LucideIcon,
} from "lucide-react";
import type { Tier } from "@/lib/tier";

type NavItem = { href: string; label: string; icon: LucideIcon; upgradeOnly?: boolean };

const NAV_FREE: NavItem[] = [
  { href: "/dashboard",              label: "Signals",     icon: Zap },
  { href: "/dashboard/predictions",  label: "Markets",     icon: BarChart3 },
  { href: "/dashboard/watchlist",    label: "Watch",       icon: Star },
  { href: "/dashboard/briefing",     label: "Brief",       icon: Sunrise },
  { href: "/dashboard/upgrade",      label: "Upgrade",     icon: Sparkles, upgradeOnly: true },
];

const NAV_PRO: NavItem[] = [
  { href: "/dashboard",              label: "Signals",     icon: Zap },
  { href: "/dashboard/predictions",  label: "Markets",     icon: BarChart3 },
  { href: "/dashboard/screener",     label: "Screener",    icon: Search },
  { href: "/dashboard/watchlist",    label: "Watch",       icon: Star },
  { href: "/dashboard/briefing",     label: "Brief",       icon: Sunrise },
];

const NAV_ELITE: NavItem[] = [
  { href: "/dashboard",              label: "Signals",     icon: Zap },
  { href: "/dashboard/predictions",  label: "Markets",     icon: BarChart3 },
  { href: "/dashboard/screener",     label: "Screener",    icon: Search },
  { href: "/dashboard/watchlist",    label: "Watch",       icon: Star },
  { href: "/dashboard/pleby",        label: "Pleby",       icon: Bot },
];

export default function BottomNav({ tier }: { tier: Tier }) {
  const pathname = usePathname();
  const items    = tier === "elite" ? NAV_ELITE : tier === "pro" ? NAV_PRO : NAV_FREE;

  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-black/70 backdrop-blur-xl border-t border-white/[0.06] flex pb-[env(safe-area-inset-bottom)]">
      {items.map(({ href, label, icon: Icon, upgradeOnly }) => {
        const active =
          href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(href);

        return (
          <Link
            key={href}
            href={href}
            className={clsx(
              "flex-1 flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-medium transition-colors",
              upgradeOnly
                ? "text-emerald-400"
                : active
                ? "text-white"
                : "text-zinc-500 hover:text-zinc-300",
            )}
          >
            <span
              className={clsx(
                "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                active && !upgradeOnly && "bg-white/[0.07] ring-hairline",
                upgradeOnly && "bg-emerald-500/10",
              )}
            >
              <Icon
                className={clsx(
                  "h-[18px] w-[18px]",
                  active && !upgradeOnly && "text-emerald-400",
                )}
                strokeWidth={2}
              />
            </span>
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
