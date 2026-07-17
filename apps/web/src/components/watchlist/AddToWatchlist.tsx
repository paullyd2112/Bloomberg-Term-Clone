"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, ArrowRight } from "lucide-react";

type AssetType = "stock" | "crypto";

export default function AddToWatchlist({
  onAdded,
  disabled,
  limitReached,
}: {
  onAdded?: () => void;
  disabled?: boolean;
  limitReached?: boolean;
}) {
  const router   = useRouter();
  const [open, setOpen]           = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [assetType, setAssetType] = useState<AssetType>("stock");
  const [error, setError]         = useState("");
  const [loading, setLoading]     = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, asset_type: assetType }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Failed to add");
      setLoading(false);
      return;
    }

    setIdentifier("");
    setOpen(false);
    setLoading(false);
    router.refresh();
    onAdded?.();
  }

  if (limitReached) {
    return (
      <a
        href="/dashboard/upgrade"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400 hover:text-amber-300 border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 rounded-lg transition-colors"
      >
        Upgrade for unlimited watchlist
        <ArrowRight className="h-3 w-3" />
      </a>
    );
  }

  return (
    <div className="relative">
      {!open ? (
        <button
          disabled={disabled}
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 text-xs font-medium text-zinc-300 hover:text-white border border-white/[0.1] hover:border-white/20 bg-white/[0.03] hover:bg-white/[0.06] px-3 py-1.5 rounded-lg transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> Add asset
        </button>
      ) : (
        <form onSubmit={handleAdd} className="flex items-center gap-2 flex-wrap">
          <select
            value={assetType}
            onChange={(e) => setAssetType(e.target.value as AssetType)}
            className="bg-white/[0.04] border border-white/[0.1] text-white text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-emerald-500/50"
          >
            <option value="crypto">Crypto</option>
            <option value="prediction">Prediction</option>
          </select>

          <input
            autoFocus
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="e.g. BTC"
            className="bg-white/[0.04] border border-white/[0.1] text-white text-xs rounded-lg px-2 py-1.5 w-28 focus:outline-none focus:border-emerald-500/50 placeholder-zinc-500 uppercase"
            maxLength={60}
            required
          />

          <button
            type="submit"
            disabled={loading}
            className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            {loading ? "…" : "Add"}
          </button>
          <button
            type="button"
            onClick={() => { setOpen(false); setError(""); }}
            className="text-zinc-500 hover:text-white text-xs px-1"
          >
            Cancel
          </button>

          {error && <span className="text-red-400 text-xs w-full">{error}</span>}
        </form>
      )}
    </div>
  );
}
