"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { Trophy } from "lucide-react";

type Props = {
  signalId: number;
  assetType: string;
  identifier: string;
  direction: string;
  entryPrice: number | null;
  tradeSetup?: {
    stop_loss?: number;
    take_profit?: number;
    units?: number;
    risk_dollars?: number;
  } | null;
};

export default function ChallengeTradeButton({
  signalId,
  assetType,
  identifier,
  direction,
  entryPrice,
  tradeSetup,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<"success" | "error" | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  async function recordTrade() {
    if (!entryPrice) return;
    setLoading(true);
    setResult(null);

    const riskDollars = tradeSetup?.risk_dollars ?? Math.abs(entryPrice * (tradeSetup?.units ?? 1) * 0.02);
    const size = tradeSetup?.units ?? 1;

    try {
      const res = await fetch("/api/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "record_trade",
          signal_id: signalId,
          asset_type: assetType,
          identifier,
          direction,
          entry_price: entryPrice,
          size,
          risk_dollars: Math.round(riskDollars * 100) / 100,
          stop_loss: tradeSetup?.stop_loss ?? null,
          take_profit: tradeSetup?.take_profit ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult("error");
        setErrorMsg(data.error || "Failed");
        return;
      }
      setResult("success");
    } catch {
      setResult("error");
      setErrorMsg("Network error");
    } finally {
      setLoading(false);
    }
  }

  if (result === "success") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 px-2 py-1">
        <Trophy className="h-3 w-3" /> Logged
      </span>
    );
  }

  return (
    <button
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); recordTrade(); }}
      disabled={loading || !entryPrice}
      title={result === "error" ? errorMsg : "Record trade to active challenge"}
      className={clsx(
        "relative z-20 inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded transition-colors",
        result === "error"
          ? "text-red-400 hover:text-red-300"
          : "text-amber-400 hover:text-amber-300",
        loading && "opacity-50",
      )}
    >
      <Trophy className="h-3 w-3" />
      {loading ? "..." : result === "error" ? "Retry" : "Challenge"}
    </button>
  );
}
