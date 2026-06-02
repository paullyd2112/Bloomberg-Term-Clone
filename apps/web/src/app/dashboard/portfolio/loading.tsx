import { Skeleton, SkeletonStatRow, SkeletonRow } from "@/components/ui/Skeleton";

export default function PortfolioLoading() {
  return (
    <div className="p-4 md:p-6 space-y-6">
      <SkeletonStatRow cols={4} />
      <Skeleton className="h-5 w-32" />
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    </div>
  );
}
