"use client";

import { useState } from "react";

type PlanInterval = "monthly" | "quarterly";

const INTERVALS: { id: PlanInterval; label: string }[] = [
  { id: "monthly",   label: "Monthly" },
  { id: "quarterly", label: "Quarterly (save 17%)" },
];

const PLAN_KEYS: Record<"pro" | "elite", Record<PlanInterval, string>> = {
  pro:   { monthly: "pro_monthly",   quarterly: "pro_quarterly" },
  elite: { monthly: "elite_monthly", quarterly: "elite_quarterly" },
};

export default function UpgradeButtons({ planTier }: { planTier: "pro" | "elite" }) {
  const [interval, setInterval] = useState<PlanInterval>("monthly");
  const [loading, setLoading] = useState(false);

  const planKey = PLAN_KEYS[planTier][interval];

  async function handleCheckout() {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planKey }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        console.error("Checkout error:", data.error);
        setLoading(false);
      }
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      {/* Interval toggle */}
      <div className="flex flex-col gap-0.5 rounded-lg border border-zinc-700 p-0.5">
        {INTERVALS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setInterval(id)}
            className={`w-full text-xs py-1.5 rounded-md transition-colors font-medium text-left px-2 ${
              interval === id
                ? "bg-zinc-700 text-white"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <button
        onClick={handleCheckout}
        disabled={loading}
        className="w-full bg-green-500 hover:bg-green-400 disabled:opacity-60 disabled:cursor-not-allowed text-black font-bold text-sm py-2.5 rounded-lg transition-colors"
      >
        {loading ? "Redirecting…" : "Start 14-day free trial →"}
      </button>
      <p className="text-center text-xs text-zinc-600">Credit card required. Cancel anytime.</p>
    </div>
  );
}
