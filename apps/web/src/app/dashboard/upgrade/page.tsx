import { Check } from "lucide-react";
import { getUserTier, getUserProfile } from "@/lib/user";
import { TIER_FEATURES } from "@/lib/tier";
import UpgradeButtons from "./UpgradeButtons";
import LifetimeButton from "./LifetimeButton";
import BillingPortalButton from "./BillingPortalButton";
import CancelButton from "./CancelButton";

export default async function UpgradePage() {
  const tier = await getUserTier();
  const profile = await getUserProfile();
  const isLifetimePro   = profile?.billing_interval === "lifetime" && tier === "pro";
  const isLifetimeElite = profile?.billing_interval === "lifetime" && tier === "elite";

  return (
    <div className="p-5 md:p-8 max-w-4xl mx-auto space-y-10">
      <div>
        <h1 className="text-xl font-bold text-white tracking-tight">Plans & Billing</h1>
        <p className="text-sm text-zinc-400 mt-1.5">
          {tier === "free"
            ? "Pick a plan to start your 14-day trial."
            : <>You&apos;re on the <span className="text-white capitalize font-medium">{tier}</span> plan.</>}
        </p>
      </div>

      {/* Subscription plans */}
      <div>
        <h2 className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.15em] text-zinc-500 mb-4">
          <span className="text-emerald-400/60">●</span>
          Subscription plans
        </h2>
        <div className="grid gap-5 md:grid-cols-2">
          <PlanCard
            name="Pro"
            price={{ monthly: 40, quarterly: 100 }}
            description="Serious retail traders"
            features={TIER_FEATURES.pro}
            current={tier === "pro" && profile?.billing_interval !== "lifetime"}
            tier="pro"
            highlighted
          />
          <PlanCard
            name="Elite"
            price={{ monthly: 80, quarterly: 200 }}
            description="For the obsessed"
            features={TIER_FEATURES.elite}
            current={tier === "elite" && profile?.billing_interval !== "lifetime"}
            tier="elite"
          />
        </div>
      </div>

      {/* Lifetime plans */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.15em] text-zinc-500">
            <span className="text-emerald-400/60">●</span>
            Lifetime access
          </h2>
          <span className="text-[11px] font-semibold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2.5 py-1 rounded-lg">
            Limited time offer
          </span>
        </div>
        <p className="text-xs text-zinc-500 mb-5">
          Pay once, keep access forever. Lifetime plans won&apos;t be available permanently.
        </p>
        <div className="grid gap-5 md:grid-cols-2">
          {/* Lifetime Pro */}
          <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-2xl p-7 flex flex-col gap-5">
            <div>
              <div className="text-base font-bold text-white">Lifetime Pro</div>
              <div className="text-xs text-zinc-500 mt-1">One-time payment, forever access</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-white tabular-nums">$299</div>
              <div className="text-xs text-zinc-500 mt-1">Pays for itself in ~8 months</div>
            </div>
            <ul className="space-y-2 flex-1">
              {TIER_FEATURES.pro.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-xs text-zinc-300">
                  <Check className="h-3.5 w-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            {isLifetimePro ? (
              <div className="text-center text-xs font-semibold text-zinc-500 border border-white/[0.08] rounded-xl py-2.5">
                Your plan
              </div>
            ) : (
              <LifetimeButton plan="lifetime_pro" />
            )}
          </div>

          {/* Lifetime Elite */}
          <div className="relative bg-gradient-to-br from-emerald-900/20 to-transparent border border-emerald-500/30 rounded-2xl p-7 flex flex-col gap-5 glow-green">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-black text-[11px] font-bold px-3.5 py-1 rounded-lg">
              Best value
            </div>
            <div>
              <div className="text-base font-bold text-white">Lifetime Elite</div>
              <div className="text-xs text-zinc-500 mt-1">One-time payment, forever access</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-white tabular-nums">$399</div>
              <div className="text-xs text-zinc-500 mt-1">Pays for itself in ~5 months</div>
            </div>
            <ul className="space-y-2 flex-1">
              {TIER_FEATURES.elite.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-xs text-zinc-300">
                  <Check className="h-3.5 w-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            {isLifetimeElite ? (
              <div className="text-center text-xs font-semibold text-zinc-500 border border-white/[0.08] rounded-xl py-2.5">
                Your plan
              </div>
            ) : (
              <LifetimeButton plan="lifetime_elite" />
            )}
          </div>
        </div>
      </div>

      {/* Billing portal */}
      {tier !== "free" && (
        <div className="space-y-3">
          <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl p-5 flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-white">Billing & invoices</div>
              <div className="text-xs text-zinc-500 mt-1">
                Manage your subscription, update payment method, or download invoices.
              </div>
            </div>
            <BillingPortalButton />
          </div>
          {profile?.billing_interval !== "lifetime" && (
            <div className="flex justify-end px-1">
              <CancelButton cancelAt={profile?.cancel_at as string | null} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PlanCard({
  name,
  price,
  description,
  features,
  current,
  tier,
  highlighted = false,
}: {
  name: string;
  price: { monthly: number; quarterly: number };
  description: string;
  features: readonly string[];
  current: boolean;
  tier: "pro" | "elite";
  highlighted?: boolean;
}) {
  const savingsPerQuarter = Math.round(price.monthly * 3 - price.quarterly);

  return (
    <div
      className={`relative rounded-2xl border p-7 flex flex-col gap-5 ${
        highlighted
          ? "bg-gradient-to-br from-emerald-900/15 to-transparent border-emerald-500/30 glow-green"
          : "bg-white/[0.03] border-white/[0.06] ring-hairline"
      }`}
    >
      {highlighted && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-black text-[11px] font-bold px-3.5 py-1 rounded-lg">
          Most popular
        </div>
      )}

      <div>
        <div className="text-base font-bold text-white">{name}</div>
        <div className="text-xs text-zinc-500 mt-1">{description}</div>
      </div>

      <div>
        <div className="text-2xl font-bold text-white tabular-nums">
          ${price.monthly}
          <span className="text-sm font-normal text-zinc-500">/mo</span>
        </div>
        <div className="text-xs text-zinc-500 mt-1">
          ${price.quarterly}/quarter — save ${savingsPerQuarter}
        </div>
      </div>

      <ul className="space-y-2 flex-1">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-xs text-zinc-300">
            <Check className="h-3.5 w-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
            {f}
          </li>
        ))}
      </ul>

      {current ? (
        <div className="text-center text-xs font-semibold text-zinc-500 border border-white/[0.08] rounded-xl py-2.5">
          Current plan
        </div>
      ) : (
        <UpgradeButtons planTier={tier} />
      )}
    </div>
  );
}
