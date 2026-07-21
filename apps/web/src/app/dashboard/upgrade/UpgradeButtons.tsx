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
  const [error, setError] = useState("");

  const planKey = PLAN_KEYS[planTier][interval];

  async function handleCheckout() {
    setLoading(true);
    setError("");
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
        setError(data.error || "Checkout failed. Please try again.");
        setLoading(false);
      }
    } catch (err) {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
          {error}
        </div>
      )}
      {/* Interval toggle */}
      <div className="flex flex-col gap-0.5 rounded-xl border border-white/[0.08] p-1">
        {INTERVALS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setInterval(id)}
            className={`w-full text-xs py-2 rounded-lg transition-all font-medium text-left px-3 ${
              interval === id
                ? "bg-white/[0.08] text-white ring-hairline"
                : "text-zinc-500 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <button
        onClick={handleCheckout}
        disabled={loading}
        className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed text-black font-bold text-sm py-3 rounded-xl transition-colors"
      >
        {loading ? "Redirecting…" : `Start ${planTier === "elite" ? "14" : "7"}-day trial →`}
      </button>
      <p className="text-center text-[11px] text-zinc-600">Credit card required. Cancel anytime.</p>
    </div>
  );
}
