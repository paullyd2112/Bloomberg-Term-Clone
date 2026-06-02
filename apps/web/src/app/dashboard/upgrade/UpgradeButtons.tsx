"use client";

import { useState } from "react";

type PlanInterval = "monthly" | "annual";

export default function UpgradeButtons({ planTier }: { planTier: "pro" | "elite" }) {
  const [interval, setInterval] = useState<PlanInterval>("monthly");
  const [loading, setLoading] = useState(false);

  const planKey =
    planTier === "pro"
      ? interval === "monthly"
        ? "pro_monthly"
        : "pro_annual"
      : interval === "monthly"
      ? "elite_monthly"
      : "elite_annual";

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
      <div className="flex rounded-lg border border-zinc-700 p-0.5 gap-0.5">
        {(["monthly", "annual"] as PlanInterval[]).map((i) => (
          <button
            key={i}
            onClick={() => setInterval(i)}
            className={`flex-1 text-xs py-1.5 rounded-md transition-colors font-medium ${
              interval === i
                ? "bg-zinc-700 text-white"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            {i === "annual" ? "Annual (save ~20%)" : "Monthly"}
          </button>
        ))}
      </div>

      <button
        onClick={handleCheckout}
        disabled={loading}
        className="w-full bg-green-500 hover:bg-green-400 disabled:opacity-60 disabled:cursor-not-allowed text-black font-bold text-sm py-2.5 rounded-lg transition-colors"
      >
        {loading ? "Redirecting…" : "Start 7-day free trial →"}
      </button>
      <p className="text-center text-xs text-zinc-600">Credit card required. Cancel anytime.</p>
    </div>
  );
}
