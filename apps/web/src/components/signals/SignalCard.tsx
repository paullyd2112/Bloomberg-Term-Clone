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
  BUY:  "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  YES:  "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  SELL: "bg-red-500/15 text-red-400 border-red-500/30",
  NO:   "bg-red-500/15 text-red-400 border-red-500/30",
  HOLD: "bg-white/[0.06] text-zinc-400 border-white/10",
};

const OUTCOME_STYLE: Record<string, string> = {
  WIN:     "text-emerald-400",
  LOSS:    "text-red-400",
  NEUTRAL: "text-zinc-400",
  PENDING: "text-zinc-600",
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
    <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl p-5 space-y-3 hover:bg-white/[0.05] hover:border-white/[0.1] transition-all">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className={clsx(
              "flex-shrink-0 text-xs font-bold px-2.5 py-1 rounded-lg border",
              dirStyle,
            )}
          >
            {signal.direction}
          </span>
          <Link
            href={`/dashboard/asset/${signal.asset_type}/${encodeURIComponent(signal.identifier)}`}
            className="font-mono font-semibold text-white hover:text-emerald-400 truncate transition-colors"
          >
            {signal.identifier}
          </Link>
          <span className="text-[11px] text-zinc-600 capitalize hidden sm:block">
            {signal.asset_type}
          </span>
        </div>

        <div className="flex items-center gap-2.5 flex-shrink-0">
          {signal.outcome !== "PENDING" && (
            <span className={clsx("text-xs font-medium", OUTCOME_STYLE[signal.outcome])}>
              {signal.outcome}
            </span>
          )}
          <span className="text-[11px] text-zinc-600">{timeAgo}</span>
        </div>
      </div>

      {/* Confidence bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className={clsx(
              "h-full rounded-full transition-all",
              signal.confidence >= 75
                ? "bg-emerald-500"
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

      {/* Reasoning — clickable to asset page */}
      <Link
        href={`/dashboard/asset/${signal.asset_type}/${encodeURIComponent(signal.identifier)}`}
        className="block text-sm text-zinc-300 leading-relaxed line-clamp-3 hover:text-zinc-100 transition-colors cursor-pointer"
      >
        {signal.reasoning}
      </Link>

      {/* News context */}
      {signal.news_context && signal.news_context.length > 0 && (
        <div className="space-y-1">
          {signal.news_context.slice(0, 3).map((item, i) => (
            <p key={i} className="text-[11px] text-zinc-500 leading-snug truncate">
              • {item}
            </p>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-zinc-500">
            {HORIZON_LABEL[signal.time_horizon] ?? signal.time_horizon}
          </span>
          {signal.price_at_signal && (
            <span className="text-[11px] text-zinc-500 font-mono">
              @ {signal.asset_type === "prediction"
                  ? `${(signal.price_at_signal * 100).toFixed(1)}%`
                  : `$${Number(signal.price_at_signal).toLocaleString()}`}
            </span>
          )}
        </div>
        <ShareButton signalId={signal.id} />
      </div>

      {/* Disclaimer */}
      <p className="text-[10px] text-zinc-700 leading-tight">
        AI analysis only — not financial advice. Do your own research.
      </p>
    </div>
  );
}
