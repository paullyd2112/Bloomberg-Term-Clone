import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/user";
import CopyButton from "./CopyButton";

export const revalidate = 60;

type Referral = {
  id:               number;
  status:           "pending" | "converted" | "rewarded";
  reward_granted_at: string | null;
  created_at:       string;
};

async function getData(userId: string) {
  const supabase = createClient();

  const [profileRes, referralsRes] = await Promise.all([
    supabase.from("profiles").select("referral_code").eq("id", userId).single(),
    supabase
      .from("referrals")
      .select("id, status, reward_granted_at, created_at")
      .eq("referrer_id", userId)
      .order("created_at", { ascending: false }),
  ]);

  return {
    code:      profileRes.data?.referral_code as string | null,
    referrals: (referralsRes.data as Referral[]) ?? [],
  };
}

const STATUS_STYLE: Record<string, string> = {
  pending:   "text-zinc-500",
  converted: "text-emerald-400",
  rewarded:  "text-amber-400",
};

export default async function ReferralsPage() {
  const user              = await requireUser();
  const { code, referrals } = await getData(user.id);

  const appUrl    = process.env.NEXT_PUBLIC_APP_URL ?? "https://plebs.finance";
  const inviteUrl = code ? `${appUrl}/invite/${code}` : null;

  const converted = referrals.filter((r) => r.status !== "pending").length;
  const pending   = referrals.filter((r) => r.status === "pending").length;

  return (
    <div className="p-5 md:p-8 space-y-6 max-w-2xl">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-white">Referrals</h1>
        <p className="text-zinc-500 text-sm">
          Invite friends — earn rewards when they upgrade.
        </p>
      </div>

      {/* Invite link card */}
      <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl p-5 space-y-3">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Your invite link</p>
        {inviteUrl ? (
          <div className="flex items-center gap-3">
            <code className="flex-1 text-sm text-emerald-400 bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-2 truncate font-mono">
              {inviteUrl}
            </code>
            <CopyButton text={inviteUrl} />
          </div>
        ) : (
          <p className="text-zinc-500 text-sm">Generating your code…</p>
        )}
        <p className="text-zinc-600 text-xs">
          When someone signs up through your link and upgrades, you both win.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total referrals", value: referrals.length, color: "text-white" },
          { label: "Converted",       value: converted,         color: "text-emerald-400" },
          { label: "Pending",         value: pending,           color: "text-zinc-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl p-4 hover:bg-white/[0.05] hover:border-white/[0.1] transition-all">
            <div className={`text-2xl font-bold tabular-nums ${color}`}>{value}</div>
            <div className="text-zinc-500 text-xs mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Referral list */}
      {referrals.length > 0 && (
        <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.08]">
                {["Referred", "Status", "Reward"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {referrals.map((r) => (
                <tr key={r.id} className="border-b border-white/[0.06] hover:bg-white/[0.03] transition-colors">
                  <td className="px-4 py-3 text-zinc-400 text-xs">
                    {new Date(r.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium capitalize ${STATUS_STYLE[r.status]}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">
                    {r.reward_granted_at
                      ? <span className="text-emerald-400">Granted {new Date(r.reward_granted_at).toLocaleDateString()}</span>
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {referrals.length === 0 && (
        <div className="text-center py-12 text-zinc-600 text-sm">
          No referrals yet — share your link to get started.
        </div>
      )}
    </div>
  );
}
