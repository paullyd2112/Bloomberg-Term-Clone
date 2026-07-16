"use client";

/**
 * Interactive asset-detail card for the landing bento.
 * Starts as a static BTC snapshot; on "Connect live" it fetches the real
 * BTC quote from /api/landing-quote and redraws the chart anchored to the
 * real previous-close → current price.
 */

import { useState } from "react";
import { Wifi, Loader2 } from "lucide-react";

const RANGES = ["1D", "1W", "1M", "3M", "1Y"];

// Static fallback snapshot (shown before the user connects live data).
const SNAPSHOT = {
  price: 117842,
  change: 1.62,
};

function formatPrice(n: number) {
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Decorative starting path (matches the previous static design).
const SNAPSHOT_VALUES = [
  72, 68, 74, 60, 64, 50, 54, 40, 44, 30, 36, 22, 26, 16, 20, 10,
].map((y) => 96 - y); // convert baseline-y to "value-like" height

type Quote = { price: number; change: number; series?: number[] };

// Build a smooth intraday path (24 points) anchored at the real
// previous close and ending exactly at the current price.
function buildSeries(price: number, change: number): number[] {
  const prevClose = price / (1 + change / 100);
  const move = price - prevClose;
  const amplitude = Math.abs(move) * 0.4 + price * 0.0015;
  const n = 24;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const base = prevClose + move * t;
    // Deterministic, smooth intraday wiggle that settles to 0 at the end.
    const wiggle =
      amplitude *
      Math.sin(i * 1.7) *
      Math.cos(i * 0.6) *
      (1 - t);
    out.push(base + wiggle);
  }
  out[0] = prevClose;
  out[n - 1] = price;
  return out;
}

// Map a value series to an SVG path across the 0–300 × 0–96 viewBox.
function toPath(values: number[]): { line: string; fill: string } {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 300;
  const h = 96;
  const padY = 10;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - padY - ((v - min) / range) * (h - padY * 2);
    return [x, y] as const;
  });
  const line = pts
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const fill = `${line} L${w},${h} L0,${h} Z`;
  return { line, fill };
}

export default function AssetShot() {
  const [quote, setQuote] = useState<Quote>(SNAPSHOT);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  async function connectLive() {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/landing-quote?symbol=BTC");
      if (!res.ok) throw new Error("bad response");
      const data = (await res.json()) as {
        price: number;
        change: number;
        series?: number[];
      };
      if (typeof data.price !== "number") throw new Error("no quote");
      setQuote({
        price: data.price,
        change: data.change ?? 0,
        series: Array.isArray(data.series) ? data.series : undefined,
      });
      setLive(true);
      setUpdatedAt(
        new Date().toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          timeZone: "America/New_York",
        }) + " ET",
      );
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  const up = quote.change >= 0;
  const values = !live
    ? SNAPSHOT_VALUES
    : quote.series && quote.series.length > 2
    ? quote.series
    : buildSeries(quote.price, quote.change);
  const { line, fill } = toPath(values);
  const stroke = up ? "#10b981" : "#f87171";
  const lastPoint = (() => {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const v = values[values.length - 1];
    return 96 - 10 - ((v - min) / range) * (96 - 20);
  })();

  return (
    <div className="flex h-full flex-col bg-background p-4 text-left font-sans sm:p-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-base font-semibold text-white">
              BTC
            </span>
            <span className="rounded border border-emerald-500/30 bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-400">
              BUY
            </span>
            {live && (
              <span className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-emerald-400">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                </span>
                Live
              </span>
            )}
          </div>
          <div className="mt-0.5 text-[11px] text-zinc-500">
            Bitcoin
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-base font-semibold tabular-nums text-white">
            ${formatPrice(quote.price)}
          </div>
          <div
            className={`font-mono text-[11px] tabular-nums ${
              up ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {up ? "+" : "\u2212"}
            {Math.abs(quote.change).toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Range tabs */}
      <div className="mt-3 flex gap-1">
        {RANGES.map((r, i) => (
          <span
            key={r}
            className={`rounded px-2 py-0.5 font-mono text-[10px] ${
              i === 0 ? "bg-white/[0.08] text-white" : "text-zinc-600"
            }`}
          >
            {r}
          </span>
        ))}
      </div>

      {/* Chart */}
      <div className="mt-2 flex-1">
        <svg
          viewBox="0 0 300 96"
          preserveAspectRatio="none"
          className="h-24 w-full transition-opacity duration-500"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="assetShotFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
              <stop offset="100%" stopColor={stroke} stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* grid */}
          {[24, 48, 72].map((y) => (
            <line
              key={y}
              x1="0"
              y1={y}
              x2="300"
              y2={y}
              stroke="rgba(255,255,255,0.04)"
              strokeWidth="1"
            />
          ))}
          <path d={fill} fill="url(#assetShotFill)" />
          <path
            d={line}
            fill="none"
            stroke={stroke}
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="300" cy={lastPoint} r="2.5" fill={stroke} />
        </svg>
      </div>

      {/* AI score + stats */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="col-span-1 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2">
          <div className="font-mono text-lg font-bold tabular-nums text-emerald-400">
            82
          </div>
          <div className="text-[9px] uppercase tracking-wide text-emerald-400/70">
            Strong buy
          </div>
        </div>
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
          <div className="font-mono text-sm font-semibold tabular-nums text-white">
            2.4x
          </div>
          <div className="text-[9px] text-zinc-500">Vol ratio</div>
        </div>
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
          <div className="font-mono text-sm font-semibold tabular-nums text-white">
            74%
          </div>
          <div className="text-[9px] text-zinc-500">Win rate</div>
        </div>
      </div>

      {/* Connect-live control */}
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] text-zinc-600">
          {error
            ? "Live data unavailable — try again"
            : live
            ? `Live quote · updated ${updatedAt}`
            : "Sample data"}
        </span>
        <button
          type="button"
          onClick={connectLive}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-emerald-400 transition-colors hover:bg-emerald-500/20 disabled:opacity-60"
        >
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2.5} />
          ) : (
            <Wifi className="h-3 w-3" strokeWidth={2.5} />
          )}
          {live ? "Refresh" : "Connect live"}
        </button>
      </div>
    </div>
  );
}
