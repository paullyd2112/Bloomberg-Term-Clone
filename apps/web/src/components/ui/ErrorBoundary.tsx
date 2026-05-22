"use client";

export default function ErrorBoundary({
  error,
  reset,
  title = "Something went wrong",
}: {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] px-4 text-center gap-4">
      <div className="text-3xl">⚠️</div>
      <div>
        <p className="text-white font-semibold">{title}</p>
        <p className="text-zinc-500 text-sm mt-1">{error.message || "An unexpected error occurred."}</p>
        {error.digest && (
          <p className="text-zinc-700 text-xs mt-1 font-mono">ref: {error.digest}</p>
        )}
      </div>
      <button
        onClick={reset}
        className="text-sm bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-lg transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
