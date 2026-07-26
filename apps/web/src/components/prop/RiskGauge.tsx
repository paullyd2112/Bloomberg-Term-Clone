"use client";

import { clsx } from "clsx";

type Props = {
  label: string;
  value: number;
  max: number;
  unit?: string;
  inverse?: boolean;
};

function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

function polarToCartesian(cx: number, cy: number, r: number, degrees: number) {
  const rad = ((degrees - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

export default function RiskGauge({ label, value, max, unit = "$", inverse = false }: Props) {
  const pct = Math.min(value / max, 1);
  const displayPct = Math.round(pct * 100);

  const severity = inverse
    ? pct <= 0.4 ? "danger" : pct <= 0.7 ? "warning" : "safe"
    : pct >= 0.8 ? "danger" : pct >= 0.6 ? "warning" : "safe";

  const colors = {
    safe: { stroke: "#00d4aa", text: "text-[#00d4aa]", bg: "text-[#00d4aa]/20" },
    warning: { stroke: "#f59e0b", text: "text-amber-400", bg: "text-amber-400/20" },
    danger: { stroke: "#ef4444", text: "text-red-400", bg: "text-red-400/20" },
  };

  const color = colors[severity];
  const size = 100;
  const cx = size / 2;
  const cy = size / 2;
  const r = 38;
  const startAngle = -120;
  const endAngle = 120;
  const sweepAngle = startAngle + pct * (endAngle - startAngle);

  const bgArc = arcPath(cx, cy, r, startAngle, endAngle);
  const valueArc = arcPath(cx, cy, r, startAngle, sweepAngle);

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={70} viewBox={`0 10 ${size} 70`} className="overflow-visible">
        <path
          d={bgArc}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={8}
          strokeLinecap="round"
        />
        {pct > 0 && (
          <path
            d={valueArc}
            fill="none"
            stroke={color.stroke}
            strokeWidth={8}
            strokeLinecap="round"
          />
        )}
        <text x={cx} y={cy + 4} textAnchor="middle" className={clsx("text-[13px] font-bold font-mono fill-current", color.text)}>
          {displayPct}%
        </text>
      </svg>
      <div className="text-center -mt-1">
        <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono">{label}</div>
        <div className={clsx("text-xs font-mono font-semibold tabular-nums", color.text)}>
          {unit}{value.toLocaleString()} / {unit}{max.toLocaleString()}
        </div>
      </div>
    </div>
  );
}
