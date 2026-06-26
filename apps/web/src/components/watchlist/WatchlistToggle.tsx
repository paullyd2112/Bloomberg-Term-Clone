"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";

export default function WatchlistToggle({
  assetType,
  identifier,
  watchlistId,
}: {
  assetType: string;
  identifier: string;
  watchlistId: number | null;
}) {
  const router  = useRouter();
  const [wid, setWid]       = useState<number | null>(watchlistId);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState("");

  async function toggle() {
    setLoading(true);
    setError("");

    if (wid) {
      const res = await fetch(`/api/watchlist?id=${wid}`, { method: "DELETE" });
      if (res.ok) {
        setWid(null);
        router.refresh();
      }
    } else {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asset_type: assetType, identifier }),
      });
      const data = await res.json();
      if (res.ok) {
        setWid(data.id);
        router.refresh();
      } else if (res.status === 403) {
        setError("Watchlist full — upgrade for unlimited");
      } else {
        setError(data.error ?? "Failed");
      }
    }

    setLoading(false);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={toggle}
        disabled={loading}
        className={`flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg border transition-colors ${
          wid
            ? "bg-emerald-500/10 border-emerald-700/30 text-emerald-400 hover:border-red-500/40 hover:text-red-400"
            : "bg-white/[0.03] border-white/[0.1] text-zinc-400 hover:border-emerald-500/40 hover:text-emerald-400"
        } disabled:opacity-50`}
      >
        <Star className="h-4 w-4" fill={wid ? "currentColor" : "none"} />
        <span>{loading ? "…" : wid ? "Watching" : "Watch"}</span>
      </button>
      {error && (
        <a href="/dashboard/upgrade" className="text-xs text-amber-400 hover:text-amber-300">
          {error}
        </a>
      )}
    </div>
  );
}
