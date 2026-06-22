"use client";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorBoundary error={error} reset={reset} title="Failed to load insider trades" />;
}
