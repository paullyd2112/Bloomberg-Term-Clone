"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import type { Tier } from "@/lib/tier";

const NAV_FREE = [
  { href: "/dashboard",            label: "Signals",  icon: "⚡" },
  { href: "/dashboard/watchlist",  label: "Watch",    icon: "★" },
  { href: "/dashboard/congress",   label: "Congress", icon: "🏛" },
  { href: "/dashboard/briefing",   label: "Brief",    icon: "☀" },
  { href: "/dashboard/upgrade",    label: "Upgrade",  icon: "↑" },
] as const;

const NAV_PRO = [
  { href: "/dashboard",            label: "Signals",   icon: "⚡" },
  { href: "/dashboard/screener",   label: "Screener",  icon: "🔎" },
  { href: "/dashboard/watchlist",  label: "Watch",     icon: "★" },
  { href: "/dashboard/portfolio",  label: "Portfolio", icon: "◈" },
  { href: "/dashboard/briefing",   label: "Brief",     icon: "☀" },
] as const;

const NAV_ELITE = [
  { href: "/dashboard",            label: "Signals",   icon: "⚡" },
  { href: "/dashboard/screener",   label: "Screener",  icon: "🔎" },
  { href: "/dashboard/watchlist",  label: "Watch",     icon: "★" },
  { href: "/dashboard/portfolio",  label: "Portfolio", icon: "◈" },
  { href: "/dashboard/pleby",      label: "Pleby",     icon: "🤖" },
] as const;

export default function BottomNav({ tier }: { tier: Tier }) {
  const pathname = usePathname();
  const items    = tier === "elite" ? NAV_ELITE : tier === "pro" ? NAV_PRO : NAV_FREE;

  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-zinc-950 border-t border-zinc-800 flex">
      {items.map(({ href, label, icon, ...rest }) => {
        const isUpgrade = "upgradeOnly" in rest && rest.upgradeOnly;
        const active =
          href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(href);

        return (
          <Link
            key={href}
            href={href}
            className={clsx(
              "flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
              active && !isUpgrade
                ? "text-white"
                : isUpgrade
                ? "text-green-400"
                : "text-zinc-500 hover:text-zinc-300",
            )}
          >
            <span className="text-lg leading-none">{icon}</span>
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
