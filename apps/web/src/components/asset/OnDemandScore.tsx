"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";

type Props = {
  assetType: string;
  identifier: string;
};

export default function OnDemandScore({ assetType, identifier }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    status: string;
    signal?: { direction: string; confidence: number; reasoning: string };
    error?: string;
    reason?: string;
  } | null>(null);

  async function handleScore() {
    setLoading(true);
    setResult(null);

    try {
      const resp = await fetch("/api/score-on-demand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asset_type: assetType, identifier }),
      });
      const data = await resp.json();

      if (!resp.ok) {
        setResult({ status: "error", error: data.error });
      } else {
        setResult(data);
      }
    } catch {
      setResult({ status: "error", error: "Request failed" });
    } finally {
      setLoading(false);
    }
  }

  if ((result?.status === "ok" || result?.status === "cached") && result.signal) {
    const s = result.signal;
    const color =
      s.direction === "BUY" || s.direction === "YES"
        ? "text-emerald-400"
        : s.direction === "SELL" || s.direction === "NO"
          ? "text-red-400"
          : "text-zinc-400";

    return (
      <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className={`text-sm font-bold ${color}`}>{s.direction}</span>
          <span className="text-xs text-zinc-400">{s.confidence}% confidence</span>
        </div>
        <p className="text-xs text-zinc-300 leading-relaxed">{s.reasoning}</p>
        {result.status === "cached" && (
          <p className="text-[11px] text-zinc-600">From recent analysis</p>
        )}
      </div>
    );
  }

  return (
    <div className="text-center py-6 space-y-3">
      <p className="text-sm text-zinc-500">No signals yet for this ticker.</p>
      <button
        onClick={handleScore}
        disabled={loading}
        className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-700 disabled:text-zinc-500 text-black text-xs font-semibold rounded-lg transition-colors"
      >
        <Sparkles className="h-3.5 w-3.5" />
        {loading ? "Analyzing..." : "Generate AI Signal"}
      </button>
      {result?.status === "error" && (
        <p className="text-xs text-red-400">{result.error}</p>
      )}
      {result?.status === "no_signal" && (
        <p className="text-xs text-zinc-500">{result.reason}</p>
      )}
    </div>
  );
}
