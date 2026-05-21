import Link from "next/link";
import { clsx } from "clsx";
import { formatDistanceToNow } from "date-fns";
import ShareButton from "./ShareButton";

export type Signal = {
  id: number;
  asset_type: string;
  identifier: string;
  direction: "BUY" | "SELL" | "HOLD" | "YES" | "NO";
  confidence: number;
  reasoning: string;
  time_horizon: string;
  price_at_signal: number | null;
  news_context: string[] | null;
  created_at: string;
  outcome: "WIN" | "LOSS" | "NEUTRAL" | "PENDING";
};

const DIRECTION_STYLE: Record<string, string> = {
  BUY:  "bg-green-500/20 text-green-400 border-green-700",
  YES:  "bg-green-500/20 text-green-400 border-green-700",
  SELL: "bg-red-500/20 text-red-400 border-red-700",
  NO:   "bg-red-500/20 text-red-400 border-red-700",
  HOLD: "bg-zinc-700/40 text-zinc-400 border-zinc-600",
};

const OUTCOME_STYLE: Record<string, string> = {
  WIN:     "text-green-400",
  LOSS:    "text-red-400",
  NEUTRAL: "text-zinc-400",
  PENDING: "text-zinc-500",
};

const HORIZON_LABEL: Record<string, string> = {
  intraday:     "Intraday",
  swing:        "Swing",
  longterm:     "Long-term",
  before_close: "Before close",
};

export default function SignalCard({ signal }: { signal: Signal }) {
  const dirStyle = DIRECTION_STYLE[signal.direction] ?? DIRECTION_STYLE.HOLD;
  const timeAgo  = formatDistanceToNow(new Date(signal.created_at), { addSuffix: true });

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3 hover:border-zinc-700 transition-colors">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={clsx(
              "flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded border",
              dirStyle,
            )}
          >
            {signal.direction}
          </span>
          <Link
            href={`/dashboard/asset/${signal.asset_type}/${encodeURIComponent(signal.identifier)}`}
            className="font-mono font-semibold text-white hover:text-green-400 truncate transition-colors"
          >
            {signal.identifier}
          </Link>
          <span className="text-xs text-zinc-500 capitalize hidden sm:block">
            {signal.asset_type}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {signal.outcome !== "PENDING" && (
            <span className={clsx("text-xs font-medium", OUTCOME_STYLE[signal.outcome])}>
              {signal.outcome}
            </span>
          )}
          <span className="text-xs text-zinc-500">{timeAgo}</span>
        </div>
      </div>

      {/* Confidence bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={clsx(
              "h-full rounded-full transition-all",
              signal.confidence >= 75
                ? "bg-green-500"
                : signal.confidence >= 50
                ? "bg-amber-500"
                : "bg-zinc-500",
            )}
            style={{ width: `${signal.confidence}%` }}
          />
        </div>
        <span className="text-xs text-zinc-400 w-8 text-right tabular-nums">
          {signal.confidence}%
        </span>
      </div>

      {/* Reasoning */}
      <p className="text-sm text-zinc-300 leading-relaxed line-clamp-3">
        {signal.reasoning}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500">
            {HORIZON_LABEL[signal.time_horizon] ?? signal.time_horizon}
          </span>
          {signal.price_at_signal && (
            <span className="text-xs text-zinc-500 font-mono">
              @ {signal.asset_type === "prediction"
                  ? `${(signal.price_at_signal * 100).toFixed(1)}%`
                  : `$${Number(signal.price_at_signal).toLocaleString()}`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {signal.news_context && signal.news_context.length > 0 && (
            <span className="text-xs text-zinc-600">
              {signal.news_context.length} news item{signal.news_context.length > 1 ? "s" : ""}
            </span>
          )}
          <ShareButton signalId={signal.id} />
        </div>
      </div>
    </div>
  );
}
