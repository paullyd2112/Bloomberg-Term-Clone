"use client";

export type EquityPoint = { date: string; cumulative: number };

/**
 * Dependency-free cumulative-P&L sparkline. Renders an SVG area + line scaled
 * to the data range, with a baseline at $0. Green when ending in profit, red
 * when ending in the red.
 */
export default function EquityCurve({ data }: { data: EquityPoint[] }) {
  if (data.length < 2) {
    return (
      <div className="h-40 flex items-center justify-center text-xs text-zinc-600">
        Close at least two trades to see your equity curve.
      </div>
    );
  }

  const W = 600;
  const H = 160;
  const PAD = 8;

  const values = data.map((d) => d.cumulative);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const range = max - min || 1;

  const x = (i: number) => PAD + (i / (data.length - 1)) * (W - PAD * 2);
  const y = (v: number) => PAD + (1 - (v - min) / range) * (H - PAD * 2);

  const linePath = data
    .map((d, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(d.cumulative).toFixed(1)}`)
    .join(" ");

  const areaPath =
    `${linePath} L ${x(data.length - 1).toFixed(1)} ${y(min).toFixed(1)}` +
    ` L ${x(0).toFixed(1)} ${y(min).toFixed(1)} Z`;

  const ending = values[values.length - 1];
  const up = ending >= 0;
  const stroke = up ? "#10b981" : "#ef4444";
  const fill = up ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)";
  const zeroY = y(0);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height: 160 }}>
      {/* $0 baseline */}
      <line x1={PAD} x2={W - PAD} y1={zeroY} y2={zeroY} stroke="rgba(255,255,255,0.12)" strokeWidth={1} strokeDasharray="3 3" />
      <path d={areaPath} fill={fill} />
      <path d={linePath} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
