import { redirect } from "next/navigation";
import { getUser, getUserTier, getUserProfile } from "@/lib/user";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import TickerBar from "@/components/TickerBar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  if (!user) redirect("/login");

  const tier = await getUserTier();
  const profile = await getUserProfile();

  return (
    <div className="flex h-screen bg-background text-white overflow-hidden">
      {/* Sidebar — desktop only */}
      <Sidebar tier={tier} billingInterval={profile?.billing_interval} />

      <div className="flex flex-col flex-1 min-w-0 relative z-10">
        <TopBar user={user} tier={tier} trialEndsAt={profile?.trial_ends_at ?? null} />
        <TickerBar showStatus={false} />
        <div className="px-4 py-1 border-b border-white/[0.06] text-center flex-shrink-0">
          <p className="text-[10px] text-zinc-600">
            For informational purposes only. Not financial advice. Past performance is not indicative of future results.
          </p>
        </div>
        <main className="flex-1 overflow-y-auto pb-16 lg:pb-0">{children}</main>
      </div>

      {/* Bottom nav — mobile only */}
      <BottomNav tier={tier} />
    </div>
  );
}
