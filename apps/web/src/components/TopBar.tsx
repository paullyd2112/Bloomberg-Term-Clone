"use client";

import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import type { Tier } from "@/lib/tier";
import { createClient } from "@/lib/supabase/client";
import SearchBar from "@/components/SearchBar";

export default function TopBar({ user, tier }: { user: User; tier: Tier }) {
  const router = useRouter();
  const supabase = createClient();

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="h-14 flex-shrink-0 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between px-4 gap-4">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {tier === "free" && (
          <span className="text-xs text-red-400 bg-red-950/40 border border-red-800 rounded px-2 py-0.5 whitespace-nowrap flex-shrink-0">
            Trial ended —{" "}
            <a href="/dashboard/upgrade" className="underline hover:text-red-300">
              subscribe to continue
            </a>
          </span>
        )}
        <SearchBar />
      </div>

      <div className="flex items-center gap-3 flex-shrink-0">
        <span className="hidden sm:block text-xs text-zinc-500 truncate max-w-[180px]">
          {user.email}
        </span>
        <a
          href="/dashboard/settings"
          className="text-xs text-zinc-400 hover:text-white transition-colors"
        >
          Settings
        </a>
        <button
          onClick={signOut}
          className="text-xs text-zinc-400 hover:text-white transition-colors"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
