import { getUserTier, getUserProfile } from "@/lib/user";
import { TIER_FEATURES } from "@/lib/tier";
import UpgradeButtons from "./UpgradeButtons";
import LifetimeButton from "./LifetimeButton";
import BillingPortalButton from "./BillingPortalButton";

export default async function UpgradePage() {
  const tier = await getUserTier();
  const profile = await getUserProfile();
  const isLifetime = profile?.billing_interval === "lifetime";

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-xl font-bold text-white">Plans &amp; Billing</h1>
        <p className="text-sm text-zinc-400 mt-1">
          {tier === "free"
            ? "Your trial has ended. Subscribe to keep access."
            : <>You&apos;re on the <span className="text-white capitalize font-medium">{tier}</span> plan.</>}
        </p>
      </div>

      {/* Pricing grid */}
      <div className="space-y-4">
        {/* Lifetime offer */}
        <div className="relative bg-gradient-to-br from-green-900/30 to-zinc-900 rounded-xl border border-green-700 p-6 flex flex-col gap-4">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-500 text-black text-xs font-bold px-3 py-0.5 rounded-full">
            Best value
          </div>
          <div>
            <div className="text-base font-bold text-white">Lifetime Pro</div>
            <div className="text-xs text-zinc-400 mt-0.5">One-time payment, forever access</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-white tabular-nums">$299</div>
            <div className="text-xs text-zinc-500 mt-0.5">
              Pays for itself in ~6 months
            </div>
          </div>
          <ul className="space-y-1.5 flex-1">
            {TIER_FEATURES.pro.map((f) => (
              <li key={f} className="flex items-start gap-2 text-xs text-zinc-300">
                <span className="text-green-400 mt-0.5 flex-shrink-0">✓</span>
                {f}
              </li>
            ))}
          </ul>
          {isLifetime ? (
            <div className="text-center text-xs font-semibold text-zinc-500 border border-zinc-700 rounded-lg py-2">
              Your plan
            </div>
          ) : (
            <LifetimeButton />
          )}
        </div>

        {/* Monthly/Annual plans */}
        <div className="grid gap-4 md:grid-cols-2">
          <PlanCard
            name="Pro"
            price={{ monthly: 50, annual: 480 }}
            description="Serious retail traders"
            features={TIER_FEATURES.pro}
            current={tier === "pro"}
            tier="pro"
            highlighted
          />
          <PlanCard
            name="Elite"
            price={{ monthly: 99, annual: 948 }}
            description="For the obsessed"
            features={TIER_FEATURES.elite}
            current={tier === "elite"}
            tier="elite"
          />
        </div>
      </div>

      {/* Billing portal for paying users */}
      {tier !== "free" && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-white">Billing &amp; invoices</div>
            <div className="text-xs text-zinc-400 mt-0.5">
              Manage your subscription, update payment method, or download invoices.
            </div>
          </div>
          <BillingPortalButton />
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
  price: { monthly: number; annual: number };
  description: string;
  features: readonly string[];
  current: boolean;
  tier: "pro" | "elite";
  highlighted?: boolean;
}) {
  return (
    <div
      className={`relative bg-zinc-900 rounded-xl border p-5 flex flex-col gap-4 ${
        highlighted
          ? "border-green-600 shadow-[0_0_24px_rgba(34,197,94,0.15)]"
          : "border-zinc-800"
      }`}
    >
      {highlighted && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-500 text-black text-xs font-bold px-3 py-0.5 rounded-full">
          Most popular
        </div>
      )}

      <div>
        <div className="text-base font-bold text-white">{name}</div>
        <div className="text-xs text-zinc-400 mt-0.5">{description}</div>
      </div>

      <div>
        <div className="text-2xl font-bold text-white tabular-nums">
          ${price.monthly}
          <span className="text-sm font-normal text-zinc-400">/mo</span>
        </div>
        <div className="text-xs text-zinc-500 mt-0.5">
          ${price.annual}/yr — save ${price.monthly * 12 - price.annual}
        </div>
      </div>

      <ul className="space-y-1.5 flex-1">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-xs text-zinc-300">
            <span className="text-green-400 mt-0.5 flex-shrink-0">✓</span>
            {f}
          </li>
        ))}
      </ul>

      {current ? (
        <div className="text-center text-xs font-semibold text-zinc-500 border border-zinc-700 rounded-lg py-2">
          Current plan
        </div>
      ) : (
        <UpgradeButtons planTier={tier} />
      )}
    </div>
  );
}
