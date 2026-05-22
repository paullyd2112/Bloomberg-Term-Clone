import { redirect } from "next/navigation";
import { getUser, getUserTier, getUserProfile } from "@/lib/user";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";

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
      {/* Sidebar — desktop only */}
      <Sidebar tier={tier} billingInterval={profile?.billing_interval} />

      <div className="flex flex-col flex-1 min-w-0">
        <TopBar user={user} tier={tier} />
        {/* pb-16 reserves space for the mobile bottom nav */}
        <main className="flex-1 overflow-y-auto pb-16 lg:pb-0">{children}</main>
      </div>

      {/* Bottom nav — mobile only */}
      <BottomNav tier={tier} />
    </div>
  );
}
