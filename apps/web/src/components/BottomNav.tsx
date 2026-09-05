"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import {
  Zap,
  Star,
  Sunrise,
  Bot,
  BarChart3,
  type LucideIcon,
} from "lucide-react";

type NavItem = { href: string; label: string; icon: LucideIcon };

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard",              label: "Signals",     icon: Zap },
  { href: "/dashboard/predictions",  label: "Markets",     icon: BarChart3 },
  { href: "/dashboard/watchlist",    label: "Watch",       icon: Star },
  { href: "/dashboard/briefing",     label: "Brief",       icon: Sunrise },
  { href: "/dashboard/pleby",        label: "Pleby",       icon: Bot },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-black/70 backdrop-blur-xl border-t border-white/[0.06] flex pb-[env(safe-area-inset-bottom)]">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
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
              active
                ? "text-white"
                : "text-zinc-500 hover:text-zinc-300",
            )}
          >
            <span
              className={clsx(
                "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                active && "bg-white/[0.07] ring-hairline",
              )}
            >
              <Icon
                className={clsx(
                  "h-[18px] w-[18px]",
                  active && "text-emerald-400",
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
