"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Zap, Target, Newspaper, X, Loader2, type LucideIcon } from "lucide-react";

type Alert = {
  id: number;
  asset_type: string;
  identifier: string;
  trigger_type: "signal_fired" | "price_threshold" | "news_drop";
  threshold: number | null;
  is_active: boolean;
  created_at: string;
  last_fired_at: string | null;
};

const TRIGGER_ICON: Record<string, LucideIcon> = {
  signal_fired:    Zap,
  price_threshold: Target,
  news_drop:       Newspaper,
};

const TRIGGER_LABEL: Record<string, string> = {
  signal_fired:    "Signal fires",
  price_threshold: "Price threshold",
  news_drop:       "News drop",
};

export default function AlertRow({ alert }: { alert: Alert }) {
  const router  = useRouter();
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleToggle() {
    setToggling(true);
    await fetch(`/api/alerts/${alert.id}`, { method: "PATCH" });
    router.refresh();
    setToggling(false);
  }

  async function handleDelete() {
    setDeleting(true);
    await fetch(`/api/alerts/${alert.id}`, { method: "DELETE" });
    router.refresh();
  }

  const Icon = TRIGGER_ICON[alert.trigger_type];

  return (
    <div className={`flex items-center gap-3 px-4 py-3 border-b border-white/[0.06] last:border-0 group transition-colors hover:bg-white/[0.03] ${alert.is_active ? "" : "opacity-50"}`}>
      {/* Icon */}
      <span className="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04] text-emerald-400">
        <Icon className="h-4 w-4" />
      </span>

      {/* Asset */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/dashboard/asset/${alert.asset_type}/${encodeURIComponent(alert.identifier)}`}
            className="font-mono font-semibold text-white text-sm hover:text-emerald-400 transition-colors"
          >
            {alert.identifier}
          </Link>
          <span className="text-xs text-zinc-500 capitalize">{alert.asset_type}</span>
          <span className="text-xs text-zinc-600">·</span>
          <span className="text-xs text-zinc-500">{TRIGGER_LABEL[alert.trigger_type]}</span>
          {alert.trigger_type === "price_threshold" && alert.threshold != null && (
            <span className="text-xs font-mono text-zinc-400">
              @ {alert.asset_type === "prediction"
                  ? `${(alert.threshold * 100).toFixed(1)}%`
                  : `$${Number(alert.threshold).toLocaleString()}`}
            </span>
          )}
        </div>
        <div className="text-xs text-zinc-600 mt-0.5">
          {alert.last_fired_at
            ? `Last fired ${formatDistanceToNow(new Date(alert.last_fired_at), { addSuffix: true })}`
            : "Never fired"}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={handleToggle}
          disabled={toggling}
          className={`text-xs font-medium px-2.5 py-1 rounded-md border transition-colors ${
            alert.is_active
              ? "border-emerald-700/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
              : "border-white/[0.1] text-zinc-500 hover:border-white/20 hover:text-zinc-300"
          } disabled:opacity-50`}
        >
          {toggling ? "…" : alert.is_active ? "Active" : "Paused"}
        </button>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="flex items-center justify-center opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all px-1"
        >
          {deleting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <X className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}
