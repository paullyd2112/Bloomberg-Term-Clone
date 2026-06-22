"use client";

import { useState } from "react";

export default function LifetimeButton({
  plan,
}: {
  plan: "lifetime_pro" | "lifetime_elite";
}) {
  const [loading, setLoading] = useState(false);

  async function handleCheckout() {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
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
    <button
      onClick={handleCheckout}
      disabled={loading}
      className="w-full bg-green-500 hover:bg-green-400 disabled:opacity-60 disabled:cursor-not-allowed text-black font-bold text-sm py-2.5 rounded-lg transition-colors"
    >
      {loading ? "Redirecting…" : "Get lifetime access →"}
    </button>
  );
}
