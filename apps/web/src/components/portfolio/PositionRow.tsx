"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X, Loader2 } from "lucide-react";

type Position = {
  id: number;
  asset_type: string;
  identifier: string;
  direction: string;
  entry_price: number;
  size: number;
  opened_at: string;
  closed_at: string | null;
  exit_price: number | null;
  pnl: number | null;
  current_price?: number | null;
};

const DIR_COLOR: Record<string, string> = {
  LONG:  "text-emerald-400",
  SHORT: "text-red-400",
};

export default function PositionRow({ pos }: { pos: Position }) {
  const router  = useRouter();
  const [closing, setClosing]     = useState(false);
  const [exitInput, setExitInput] = useState("");
  const [loading, setLoading]     = useState(false);
  const [removing, setRemoving]   = useState(false);

  const isOpen    = !pos.closed_at;
  const entry     = Number(pos.entry_price);
  const size      = Number(pos.size);
  const current   = pos.current_price;
  const isLong    = pos.direction === "LONG";

  const unrealizedPnl =
    isOpen && current != null
      ? isLong
        ? (current - entry) * size
        : (entry - current) * size
      : null;

  const pnlValue    = isOpen ? unrealizedPnl : pos.pnl;
  const pnlPositive = pnlValue != null && pnlValue >= 0;

  async function handleClose(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch(`/api/positions/${pos.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exit_price: parseFloat(exitInput) }),
    });
    if (res.ok) {
      router.refresh();
    }
    setLoading(false);
    setClosing(false);
  }

  async function handleDelete() {
    setRemoving(true);
    await fetch(`/api/positions/${pos.id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="px-4 py-3 border-b border-white/[0.06] last:border-0 hover:bg-white/[0.04] transition-colors group">
      <div className="flex items-center gap-3 flex-wrap">
        {/* Ticker + direction */}
        <div className="flex items-center gap-2 min-w-[110px] sm:min-w-[140px]">
          <Link
            href={`/dashboard/asset/${pos.asset_type}/${encodeURIComponent(pos.identifier)}`}
            className="font-mono font-bold text-white hover:text-emerald-400 transition-colors text-sm"
          >
            {pos.identifier}
          </Link>
          <span className={`text-xs font-bold ${DIR_COLOR[pos.direction] ?? "text-zinc-400"}`}>
            {pos.direction}
          </span>
        </div>

        {/* Entry */}
        <div className="text-xs text-zinc-500 min-w-[70px] sm:min-w-[90px]">
          <span className="text-zinc-600">Entry </span>
          <span className="font-mono text-zinc-300">
            ${entry.toLocaleString(undefined, { maximumFractionDigits: 4 })}
          </span>
        </div>

        {/* Size */}
        <div className="text-xs text-zinc-500">
          <span className="text-zinc-600">Size </span>
          <span className="font-mono text-zinc-300">{size}</span>
        </div>

        {/* Current / exit price */}
        {!isOpen && pos.exit_price != null && (
          <div className="text-xs text-zinc-500">
            <span className="text-zinc-600">Exit </span>
            <span className="font-mono text-zinc-300">
              ${Number(pos.exit_price).toLocaleString(undefined, { maximumFractionDigits: 4 })}
            </span>
          </div>
        )}

        {/* P&L */}
        {pnlValue != null && (
          <div className={`ml-auto text-sm font-bold tabular-nums ${pnlPositive ? "text-emerald-400" : "text-red-400"}`}>
            {pnlPositive ? "+" : ""}${Math.abs(pnlValue).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            {isOpen && <span className="text-xs font-normal text-zinc-600 ml-1">unrealized</span>}
          </div>
        )}

        {/* Actions */}
        {isOpen && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => setClosing(true)}
              className="text-xs text-zinc-300 hover:text-white border border-white/[0.1] hover:border-white/20 bg-white/[0.03] px-2 py-1 rounded-md transition-colors"
            >
              Close
            </button>
            <button
              onClick={handleDelete}
              disabled={removing}
              className="flex items-center justify-center text-zinc-600 hover:text-red-400 px-1 py-1 transition-colors"
            >
              {removing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <X className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        )}
      </div>

      {/* Close form */}
      {closing && (
        <form onSubmit={handleClose} className="mt-3 flex items-center gap-2">
          <input
            autoFocus
            type="number"
            step="any"
            min="0"
            required
            value={exitInput}
            onChange={(e) => setExitInput(e.target.value)}
            placeholder="Exit price"
            className="bg-white/[0.04] border border-white/[0.1] text-white text-xs rounded-lg px-3 py-1.5 w-32 focus:outline-none focus:border-emerald-500/50 placeholder-zinc-500"
          />
          <button
            type="submit"
            disabled={loading}
            className="text-xs bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            {loading ? "…" : "Confirm"}
          </button>
          <button
            type="button"
            onClick={() => setClosing(false)}
            className="text-xs text-zinc-500 hover:text-white"
          >
            Cancel
          </button>
        </form>
      )}
    </div>
  );
}
