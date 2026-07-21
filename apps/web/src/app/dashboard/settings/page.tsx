import { redirect } from "next/navigation";
import Link from "next/link";
import { getUser, getUserProfile } from "@/lib/user";
import { createClient } from "@/lib/supabase/server";
import { isPaidTier, type Tier } from "@/lib/tier";
import BillingPortalButton from "@/app/dashboard/upgrade/BillingPortalButton";
import SettingsForm from "./SettingsForm";
import SignOutButton from "./SignOutButton";

export const dynamic = "force-dynamic";

type Experience = "beginner" | "intermediate" | "advanced";
type AssetPref  = "stocks" | "crypto" | "predictions";

export default async function SettingsPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const profile = await getUserProfile();
  const tier = (profile?.tier as Tier) ?? "free";

  let emailAlerts = true;
  let smsAlerts = false;
  let newsletterFreq: "daily" | "weekdays" | "every_other_day" | "weekly" | "weekends" = "daily";
  try {
    const supabase = createClient();
    const [alertsResult, freqResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("email_alerts, sms_alerts")
        .eq("id", user.id)
        .single(),
      supabase
        .from("newsletter_subscribers")
        .select("newsletter_frequency")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);
    const alertData = alertsResult.data;
    if (alertData && typeof alertData.email_alerts === "boolean") emailAlerts = alertData.email_alerts;
    if (alertData && typeof alertData.sms_alerts === "boolean") smsAlerts = alertData.sms_alerts;
    if (freqResult.data?.newsletter_frequency) newsletterFreq = freqResult.data.newsletter_frequency;
  } catch {
    // columns not present yet — keep defaults
  }

  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const planLabel = profile?.billing_interval === "lifetime"
    ? `Lifetime ${capitalize(tier)}`
    : `${capitalize(tier)}${tier !== "free" ? " plan" : ""}`;

  const memberSince = user.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
    : "—";

  const trialEnds = profile?.trial_ends_at
    ? new Date(profile.trial_ends_at)
    : null;
  const trialActive = trialEnds && trialEnds.getTime() > Date.now();

  return (
    <div className="p-5 md:p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-white">Settings</h1>
        <p className="text-zinc-500 text-sm">Manage your account and preferences.</p>
      </div>

      {/* Account */}
      <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl p-5 space-y-4">
        <h2 className="flex items-center gap-2.5 font-mono text-[11px] font-semibold text-zinc-500 uppercase tracking-[0.18em]">
          <span className="text-emerald-400 text-[10px] leading-none">●</span>
          Account
        </h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-zinc-500">Email</div>
            <div className="text-sm text-white mt-0.5">{user.email}</div>
          </div>
          <div>
            <div className="text-xs text-zinc-500">Member since</div>
            <div className="text-sm text-white mt-0.5">{memberSince}</div>
          </div>
          <div>
            <div className="text-xs text-zinc-500">Plan</div>
            <div className="text-sm text-white mt-0.5">
              {planLabel}
              {trialActive && (
                <span className="ml-2 text-xs text-emerald-400">
                  · trial ends {trialEnds!.toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 pt-1">
          {isPaidTier(tier) ? (
            <BillingPortalButton />
          ) : (
            <Link
              href="/dashboard/upgrade"
              className="bg-emerald-500 hover:bg-emerald-400 text-black text-sm font-bold px-4 py-2 rounded-lg transition-colors"
            >
              View plans →
            </Link>
          )}
          <SignOutButton />
        </div>
      </div>

      {/* Profile form */}
      <SettingsForm
        initialFullName={(profile?.full_name as string) ?? ""}
        initialPhone={(profile?.phone_number as string) ?? ""}
        initialExperience={(profile?.trading_experience as Experience) ?? null}
        initialAssets={(profile?.asset_preferences as AssetPref[]) ?? []}
        initialEmailAlerts={emailAlerts}
        initialSmsAlerts={smsAlerts}
        initialNewsletterFreq={newsletterFreq}
        tier={tier}
      />

      <p className="text-zinc-600 text-xs">
        Need help? Email{" "}
        <a href="mailto:support@plebs.finance" className="text-zinc-400 hover:text-white">
          support@plebs.finance
        </a>
      </p>
    </div>
  );
}
