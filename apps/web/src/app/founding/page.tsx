"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { TIER_FEATURES } from "@/lib/tier";

const PLANS = [
  {
    key:         "founding_pro" as const,
    name:        "Founding Pro",
    price:       40,
    tier:        "pro"   as const,
    highlighted: false,
    features:    TIER_FEATURES.pro,
  },
  {
    key:         "founding_elite" as const,
    name:        "Founding Elite",
    price:       80,
    tier:        "elite" as const,
    highlighted: true,
    features:    TIER_FEATURES.elite,
  },
];

function CheckoutButton({ plan, ref: influencerRef }: { plan: "founding_pro" | "founding_elite"; ref: string | null }) {
  const [loading, setLoading] = useState(false);

  async function handleCheckout() {
    setLoading(true);
    try {
      const body: Record<string, string> = { plan };
      if (influencerRef) body.ref = influencerRef;

      const res  = await fetch("/api/stripe/checkout", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setLoading(false);
      }
    } catch {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleCheckout}
      disabled={loading}
      className="w-full bg-green-500 hover:bg-green-400 disabled:opacity-60 disabled:cursor-not-allowed text-black font-bold text-sm py-3 rounded-xl transition-colors"
    >
      {loading ? "Redirecting…" : "Lock in founding price →"}
    </button>
  );
}

export default function FoundingPage() {
  const params       = useSearchParams();
  const influencerRef = params.get("ref");

  return (
    <div className="min-h-screen bg-[#09090b] flex flex-col">
      {/* Header */}
      <div className="border-b border-zinc-800/60 h-14 flex items-center px-6">
        <Link href="/">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Plebs" className="h-7 w-auto" />
        </Link>
      </div>

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold px-4 py-1.5 rounded-full mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          Founding member pricing — not available on the main site
        </div>

        <h1 className="text-3xl sm:text-4xl font-extrabold text-white text-center mb-3">
          Lock in your price. Forever.
        </h1>
        <p className="text-zinc-400 text-center max-w-md mb-2">
          Founding members pay today&apos;s price for life. When we raise prices — and we will — you never pay more.
        </p>
        <p className="text-zinc-600 text-sm text-center mb-12">
          No trial period. Access starts immediately. Cancel anytime.
        </p>

        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl">
          {PLANS.map((plan) => (
            <div
              key={plan.key}
              className={`relative rounded-xl border p-6 flex flex-col gap-5 ${
                plan.highlighted
                  ? "border-green-600 bg-green-500/5 shadow-[0_0_32px_rgba(34,197,94,0.12)]"
                  : "border-zinc-800 bg-zinc-900"
              }`}
            >
              {plan.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-500 text-black text-xs font-bold px-3 py-0.5 rounded-full">
                  Most popular
                </div>
              )}

              <div>
                <div className="text-base font-bold text-white">{plan.name}</div>
                <div className="text-xs text-zinc-500 mt-0.5 flex items-center gap-1.5">
                  <span className="text-amber-400 text-[10px] font-semibold uppercase tracking-wide">Price locked forever</span>
                </div>
              </div>

              <div>
                <div className="text-3xl font-extrabold text-white tabular-nums">
                  ${plan.price}
                  <span className="text-sm font-normal text-zinc-400">/mo</span>
                </div>
                <div className="text-xs text-zinc-600 mt-0.5">Billed monthly · Cancel anytime</div>
              </div>

              <ul className="space-y-1.5 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs text-zinc-300">
                    <span className="text-green-400 mt-0.5 flex-shrink-0">✓</span>
                    {f}
                  </li>
                ))}
              </ul>

              <CheckoutButton plan={plan.key} ref={influencerRef} />
            </div>
          ))}
        </div>

        <p className="mt-8 text-xs text-zinc-600 text-center max-w-sm">
          You&apos;ll need to create an account to complete checkout. Already have one?{" "}
          <Link href="/login" className="text-zinc-400 hover:text-white underline underline-offset-2">
            Log in first
          </Link>
          .
        </p>
        <p className="mt-3 text-[10px] text-zinc-700 text-center">
          Not financial advice. Past performance is not indicative of future results.
        </p>
      </main>
    </div>
  );
}
