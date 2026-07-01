"use client";

import { useState } from "react";
import { Zap } from "lucide-react";

export default function SkipTrialBanner() {
  const [status, setStatus] = useState<"visible" | "loading" | "done" | "dismissed">("visible");
  const [error, setError] = useState("");

  if (status === "dismissed" || status === "done") return null;

  async function handleSkip() {
    setStatus("loading");
    setError("");
    try {
      const res = await fetch("/api/stripe/skip-trial", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setStatus("done");
        window.location.reload();
      } else {
        setError(data.error || "Something went wrong.");
        setStatus("visible");
      }
    } catch {
      setError("Network error. Try again.");
      setStatus("visible");
    }
  }

  return (
    <div className="bg-emerald-500/[0.07] border border-emerald-500/20 rounded-xl p-4 flex items-center gap-4 flex-wrap">
      <div className="flex items-center gap-2.5 flex-1 min-w-0">
        <span className="flex-shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
          <Zap className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">Loving Plebs? Skip your trial.</p>
          <p className="text-xs text-zinc-400">
            Start paying now and get 20% off your first 3 months.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {error && <span className="text-xs text-red-400">{error}</span>}
        <button
          onClick={handleSkip}
          disabled={status === "loading"}
          className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-black font-bold text-xs px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
        >
          {status === "loading" ? "Activating..." : "Lock it in"}
        </button>
        <button
          onClick={() => setStatus("dismissed")}
          className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors px-2 py-2"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
