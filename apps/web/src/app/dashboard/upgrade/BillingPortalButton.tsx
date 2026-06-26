"use client";

import { useState } from "react";

export default function BillingPortalButton() {
  const [loading, setLoading] = useState(false);

  async function handlePortal() {
    setLoading(true);
    try {
      const res  = await fetch("/api/stripe/portal", { method: "POST" });
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
      onClick={handlePortal}
      disabled={loading}
      className="flex-shrink-0 bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.1] disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
    >
      {loading ? "Loading…" : "Manage billing →"}
    </button>
  );
}
