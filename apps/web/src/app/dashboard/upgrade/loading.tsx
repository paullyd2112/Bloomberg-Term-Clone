import { Skeleton } from "@/components/ui/Skeleton";

export default function UpgradeLoading() {
  return (
    <div className="p-4 md:p-6 space-y-8 max-w-5xl mx-auto">
      <div className="text-center space-y-2">
        <Skeleton className="h-8 w-48 mx-auto" />
        <Skeleton className="h-4 w-64 mx-auto" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-9 w-full rounded-lg" />
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, j) => (
                <Skeleton key={j} className="h-3 w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
