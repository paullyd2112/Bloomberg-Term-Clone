import { Suspense } from "react";
import Link from "next/link";
import SignupForm from "./SignupForm";

export default function SignupPage() {
  return (
    <div className="relative min-h-screen bg-background flex items-center justify-center px-4 overflow-hidden">
      {/* backdrop */}
      <div className="pointer-events-none absolute inset-0 bg-grid mask-fade opacity-60" />
      <div className="pointer-events-none absolute -top-32 left-1/2 h-[420px] w-[620px] -translate-x-1/2 rounded-full bg-emerald-500/[0.07] blur-[130px]" />

      <div className="relative w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link
            href="/"
            className="text-2xl font-semibold tracking-tightest text-white"
            aria-label="Plebs home"
          >
            Plebs<span className="text-emerald-400">.</span>
          </Link>
          <p className="mt-3 text-sm text-secondary-foreground">Start your 14-day free trial</p>
        </div>
        <Suspense
          fallback={
            <div className="bg-white/[0.02] border border-white/[0.06] ring-hairline rounded-2xl p-6 h-72 shimmer" />
          }
        >
          <SignupForm />
        </Suspense>
        <p className="mt-6 text-center font-mono text-[10px] uppercase tracking-wider text-zinc-600">
          Live prices, fresh signals from day one
        </p>
      </div>
    </div>
  );
}
