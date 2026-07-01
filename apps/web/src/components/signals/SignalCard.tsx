import Link from "next/link";
import { clsx } from "clsx";
import { formatDistanceToNow } from "date-fns";
import ShareButton from "./ShareButton";

export type Signal = {
  id: number;
  asset_type: string;
  identifier: string;
  direction: "BUY" | "SELL" | "HOLD";
  confidence: number;
  reasoning: string;
  time_horizon: string;
  price_at_signal: number | null;
  news_context: string[] | null;
  created_at: string;
  outcome: "WIN" | "LOSS" | "NEUTRAL" | "PENDING";
};

const DIRECTION_STYLE: Record<string, string> = {
  BUY:  "text-emerald-400",
  SELL: "text-red-400",
  HOLD: "text-zinc-500",
};

const OUTCOME_STYLE: Record<string, string> = {
  WIN:     "text-emerald-400",
  LOSS:    "text-red-400",
  NEUTRAL: "text-zinc-400",
  PENDING: "text-zinc-700",
};

const HORIZON_LABEL: Record<string, string> = {
  intraday:     "INTRA",
  swing:        "SWING",
  longterm:     "LONG",
  before_close: "CLOSE",
};

function confidenceColor(c: number): string {
  return c >= 75 ? "text-emerald-400" : c >= 50 ? "text-amber-400" : "text-zinc-500";
}

export default function SignalCard({ signal }: { signal: Signal }) {
  const dirStyle = DIRECTION_STYLE[signal.direction] ?? DIRECTION_STYLE.HOLD;
  const timeAgo  = formatDistanceToNow(new Date(signal.created_at), { addSuffix: true });

  return (
    <div className="group flex items-center gap-3 px-3 py-2.5 border-b border-white/[0.05] last:border-b-0 hover:bg-white/[0.03] transition-colors">
      <span className={clsx("w-9 flex-shrink-0 text-xs font-bold tabular-nums", dirStyle)}>
        {signal.direction}
      </span>

      <Link
        href={`/dashboard/asset/${signal.asset_type}/${encodeURIComponent(signal.identifier)}`}
        className="w-20 flex-shrink-0 font-mono font-semibold text-white hover:text-emerald-400 truncate transition-colors"
      >
        {signal.identifier}
      </Link>

      <span
        className={clsx(
          "w-10 flex-shrink-0 text-xs font-mono tabular-nums text-right",
          confidenceColor(signal.confidence),
        )}
      >
        {signal.confidence}%
      </span>

      <span className="w-12 flex-shrink-0 text-[10px] font-mono text-zinc-600 tracking-wide hidden sm:block">
        {HORIZON_LABEL[signal.time_horizon] ?? signal.time_horizon}
      </span>

      {signal.price_at_signal != null && (
        <span className="w-20 flex-shrink-0 text-xs font-mono text-zinc-500 text-right hidden sm:block">
          ${Number(signal.price_at_signal).toLocaleString()}
        </span>
      )}

      <Link
        href={`/signal/${signal.id}`}
        className="flex-1 min-w-0 text-sm text-zinc-400 truncate hover:text-zinc-200 transition-colors"
      >
        {signal.reasoning}
      </Link>

      {signal.outcome !== "PENDING" && (
        <span
          className={clsx(
            "w-14 flex-shrink-0 text-[11px] font-medium text-right hidden md:block",
            OUTCOME_STYLE[signal.outcome],
          )}
        >
          {signal.outcome}
        </span>
      )}

      <span className="w-16 flex-shrink-0 text-[11px] text-zinc-600 text-right hidden lg:block">
        {timeAgo}
      </span>

      <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <ShareButton
          signalId={signal.id}
          ticker={signal.identifier}
          direction={signal.direction}
          confidence={signal.confidence}
        />
      </div>
    </div>
  );
}
