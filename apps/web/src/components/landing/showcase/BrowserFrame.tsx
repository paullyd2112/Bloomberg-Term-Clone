import type { ReactNode } from "react";

/**
 * App-chrome wrapper for product-shot components.
 * Static, presentational only — used to frame the terminal mockups.
 */
export default function BrowserFrame({
  url = "app.plebs.io/dashboard",
  children,
  className = "",
}: {
  url?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative rounded-xl border border-white/10 bg-surface-raised overflow-hidden elevate-lg ${className}`}
    >
      {/* Title bar */}
      <div className="flex items-center gap-3 border-b border-white/[0.06] bg-white/[0.02] px-4 py-3">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
        </div>
        <div className="mx-auto flex items-center gap-2 rounded-md border border-white/[0.06] bg-black/40 px-3 py-1">
          <svg
            className="h-3 w-3 text-emerald-400/70"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <rect x="3" y="11" width="18" height="10" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span className="font-mono text-[11px] text-zinc-500">{url}</span>
        </div>
        <div className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
      </div>

      {children}
    </div>
  );
}
