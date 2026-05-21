import { redirect } from "next/navigation";
import { getUser, getUserTier } from "@/lib/user";

export default async function DashboardPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const tier = await getUserTier();

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      <div className="text-center space-y-2">
        <h1 className="text-xl font-semibold">Dashboard coming in Prompt 9</h1>
        <p className="text-zinc-400 text-sm">{user.email} · {tier}</p>
      </div>
    </div>
  );
}
