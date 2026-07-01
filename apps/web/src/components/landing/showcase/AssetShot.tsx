/**
 * Static asset-detail mockup with a price area chart and AI score.
 * Presentational only — used inside the landing bento grid.
 */

const RANGES = ["1D", "1W", "1M", "3M", "1Y"];

// Smoothed price path (decorative area chart, not real market data).
const AREA_PATH =
  "M0,72 L20,68 L40,74 L60,60 L80,64 L100,50 L120,54 L140,40 L160,44 L180,30 L200,36 L220,22 L240,26 L260,16 L280,20 L300,10";
const FILL_PATH = `${AREA_PATH} L300,96 L0,96 Z`;

export default function AssetShot() {
  return (
    <div className="flex h-full flex-col bg-background p-4 text-left font-sans sm:p-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-base font-semibold text-white">
              NVDA
            </span>
            <span className="rounded border border-emerald-500/30 bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-400">
              BUY
            </span>
          </div>
          <div className="mt-0.5 text-[11px] text-zinc-500">
            NVIDIA Corporation
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-base font-semibold tabular-nums text-white">
            $138.42
          </div>
          <div className="font-mono text-[11px] tabular-nums text-emerald-400">
            +2.34%
          </div>
        </div>
      </div>

      {/* Range tabs */}
      <div className="mt-3 flex gap-1">
        {RANGES.map((r, i) => (
          <span
            key={r}
            className={`rounded px-2 py-0.5 font-mono text-[10px] ${
              i === 3
                ? "bg-white/[0.08] text-white"
                : "text-zinc-600"
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
          className="h-24 w-full"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="assetShotFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
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
          <path d={FILL_PATH} fill="url(#assetShotFill)" />
          <path
            d={AREA_PATH}
            fill="none"
            stroke="#10b981"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="300" cy="10" r="2.5" fill="#34d399" />
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
            71%
          </div>
          <div className="text-[9px] text-zinc-500">Win rate</div>
        </div>
      </div>
    </div>
  );
}
