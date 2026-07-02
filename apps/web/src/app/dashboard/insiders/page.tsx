import { getUserTier } from "@/lib/user";
import { canAccessFeature } from "@/lib/tier";
import SubscribeGate from "@/components/ui/SubscribeGate";
import InsidersClient from "./InsidersClient";

export default async function InsidersPage() {
  const tier = await getUserTier();

  if (!canAccessFeature(tier, "congress")) {
    return <SubscribeGate message="Insider trade tracking is available on Pro and Elite plans." />;
  }

  return <InsidersClient />;
}
