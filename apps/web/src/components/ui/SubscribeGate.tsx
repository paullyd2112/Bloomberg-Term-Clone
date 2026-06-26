import Link from "next/link";
import { Lock, ArrowUpRight } from "lucide-react";

export default function SubscribeGate({ message = "Subscribe to access this feature." }: { message?: string }) {
  return (
    <div className="relative flex flex-col items-center justify-center min-h-[60vh] px-4 text-center gap-6 overflow-hidden">
      {/* ambient glow to match landing */}
      <div className="pointer-events-none absolute -top-10 left-1/2 h-[280px] w-[480px] -translate-x-1/2 rounded-full bg-emerald-500/[0.06] blur-[120px]" />

      <div className="relative inline-flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-700/30 bg-emerald-500/10 text-emerald-400 ring-hairline">
        <Lock className="h-7 w-7" strokeWidth={1.75} />
      </div>
      <div className="relative">
        <p className="text-white font-semibold text-lg text-balance">{message}</p>
        <p className="text-zinc-500 text-sm mt-1.5 leading-relaxed">
          Subscribe to unlock real-time signals and the full suite.
        </p>
      </div>
      <Link
        href="/dashboard/upgrade"
        className="group relative inline-flex items-center justify-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold px-8 py-3 rounded-xl text-sm transition-colors"
      >
        View plans
        <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </Link>
      <p className="relative font-mono text-[11px] uppercase tracking-wider text-zinc-600">
        14-day free trial · Cancel anytime
      </p>
    </div>
  );
}
