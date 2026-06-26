import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";

export default function AssetLoading() {
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      {/* Price header */}
      <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl p-6 space-y-3">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-10 w-36" />
          </div>
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
        <div className="flex gap-4">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-20" />
        </div>
      </div>

      {/* Signal cards */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-28" />
        <div className="grid gap-3 xl:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
