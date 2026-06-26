"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type AssetType = "stock" | "crypto" | "prediction";
type Direction = "LONG" | "SHORT" | "YES" | "NO";

export default function AddPositionForm({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [assetType, setAssetType] = useState<AssetType>("stock");
  const [identifier, setIdentifier] = useState("");
  const [direction, setDirection]   = useState<Direction>("LONG");
  const [entryPrice, setEntryPrice] = useState("");
  const [size, setSize]             = useState("");
  const [error, setError]           = useState("");
  const [loading, setLoading]       = useState(false);

  const dirOptions: Direction[] =
    assetType === "prediction" ? ["YES", "NO"] : ["LONG", "SHORT"];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/positions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        asset_type:  assetType,
        identifier,
        direction,
        entry_price: parseFloat(entryPrice),
        size:        parseFloat(size),
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Failed to add position");
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
            onChange={(e) => {
              setAssetType(e.target.value as AssetType);
              setDirection(e.target.value === "prediction" ? "YES" : "LONG");
            }}
            className="w-full bg-white/[0.04] border border-white/[0.1] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500/50"
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
            className="w-full bg-white/[0.04] border border-white/[0.1] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500/50 placeholder-zinc-500 uppercase"
          />
        </div>

        <div>
          <label className="block text-xs text-zinc-400 mb-1">Direction</label>
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value as Direction)}
            className="w-full bg-white/[0.04] border border-white/[0.1] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500/50"
          >
            {dirOptions.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-zinc-400 mb-1">
            {assetType === "prediction" ? "Entry price (0–1)" : "Entry price ($)"}
          </label>
          <input
            required
            type="number"
            step="any"
            min="0"
            value={entryPrice}
            onChange={(e) => setEntryPrice(e.target.value)}
            placeholder="0.00"
            className="w-full bg-white/[0.04] border border-white/[0.1] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500/50 placeholder-zinc-500"
          />
        </div>

        <div className="col-span-2">
          <label className="block text-xs text-zinc-400 mb-1">
            {assetType === "prediction" ? "Contracts" : "Shares / units"}
          </label>
          <input
            required
            type="number"
            step="any"
            min="0"
            value={size}
            onChange={(e) => setSize(e.target.value)}
            placeholder="1"
            className="w-full bg-white/[0.04] border border-white/[0.1] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500/50 placeholder-zinc-500"
          />
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}

      <div className="flex gap-2 justify-end">
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
          className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold text-sm px-5 py-2 rounded-lg transition-colors"
        >
          {loading ? "Adding…" : "Add position"}
        </button>
      </div>
    </form>
  );
}
