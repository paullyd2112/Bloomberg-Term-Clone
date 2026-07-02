import { getUserTier } from "@/lib/user";
import { canAccessFeature } from "@/lib/tier";
import SubscribeGate from "@/components/ui/SubscribeGate";
import CongressClient from "./CongressClient";

export default async function CongressPage() {
  const tier = await getUserTier();

  if (!canAccessFeature(tier, "congress")) {
    return <SubscribeGate message="Congressional trade tracking is available on Pro and Elite plans." />;
  }

  return <CongressClient />;
}
