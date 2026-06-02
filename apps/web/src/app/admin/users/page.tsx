import { createAdminClient } from "@/lib/supabase/admin";
import TierSelect from "./TierSelect";

export const revalidate = 0;

type Profile = {
  id: string;
  tier: string;
  billing_interval: string | null;
  stripe_customer_id: string | null;
  onboarding_completed: boolean;
  created_at: string;
};

async function getUsers(): Promise<(Profile & { email: string })[]> {
  const supabase = createAdminClient();

  const [{ data: profiles }, { data: authData }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, tier, billing_interval, stripe_customer_id, onboarding_completed, created_at")
      .order("created_at", { ascending: false })
      .limit(200) as unknown as Promise<{ data: Profile[] | null }>,
    supabase.auth.admin.listUsers({ perPage: 200 }),
  ]);

  const emailMap = new Map(
    (authData?.users ?? []).map((u) => [u.id, u.email ?? ""]),
  );

  return (profiles ?? []).map((p) => ({
    ...(p as Profile),
    email: emailMap.get(p.id) ?? "—",
  }));
}

const TIER_COLOR: Record<string, string> = {
  free:  "text-zinc-400",
  pro:   "text-green-400",
  elite: "text-purple-400",
};

export default async function AdminUsersPage() {
  const users = await getUsers();

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-white">Users <span className="text-zinc-600 text-sm font-normal">({users.length})</span></h1>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                {["Email", "Tier", "Billing", "Stripe", "Onboarded", "Joined", "Actions"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-zinc-800/60 hover:bg-zinc-800/30 transition-colors">
                  <td className="px-4 py-3 text-zinc-300 text-xs font-mono truncate max-w-[200px]">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold capitalize ${TIER_COLOR[u.tier] ?? "text-zinc-400"}`}>
                      {u.tier}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-500 text-xs">{u.billing_interval ?? "—"}</td>
                  <td className="px-4 py-3 text-xs">
                    {u.stripe_customer_id
                      ? <span className="text-green-400">✓</span>
                      : <span className="text-zinc-700">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {u.onboarding_completed
                      ? <span className="text-green-400">✓</span>
                      : <span className="text-zinc-700">—</span>}
                  </td>
                  <td className="px-4 py-3 text-zinc-500 text-xs whitespace-nowrap">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <TierSelect userId={u.id} currentTier={u.tier} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
