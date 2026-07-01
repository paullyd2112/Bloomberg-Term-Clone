/**
 * Pixel-accurate static mockup of the Plebs dashboard interior.
 * Presentational only — mirrors the real signal feed styling.
 */

const NAV = [
  { label: "Signals", active: true },
  { label: "Congress", active: false },
  { label: "Options", active: false },
  { label: "Screener", active: false },
  { label: "Briefing", active: false },
];

const STATS = [
  { label: "Win rate", value: "68%", tone: "up" as const },
  { label: "Signals today", value: "24" },
  { label: "Avg confidence", value: "74%" },
  { label: "Open positions", value: "12" },
];

const SIGNALS = [
  {
    dir: "BUY",
    tone: "up" as const,
    symbol: "NVDA",
    asset: "Equity",
    confidence: 86,
    reasoning:
      "Accelerating datacenter demand and options flow skewed heavily to calls into earnings.",
    horizon: "Swing",
    price: "$138.42",
    time: "2m ago",
    outcome: "WIN",
  },
  {
    dir: "SELL",
    tone: "down" as const,
    symbol: "TSLA",
    asset: "Equity",
    confidence: 71,
    reasoning:
      "Deliveries miss and deteriorating margins; momentum rolling over below the 50-day.",
    horizon: "Intraday",
    price: "$246.10",
    time: "8m ago",
    outcome: "PENDING",
  },
  {
    dir: "YES",
    tone: "up" as const,
    symbol: "FED-CUT-MAR",
    asset: "Prediction",
    confidence: 63,
    reasoning:
      "Softening CPI print and dovish commentary repricing March odds higher.",
    horizon: "Long-term",
    price: "41.0%",
    time: "15m ago",
    outcome: "PENDING",
  },
];

function DirBadge({ dir, tone }: { dir: string; tone: "up" | "down" }) {
  return (
    <span
      className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-md border font-mono ${
        tone === "up"
          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
          : "bg-red-500/15 text-red-400 border-red-500/30"
      }`}
    >
      {dir}
    </span>
  );
}

export default function DashboardShot() {
  return (
    <div className="flex bg-background font-sans text-left">
      {/* Sidebar rail */}
      <aside className="hidden sm:flex w-40 flex-shrink-0 flex-col gap-1 border-r border-white/[0.06] bg-white/[0.01] p-3">
        <div className="flex items-center gap-2 px-2 pb-3">
          <span className="h-4 w-4 rounded bg-emerald-500" />
          <span className="font-semibold text-sm text-white">Plebs</span>
        </div>
        {NAV.map((item) => (
          <div
            key={item.label}
            className={`relative flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] ${
              item.active
                ? "bg-white/[0.05] text-white"
                : "text-zinc-500"
            }`}
          >
            {item.active && (
              <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-emerald-400" />
            )}
            <span className="h-3 w-3 rounded-sm bg-white/10" />
            {item.label}
          </div>
        ))}
      </aside>

      {/* Main column */}
      <div className="min-w-0 flex-1 p-4 sm:p-5">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-emerald-400 text-[10px] leading-none">●</span>
            <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Latest signals
            </h3>
          </div>
          <span className="font-mono text-[10px] text-zinc-600">
            Updated 8:45a ET
          </span>
        </div>

        {/* Stat tiles */}
        <div className="mb-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {STATS.map((s) => (
            <div
              key={s.label}
              className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
            >
              <div
                className={`font-mono text-base font-semibold tabular-nums ${
                  s.tone === "up" ? "text-emerald-400" : "text-white"
                }`}
              >
                {s.value}
              </div>
              <div className="text-[10px] text-zinc-500">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Signal cards */}
        <div className="space-y-2">
          {SIGNALS.map((sig) => (
            <div
              key={sig.symbol}
              className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <DirBadge dir={sig.dir} tone={sig.tone} />
                  <span className="font-mono font-semibold text-white text-[13px] truncate">
                    {sig.symbol}
                  </span>
                  <span className="text-[10px] text-zinc-600 hidden sm:block">
                    {sig.asset}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {sig.outcome === "WIN" && (
                    <span className="text-[10px] font-medium text-emerald-400">
                      WIN
                    </span>
                  )}
                  <span className="text-[10px] text-zinc-600">{sig.time}</span>
                </div>
              </div>

              {/* Confidence */}
              <div className="mt-2.5 flex items-center gap-2.5">
                <div className="flex-1 h-1 bg-white/[0.06] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      sig.confidence >= 75 ? "bg-emerald-500" : "bg-amber-500"
                    }`}
                    style={{ width: `${sig.confidence}%` }}
                  />
                </div>
                <span className="text-[10px] text-zinc-400 tabular-nums w-7 text-right">
                  {sig.confidence}%
                </span>
              </div>

              <p className="mt-2 text-[11px] leading-relaxed text-zinc-400 line-clamp-2">
                {sig.reasoning}
              </p>

              <div className="mt-2 flex items-center gap-3 text-[10px] text-zinc-600">
                <span>{sig.horizon}</span>
                <span className="font-mono">@ {sig.price}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
