"use client";

type Props = {
  points: number[];
  width?: number;
  height?: number;
  className?: string;
};

export default function Sparkline({
  points,
  width = 80,
  height = 32,
  className = "",
}: Props) {
  if (points.length < 2) return null;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const pad = 1;

  const coords = points.map((v, i) => {
    const x = pad + (i / (points.length - 1)) * (width - 2 * pad);
    const y = pad + (1 - (v - min) / range) * (height - 2 * pad);
    return [x, y] as const;
  });

  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c[0]},${c[1]}`).join(" ");
  const areaPath = `${linePath} L${coords[coords.length - 1][0]},${height} L${coords[0][0]},${height} Z`;

  const trending = points[points.length - 1] >= points[0];
  const stroke = trending ? "#00d4aa" : "#ef4444";
  const fillId = `spark-fill-${Math.random().toString(36).slice(2, 8)}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.2} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${fillId})`} />
      <path
        d={linePath}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
