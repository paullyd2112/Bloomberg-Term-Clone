"use client";

import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { AlertTriangle, Clock, Settings, LogOut } from "lucide-react";
import type { Tier } from "@/lib/tier";
import { createClient } from "@/lib/supabase/client";
import SearchBar from "@/components/SearchBar";

function getTrialDaysLeft(trialEndsAt: string | null): number | null {
  if (!trialEndsAt) return null;
  const now = new Date();
  const end = new Date(trialEndsAt);
  const diff = end.getTime() - now.getTime();
  if (diff <= 0) return 0;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export default function TopBar({ user, tier, trialEndsAt }: { user: User; tier: Tier; trialEndsAt: string | null }) {
  const router = useRouter();
  const supabase = createClient();
  const trialDaysLeft = getTrialDaysLeft(trialEndsAt);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="h-14 flex-shrink-0 bg-black/40 backdrop-blur-xl border-b border-white/[0.06] flex items-center justify-between px-5 gap-4 relative z-30">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {tier === "free" && (
          <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-2.5 py-1 whitespace-nowrap flex-shrink-0">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
            Trial ended —{" "}
            <a href="/dashboard/upgrade" className="underline underline-offset-2 hover:text-red-200">
              subscribe to continue
            </a>
          </span>
        )}
        {tier !== "free" && trialDaysLeft !== null && trialDaysLeft > 0 && (
          <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-1 whitespace-nowrap flex-shrink-0">
            <Clock className="h-3.5 w-3.5 flex-shrink-0" />
            Trial: {trialDaysLeft} {trialDaysLeft === 1 ? "day" : "days"} left
          </span>
        )}
        <SearchBar />
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <a
          href="/dashboard/settings"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-white rounded-lg px-2 py-1.5 hover:bg-white/[0.04] transition-colors"
          aria-label="Settings"
        >
          <Settings className="h-4 w-4" />
          <span className="hidden sm:inline">Settings</span>
        </a>
        <button
          onClick={signOut}
          className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-white rounded-lg px-2 py-1.5 hover:bg-white/[0.04] transition-colors"
          aria-label="Sign out"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
    </header>
  );
}
