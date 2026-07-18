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
  height = 28,
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
    return `${x},${y}`;
  });

  const trending = points[points.length - 1] >= points[0];
  const stroke = trending ? "#34d399" : "#f87171";

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden
    >
      <polyline
        points={coords.join(" ")}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
