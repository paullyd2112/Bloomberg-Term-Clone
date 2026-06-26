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
    <div className="flex h-screen bg-black text-white overflow-hidden">
      {/* Ambient background glow */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute -top-40 left-1/4 w-[600px] h-[400px] bg-emerald-500/[0.04] blur-[150px] rounded-full" />
        <div className="absolute top-1/2 right-0 w-[400px] h-[400px] bg-emerald-500/[0.03] blur-[120px] rounded-full" />
      </div>

      {/* Sidebar — desktop only */}
      <Sidebar tier={tier} billingInterval={profile?.billing_interval} />

      <div className="flex flex-col flex-1 min-w-0 relative z-10">
        <TopBar user={user} tier={tier} />
        <TickerBar />
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
