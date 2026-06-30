import type { ReactNode } from "react";

/**
 * Shared section header used across the dashboard.
 * - `divider` adds the short rule between the dot and label (page-level sections).
 * - `count` appends a muted tabular count (e.g. number of items).
 */
export default function SectionHeader({
  children,
  count,
  divider = false,
  className = "",
}: {
  children: ReactNode;
  count?: number;
  divider?: boolean;
  className?: string;
}) {
  return (
    <h2
      className={`flex items-center gap-3 font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500 ${className}`}
    >
      <span className="text-emerald-400 text-[10px] leading-none">●</span>
      {divider && <span className="h-px w-8 bg-white/15" />}
      <span className="text-zinc-400">{children}</span>
      {count !== undefined && (
        <span className="text-[11px] text-zinc-600 tabular-nums">{count}</span>
      )}
    </h2>
  );
}
