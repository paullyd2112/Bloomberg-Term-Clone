"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type AssetType    = "stock" | "crypto" | "prediction";
type TriggerType  = "signal_fired" | "price_threshold" | "news_drop";

const TRIGGER_LABELS: Record<TriggerType, string> = {
  signal_fired:    "New signal fires",
  price_threshold: "Price crosses threshold",
  news_drop:       "News drops",
};

const TRIGGER_DESCRIPTIONS: Record<TriggerType, string> = {
  signal_fired:    "Alert when Plebs generates a BUY or SELL signal for this asset.",
  price_threshold: "Alert when the current price reaches or exceeds your target.",
  news_drop:       "Alert when a new news item appears for this asset.",
};

export default function AddAlertForm({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [assetType, setAssetType]     = useState<AssetType>("stock");
  const [identifier, setIdentifier]   = useState("");
  const [triggerType, setTriggerType] = useState<TriggerType>("signal_fired");
  const [threshold, setThreshold]     = useState("");
  const [error, setError]             = useState("");
  const [loading, setLoading]         = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const body: Record<string, unknown> = { asset_type: assetType, identifier, trigger_type: triggerType };
    if (triggerType === "price_threshold") body.threshold = parseFloat(threshold);

    const res  = await fetch("/api/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Failed to create alert");
      setLoading(false);
      return;
    }

    router.refresh();
    onClose();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Asset type</label>
          <select
            value={assetType}
            onChange={(e) => setAssetType(e.target.value as AssetType)}
            className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded px-3 py-2 focus:outline-none focus:border-green-500"
          >
            <option value="stock">Stock</option>
            <option value="crypto">Crypto</option>
            <option value="prediction">Prediction</option>
          </select>
        </div>

        <div>
          <label className="block text-xs text-zinc-400 mb-1">Ticker</label>
          <input
            required
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value.toUpperCase())}
            placeholder="e.g. AAPL"
            maxLength={60}
            className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded px-3 py-2 focus:outline-none focus:border-green-500 placeholder-zinc-500"
          />
        </div>
      </div>

      {/* Trigger type selector */}
      <div>
        <label className="block text-xs text-zinc-400 mb-2">Alert trigger</label>
        <div className="space-y-2">
          {(Object.keys(TRIGGER_LABELS) as TriggerType[]).map((type) => (
            <label
              key={type}
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                triggerType === type
                  ? "border-green-600 bg-green-950/20"
                  : "border-zinc-800 hover:border-zinc-600"
              }`}
            >
              <input
                type="radio"
                name="trigger"
                value={type}
                checked={triggerType === type}
                onChange={() => setTriggerType(type)}
                className="mt-0.5 accent-green-500"
              />
              <div>
                <div className="text-sm font-medium text-white">{TRIGGER_LABELS[type]}</div>
                <div className="text-xs text-zinc-500 mt-0.5">{TRIGGER_DESCRIPTIONS[type]}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Threshold input for price alerts */}
      {triggerType === "price_threshold" && (
        <div>
          <label className="block text-xs text-zinc-400 mb-1">
            Price threshold ({assetType === "prediction" ? "0–1" : "$"})
          </label>
          <input
            required
            type="number"
            step="any"
            min="0"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            placeholder="0.00"
            className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded px-3 py-2 focus:outline-none focus:border-green-500 placeholder-zinc-500"
          />
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex gap-2 justify-end pt-1">
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-zinc-400 hover:text-white px-4 py-2 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="bg-green-500 hover:bg-green-400 disabled:opacity-50 text-black font-semibold text-sm px-5 py-2 rounded-lg transition-colors"
        >
          {loading ? "Creating…" : "Create alert"}
        </button>
      </div>
    </form>
  );
}
