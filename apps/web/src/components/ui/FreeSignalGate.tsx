import Link from "next/link";
import { ArrowUpRight, Clock, Lock } from "lucide-react";

type Props = {
  delayHours: number;
  dailyLimit: number;
  totalAvailable: number;
};

export default function FreeSignalGate({ delayHours, dailyLimit, totalAvailable }: Props) {
  const hidden = Math.max(0, totalAvailable - dailyLimit);

  return (
    <div className="mt-6 relative overflow-hidden rounded-xl border border-white/[0.08] bg-gradient-to-b from-white/[0.03] to-transparent">
      <div className="px-5 py-6 sm:px-6 flex flex-col items-center text-center gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-amber-600/30 bg-amber-500/10">
            <Clock className="h-4 w-4 text-amber-400" />
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-600/30 bg-emerald-500/10">
            <Lock className="h-4 w-4 text-emerald-400" />
          </div>
        </div>

        <div>
          <p className="text-white font-semibold text-sm">
            You&apos;re seeing {dailyLimit} signals with a {delayHours}h delay
          </p>
          <p className="text-zinc-500 text-xs mt-1.5 leading-relaxed max-w-md">
            {hidden > 0
              ? `${hidden} more real-time signals are available right now. `
              : ""}
            Pro members get unlimited signals the moment they fire, plus push
            notifications, Telegram alerts, portfolio tracking, and the full screener.
          </p>
        </div>

        <Link
          href="/dashboard/upgrade"
          className="group inline-flex items-center justify-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors"
        >
          Unlock all signals
          <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </Link>

        <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">
          14-day free trial · Cancel anytime
        </p>
      </div>
    </div>
  );
}
