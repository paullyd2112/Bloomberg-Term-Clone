import { Skeleton } from "@/components/ui/Skeleton";

export default function BriefingLoading() {
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-3xl mx-auto">
      {/* Tone + headline */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-8 w-3/4" />
      </div>

      {/* Sections */}
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ))}
    </div>
  );
}
