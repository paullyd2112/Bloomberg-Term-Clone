import { SkeletonCard, SkeletonStatRow, Skeleton } from "@/components/ui/Skeleton";

export default function DashboardLoading() {
  return (
    <div className="p-5 md:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>

      {/* Stats row */}
      <SkeletonStatRow cols={4} />

      {/* Track record */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>

      {/* Movers strip */}
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-28 flex-shrink-0" />
        ))}
      </div>

      {/* Signal feed: tabs + cards */}
      <div className="space-y-4">
        <div className="flex gap-1 border-b border-white/[0.08] pb-0">
          {["All", "Stocks", "Crypto"].map((t) => (
            <Skeleton key={t} className="h-9 w-20" />
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-1 xl:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
