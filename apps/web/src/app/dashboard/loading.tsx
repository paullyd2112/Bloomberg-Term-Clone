import { SkeletonCard, SkeletonStatRow, Skeleton } from "@/components/ui/Skeleton";

export default function DashboardLoading() {
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <SkeletonStatRow cols={4} />

      {/* Movers strip */}
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-20 flex-shrink-0" />
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-800 pb-0">
        {["All", "Stocks", "Crypto", "Predictions"].map((t) => (
          <Skeleton key={t} className="h-9 w-20" />
        ))}
      </div>

      {/* Signal cards grid */}
      <div className="grid gap-3 sm:grid-cols-1 xl:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
