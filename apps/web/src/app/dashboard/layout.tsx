import { redirect } from "next/navigation";
import { getUser, getUserTier } from "@/lib/user";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  if (!user) redirect("/login");

  const tier = await getUserTier();

  return (
    <div className="flex h-screen bg-black text-white overflow-hidden">
      <Sidebar tier={tier} />
      <div className="flex flex-col flex-1 min-w-0">
        <TopBar user={user} tier={tier} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
