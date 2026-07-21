import type { ReactNode } from "react";

export default function SectionHeader({
  children,
  count,
  divider = false,
  primary = false,
  className = "",
}: {
  children: ReactNode;
  count?: number;
  divider?: boolean;
  primary?: boolean;
  className?: string;
}) {
  return (
    <h2
      className={`flex items-center gap-3 ${
        primary
          ? "text-[15px] font-semibold tracking-tight"
          : "font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500"
      } ${className}`}
    >
      <span className="text-emerald-400 text-[10px] leading-none">●</span>
      {divider && <span className="h-px w-8 bg-white/15" />}
      <span className={primary ? "text-zinc-300" : "text-zinc-400"}>{children}</span>
      {count !== undefined && (
        <span className="text-[11px] text-zinc-600 tabular-nums">{count}</span>
      )}
    </h2>
  );
}
