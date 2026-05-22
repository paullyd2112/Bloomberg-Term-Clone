import { getUserTier } from "@/lib/user";
import { isPaidTier } from "@/lib/tier";
import SubscribeGate from "@/components/ui/SubscribeGate";
import BacktestClient from "./BacktestClient";

export default async function BacktestPage() {
  const tier = await getUserTier();
  if (!isPaidTier(tier)) return <SubscribeGate message="Backtesting is a Pro feature." />;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold text-white">Backtester</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Replay historical signals with your filters and see how a simple strategy would have performed.
        </p>
      </div>
      <BacktestClient />
    </div>
  );
}
