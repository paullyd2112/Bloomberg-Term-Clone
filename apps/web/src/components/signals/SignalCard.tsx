import Link from "next/link";
import { clsx } from "clsx";
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
  // Prediction-market signals only: raw_prices.metadata.title, joined in at
  // fetch time since `identifier` is a Polymarket conditionId (a long hex
  // hash), not a human-readable name.
  market_title?: string | null;
  // Unrealized P&L for PENDING signals: % change from entry to current price.
  unrealized_pnl?: number | null;
};

const DIRECTION_TEXT: Record<string, string> = {
  BUY:  "text-emerald-400",
  SELL: "text-red-400",
  HOLD: "text-zinc-500",
  YES:  "text-emerald-400",
  NO:   "text-red-400",
};

const DIRECTION_ACCENT: Record<string, string> = {
  BUY:  "border-l-emerald-500/50 group-hover:border-l-emerald-400",
  SELL: "border-l-red-500/50 group-hover:border-l-red-400",
  HOLD: "border-l-zinc-700 group-hover:border-l-zinc-600",
  YES:  "border-l-emerald-500/50 group-hover:border-l-emerald-400",
  NO:   "border-l-red-500/50 group-hover:border-l-red-400",
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
  const isPrediction = signal.asset_type === "prediction";
  // Polymarket identifiers are conditionId hex hashes, not readable names —
  // show the market question instead wherever a "ticker" would normally go.
  const displayName = isPrediction && signal.market_title ? signal.market_title : signal.identifier;
  const priceStr = isPrediction
    ? signal.price_at_signal != null
      ? `${(Number(signal.price_at_signal) * 100).toFixed(0)}¢`
      : "—"
    : signal.price_at_signal != null
    ? `$${Number(signal.price_at_signal).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
    : "—";

  return (
    <>
      {/* Mobile: stacked mini-card */}
      <div
        className={clsx(
          "group relative sm:hidden border-l-2 px-3 py-3 transition-colors hover:bg-white/[0.025]",
          DIRECTION_ACCENT[signal.direction] ?? DIRECTION_ACCENT.HOLD,
        )}
      >
        <Link
          href={`/signal/${signal.id}`}
          aria-label={`${signal.direction} ${displayName} at ${signal.confidence}% confidence — view details`}
          className="absolute inset-0 z-0"
        />

        {/* Row 1: direction + ticker + confidence */}
        <div className="relative z-10 flex items-center gap-2 mb-1.5">
          <span
            className={clsx(
              "font-mono text-[11px] font-bold tracking-wide flex-shrink-0",
              DIRECTION_TEXT[signal.direction] ?? DIRECTION_TEXT.HOLD,
            )}
          >
            {signal.direction}
          </span>
          <Link
            href={`/dashboard/asset/${signal.asset_type}/${encodeURIComponent(signal.identifier)}`}
            title={isPrediction ? displayName : undefined}
            className={clsx(
              "relative z-10 font-semibold text-white transition-colors hover:text-emerald-400 min-w-0",
              isPrediction
                ? "text-xs leading-snug line-clamp-1"
                : "truncate font-mono text-sm",
            )}
          >
            {displayName}
          </Link>
          <span className={clsx("ml-auto font-mono text-xs font-bold tabular-nums flex-shrink-0", conf.text)}>
            {signal.confidence}%
          </span>
        </div>

        {/* Row 2: reasoning */}
        <p className="relative z-10 text-[12px] leading-snug text-zinc-400 line-clamp-2 mb-1.5">
          {signal.reasoning}
        </p>

        {/* Row 3: meta chips */}
        <div className="relative z-10 flex items-center gap-2 text-[10px] text-zinc-600">
          <span className="font-mono tabular-nums">{priceStr}</span>
          <span>·</span>
          <span className="font-mono uppercase tracking-wider">{horizon}</span>
          <span>·</span>
          <span className="font-mono tabular-nums">{timeAgo(signal.created_at)}</span>
          {signal.outcome !== "PENDING" && (
            <>
              <span>·</span>
              <span className={clsx("font-mono font-semibold uppercase", OUTCOME_TEXT[signal.outcome])}>
                {signal.outcome}
              </span>
            </>
          )}
          {signal.outcome === "PENDING" && signal.unrealized_pnl != null && (
            <>
              <span>·</span>
              <span className={clsx("font-mono font-semibold", signal.unrealized_pnl >= 0 ? "text-emerald-400" : "text-red-400")}>
                {signal.unrealized_pnl >= 0 ? "+" : ""}{signal.unrealized_pnl.toFixed(1)}%
              </span>
            </>
          )}
        </div>
      </div>

      {/* Desktop: dense table row */}
      <div
        className={clsx(
          "group relative hidden sm:flex items-center gap-4 border-l-2 py-3 pl-4 pr-4 transition-colors hover:bg-white/[0.025]",
          DIRECTION_ACCENT[signal.direction] ?? DIRECTION_ACCENT.HOLD,
        )}
      >
        <Link
          href={`/signal/${signal.id}`}
          aria-label={`${signal.direction} ${displayName} at ${signal.confidence}% confidence — view details`}
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
        <div className={clsx(
          "relative z-10 flex min-w-0 items-baseline gap-1.5",
          isPrediction ? "flex-1 max-w-[22rem]" : "w-32 flex-shrink-0",
        )}>
          <Link
            href={`/dashboard/asset/${signal.asset_type}/${encodeURIComponent(signal.identifier)}`}
            title={isPrediction ? displayName : undefined}
            className={clsx(
              "font-semibold text-white transition-colors hover:text-emerald-400",
              isPrediction
                ? "text-xs leading-snug line-clamp-2"
                : "truncate font-mono text-sm",
            )}
          >
            {displayName}
          </Link>
          <span className="relative z-10 hidden flex-shrink-0 text-[10px] uppercase tracking-wider text-white lg:inline">
            {typeLabel}
          </span>
        </div>

        {/* Confidence */}
        <div className="relative z-10 flex w-[4.75rem] flex-shrink-0 items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
            <div className={clsx("h-full rounded-full", conf.bar)} style={{ width: `${signal.confidence}%` }} />
          </div>
          <span className={clsx("font-mono text-xs font-bold tabular-nums", conf.text)}>
            {signal.confidence}
            <span className="text-[10px] font-medium opacity-60">%</span>
          </span>
        </div>

        {/* Horizon */}
        <span className="relative z-10 hidden w-14 flex-shrink-0 font-mono text-[10px] uppercase tracking-wider text-white md:block">
          {horizon}
        </span>

        {/* Price */}
        <span className="relative z-10 w-20 flex-shrink-0 text-right font-mono text-xs tabular-nums text-white">
          {priceStr}
        </span>

        {/* Reasoning */}
        <p className="relative z-10 min-w-0 flex-1 truncate text-[13px] leading-tight text-white">
          {signal.reasoning}
        </p>

        {/* Outcome / Unrealized P&L */}
        <span
          className={clsx(
            "relative z-10 hidden flex-shrink-0 text-right font-mono text-[10px] font-semibold uppercase tracking-wider lg:block",
            signal.outcome === "PENDING" && signal.unrealized_pnl != null
              ? signal.unrealized_pnl >= 0 ? "w-14 text-emerald-400" : "w-14 text-red-400"
              : clsx("w-12", OUTCOME_TEXT[signal.outcome]),
          )}
        >
          {signal.outcome === "PENDING"
            ? signal.unrealized_pnl != null
              ? `${signal.unrealized_pnl >= 0 ? "+" : ""}${signal.unrealized_pnl.toFixed(1)}%`
              : ""
            : signal.outcome}
        </span>

        {/* Timestamp */}
        <span className="relative z-10 hidden w-10 flex-shrink-0 text-right font-mono text-[10px] tabular-nums text-white lg:block">
          {timeAgo(signal.created_at)}
        </span>

        {/* Share */}
        <div className="absolute right-2 top-1/2 z-20 -translate-y-1/2 bg-background/80 pl-2 opacity-0 backdrop-blur-sm transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <ShareButton
            signalId={signal.id}
            ticker={displayName}
            direction={signal.direction}
            confidence={signal.confidence}
          />
        </div>
      </div>
    </>
  );
}
