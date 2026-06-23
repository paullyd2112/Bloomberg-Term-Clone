import Link from "next/link";
import { getUserTier } from "@/lib/user";
import { canAccessFeature } from "@/lib/tier";
import ScreenerClient from "./ScreenerClient";

export const revalidate = 0;

export default async function ScreenerPage() {
  const tier = await getUserTier();

  if (!canAccessFeature(tier, "screener")) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center space-y-4">
          <div className="text-3xl">🔎</div>
          <h2 className="text-white font-semibold text-lg">Signal Screener</h2>
          <p className="text-zinc-400 text-sm leading-relaxed">
            Filter every live signal by confidence, direction, time horizon,
            outcome, and insider buying. Find exactly the setups you care about.
            Pro and Elite only.
          </p>
          <Link
            href="/dashboard/upgrade"
            className="inline-block bg-green-500 hover:bg-green-400 text-black font-semibold text-sm px-5 py-2.5 rounded transition-colors"
          >
            Upgrade to Pro →
          </Link>
        </div>
      </div>
    );
  }

  return <ScreenerClient />;
}
