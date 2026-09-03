import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/user";
import { abs } from "@/lib/seo";
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

  // SITE_URL is the www host; the bare apex 308-redirects, which costs a hop on
  // every shared invite link.
  const inviteUrl = code ? abs(`/invite/${code}`) : null;

  const converted = referrals.filter((r) => r.status !== "pending").length;
  const freeMonthsEarned = Math.floor(converted / 3);
  const toNextFreeMonth  = 3 - (converted % 3);
  const lifetimeUnlocked = converted >= 12;
  const toLifetime       = Math.max(0, 12 - converted);

  return (
    <div className="p-5 md:p-8 space-y-6 max-w-2xl">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-white">Referrals</h1>
        <p className="text-zinc-500 text-sm">
          Share Plebs with friends. Earn free months, and eventually a free lifetime account.
        </p>
      </div>

      {/* How it works */}
      <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl p-5 space-y-4">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">How it works</p>
        <div className="grid gap-3">
          <div className="flex items-start gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-xs font-bold">3</span>
            <div>
              <p className="text-sm text-white font-medium">3 referrals = 1 free month</p>
              <p className="text-xs text-zinc-500">Every 3 friends who sign up and upgrade, you get a month on us.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 text-xs font-bold">12</span>
            <div>
              <p className="text-sm text-white font-medium">12 referrals = free lifetime account</p>
              <p className="text-xs text-zinc-500">Hit 12 converted referrals and your account is free forever.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 text-xs font-bold">+</span>
            <div>
              <p className="text-sm text-white font-medium">Keep going after 12</p>
              <p className="text-xs text-zinc-500">Every referral after 12 earns you 50% off your next month.</p>
            </div>
          </div>
        </div>
        <p className="text-[10px] text-zinc-600 pt-1">
          A referral counts as &ldquo;converted&rdquo; when they upgrade to a paid plan.
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
          <p className="text-zinc-500 text-sm">Generating your code...</p>
        )}
      </div>

      {/* Progress + Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl p-4 hover:bg-white/[0.05] hover:border-white/[0.1] transition-all">
          <div className="text-2xl font-bold tabular-nums text-white">{referrals.length}</div>
          <div className="text-zinc-500 text-xs mt-1">Total referrals</div>
        </div>
        <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl p-4 hover:bg-white/[0.05] hover:border-white/[0.1] transition-all">
          <div className="text-2xl font-bold tabular-nums text-emerald-400">{converted}</div>
          <div className="text-zinc-500 text-xs mt-1">Converted</div>
        </div>
        <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl p-4 hover:bg-white/[0.05] hover:border-white/[0.1] transition-all">
          <div className="text-2xl font-bold tabular-nums text-amber-400">{freeMonthsEarned}</div>
          <div className="text-zinc-500 text-xs mt-1">Free months earned</div>
        </div>
        <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl p-4 hover:bg-white/[0.05] hover:border-white/[0.1] transition-all">
          {lifetimeUnlocked ? (
            <>
              <div className="text-2xl font-bold text-emerald-400">Unlocked</div>
              <div className="text-zinc-500 text-xs mt-1">Lifetime status</div>
            </>
          ) : (
            <>
              <div className="text-2xl font-bold tabular-nums text-zinc-400">{toLifetime} to go</div>
              <div className="text-zinc-500 text-xs mt-1">Until lifetime</div>
            </>
          )}
        </div>
      </div>

      {/* Next milestone */}
      {!lifetimeUnlocked && converted > 0 && (
        <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl px-5 py-3">
          <p className="text-xs text-emerald-400">
            {toNextFreeMonth === 3
              ? `Next free month unlocks at ${converted + 3} conversions.`
              : `${toNextFreeMonth} more conversion${toNextFreeMonth === 1 ? "" : "s"} until your next free month.`}
          </p>
        </div>
      )}

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
          No referrals yet. Share your link to get started.
        </div>
      )}
    </div>
  );
}
