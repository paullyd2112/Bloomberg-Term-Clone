import Link from "next/link";

export default function SubscribeGate({ message = "Subscribe to access this feature." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center gap-6">
      <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.08] ring-hairline flex items-center justify-center text-3xl">
        🔒
      </div>
      <div>
        <p className="text-white font-semibold text-lg">{message}</p>
        <p className="text-zinc-500 text-sm mt-1.5">
          Subscribe to unlock real-time signals and the full suite.
        </p>
      </div>
      <Link
        href="/dashboard/upgrade"
        className="bg-emerald-500 hover:bg-emerald-400 text-black font-bold px-8 py-3 rounded-xl text-sm transition-colors"
      >
        View plans →
      </Link>
      <p className="text-zinc-600 text-xs">
        14-day free trial · Cancel anytime
      </p>
    </div>
  );
}
