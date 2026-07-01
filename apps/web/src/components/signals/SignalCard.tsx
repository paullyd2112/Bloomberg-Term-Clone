import Link from "next/link";
import { clsx } from "clsx";
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

const DIRECTION_TEXT: Record<string, string> = {
  BUY:  "text-emerald-400",
  SELL: "text-red-400",
  HOLD: "text-zinc-500",
};

const DIRECTION_ACCENT: Record<string, string> = {
  BUY:  "border-l-emerald-500/50 group-hover:border-l-emerald-400",
  SELL: "border-l-red-500/50 group-hover:border-l-red-400",
  HOLD: "border-l-zinc-700 group-hover:border-l-zinc-600",
};

const OUTCOME_TEXT: Record<string, string> = {
  WIN:     "text-emerald-400",
  LOSS:    "text-red-400",
  NEUTRAL: "text-zinc-400",
  PENDING: "text-zinc-700",
};

const HORIZON_SHORT: Record<string, string> = {
  intraday:     "INTRA",
  swing:        "SWING",
  longterm:     "LONG",
  before_close: "CLOSE",
};

const TYPE_LABEL: Record<string, string> = {
  stock:      "Equity",
  crypto:     "Crypto",
  prediction: "Prediction",
};

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return `${Math.floor(d / 7)}w`;
}

function confColors(c: number): { text: string; bar: string } {
  if (c >= 75) return { text: "text-emerald-400", bar: "bg-emerald-500" };
  if (c >= 50) return { text: "text-amber-400", bar: "bg-amber-500" };
  return { text: "text-zinc-500", bar: "bg-zinc-600" };
}

export default function SignalCard({ signal }: { signal: Signal }) {
  const conf = confColors(signal.confidence);
  const horizon = HORIZON_SHORT[signal.time_horizon] ?? signal.time_horizon.slice(0, 5).toUpperCase();
  const typeLabel = TYPE_LABEL[signal.asset_type] ?? signal.asset_type;
  const priceStr =
    signal.price_at_signal != null
      ? `$${Number(signal.price_at_signal).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
      : "—";

  return (
    <div
      className={clsx(
        "group relative flex items-center gap-3 sm:gap-4 border-l-2 py-3 pl-3 pr-3 sm:pl-4 sm:pr-4 transition-colors hover:bg-white/[0.025]",
        DIRECTION_ACCENT[signal.direction] ?? DIRECTION_ACCENT.HOLD,
      )}
    >
      {/* Full-row click target → signal detail (siblings with z-10 stay clickable) */}
      <Link
        href={`/signal/${signal.id}`}
        aria-label={`${signal.direction} ${signal.identifier} at ${signal.confidence}% confidence — view details`}
        className="absolute inset-0 z-0"
      />

      {/* Direction */}
      <span
        className={clsx(
          "relative z-10 w-10 flex-shrink-0 font-mono text-[11px] font-bold tracking-wide",
          DIRECTION_TEXT[signal.direction] ?? DIRECTION_TEXT.HOLD,
        )}
      >
        {signal.direction}
      </span>

      {/* Ticker + type */}
      <div className="relative z-10 flex w-[4.5rem] min-w-0 flex-shrink-0 items-baseline gap-1.5 sm:w-32">
        <Link
          href={`/dashboard/asset/${signal.asset_type}/${encodeURIComponent(signal.identifier)}`}
          className="truncate font-mono text-sm font-semibold text-white transition-colors hover:text-emerald-400"
        >
          {signal.identifier}
        </Link>
        <span className="hidden flex-shrink-0 text-[10px] uppercase tracking-wider text-zinc-600 lg:inline">
          {typeLabel}
        </span>
      </div>

      {/* Confidence */}
      <div className="relative z-10 flex w-14 flex-shrink-0 items-center gap-2 sm:w-[4.75rem]">
        <div className="hidden h-1 flex-1 overflow-hidden rounded-full bg-white/[0.08] sm:block">
          <div className={clsx("h-full rounded-full", conf.bar)} style={{ width: `${signal.confidence}%` }} />
        </div>
        <span className={clsx("font-mono text-xs font-bold tabular-nums", conf.text)}>
          {signal.confidence}
          <span className="text-[10px] font-medium opacity-60">%</span>
        </span>
      </div>

      {/* Horizon */}
      <span className="relative z-10 hidden w-14 flex-shrink-0 font-mono text-[10px] uppercase tracking-wider text-zinc-500 md:block">
        {horizon}
      </span>

      {/* Price */}
      <span className="relative z-10 hidden w-20 flex-shrink-0 text-right font-mono text-xs tabular-nums text-zinc-400 sm:block">
        {priceStr}
      </span>

      {/* Reasoning — recedes, click-through to detail via overlay */}
      <p className="min-w-0 flex-1 truncate text-[13px] leading-tight text-zinc-400">
        {signal.reasoning}
      </p>

      {/* Outcome */}
      <span
        className={clsx(
          "relative z-10 hidden w-12 flex-shrink-0 text-right font-mono text-[10px] font-semibold uppercase tracking-wider lg:block",
          OUTCOME_TEXT[signal.outcome],
        )}
        aria-hidden={signal.outcome === "PENDING"}
      >
        {signal.outcome === "PENDING" ? "" : signal.outcome}
      </span>

      {/* Timestamp */}
      <span className="relative z-10 hidden w-10 flex-shrink-0 text-right font-mono text-[10px] tabular-nums text-zinc-600 lg:block">
        {timeAgo(signal.created_at)}
      </span>

      {/* Share — floats in on hover over the timestamp */}
      <div className="absolute right-2 top-1/2 z-20 -translate-y-1/2 bg-background/80 pl-2 opacity-0 backdrop-blur-sm transition-opacity focus-within:opacity-100 group-hover:opacity-100">
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
