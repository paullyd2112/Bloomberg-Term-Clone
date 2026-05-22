"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="p-6 text-center space-y-3">
      <p className="text-red-400 text-sm">Failed to load backtester.</p>
      <button onClick={reset} className="text-xs text-zinc-400 hover:text-white underline">
        Try again
      </button>
    </div>
  );
}
