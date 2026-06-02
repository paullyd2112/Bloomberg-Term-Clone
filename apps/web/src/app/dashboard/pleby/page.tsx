import { getUserTier } from "@/lib/user";
import { canAccessFeature } from "@/lib/tier";
import SubscribeGate from "@/components/ui/SubscribeGate";
import PlebyClient from "./PlebyClient";

export default async function PlebyPage() {
  const tier = await getUserTier();
  if (!canAccessFeature(tier, "pleby")) {
    return <SubscribeGate message="Pleby AI is an Elite feature." />;
  }

  return (
    <div className="h-full">
      <PlebyClient />
    </div>
  );
}
