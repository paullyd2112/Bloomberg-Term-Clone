export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded bg-white/[0.06] ${className}`} />
  );
}

export function SkeletonCard() {
  return (
    <div className="bg-zinc-950 border border-white/[0.06] ring-hairline rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-12" />
          <Skeleton className="h-4 w-20" />
        </div>
        <Skeleton className="h-4 w-14" />
      </div>
      <Skeleton className="h-1.5 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
      <div className="flex justify-between pt-1">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-10" />
      </div>
    </div>
  );
}

export function SkeletonStatRow({ cols = 4 }: { cols?: number }) {
  return (
    <div className={`grid grid-cols-2 sm:grid-cols-${cols} gap-3`}>
      {Array.from({ length: cols }).map((_, i) => (
        <div key={i} className="bg-zinc-950 border border-white/[0.06] ring-hairline rounded-2xl p-4">
          <Skeleton className="h-7 w-12 mb-2" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="bg-zinc-950 border border-white/[0.06] ring-hairline rounded-2xl p-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <Skeleton className="h-5 w-14" />
        <Skeleton className="h-4 w-24" />
      </div>
      <Skeleton className="h-4 w-16 flex-shrink-0" />
    </div>
  );
}
