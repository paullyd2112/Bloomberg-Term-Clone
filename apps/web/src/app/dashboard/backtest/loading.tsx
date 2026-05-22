import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      <Skeleton className="h-8 w-48" />
      <SkeletonCard />
    </div>
  );
}
