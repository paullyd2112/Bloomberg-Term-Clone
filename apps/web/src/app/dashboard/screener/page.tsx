import Link from "next/link";
import { Search, ArrowRight } from "lucide-react";
import { getUserTier, getUserProfile } from "@/lib/user";
import { canAccessFeature, type ExperienceLevel } from "@/lib/tier";
import ScreenerClient from "./ScreenerClient";

export const revalidate = 0;

export default async function ScreenerPage() {
  const tier = await getUserTier();

  if (!canAccessFeature(tier, "screener")) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-2xl p-8 text-center flex flex-col items-center gap-4">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-700/30 bg-emerald-500/10 text-emerald-400">
            <Search className="h-6 w-6" />
          </span>
          <h2 className="text-white font-semibold text-lg tracking-tight">Signal Screener</h2>
          <p className="text-zinc-400 text-sm leading-relaxed max-w-md">
            Filter every live signal by confidence, direction, time horizon,
            outcome, and insider buying. Find exactly the setups you care about.
            Pro and Elite only.
          </p>
          <Link
            href="/dashboard/upgrade"
            className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-sm px-5 py-2.5 rounded-lg transition-colors"
          >
            Upgrade to Pro
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  const profile = await getUserProfile();
  return <ScreenerClient experienceLevel={profile?.trading_experience as ExperienceLevel | undefined} />;
}
