import Link from "next/link";

export default function SubscribeGate({ message = "Your trial has ended." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center gap-5">
      <div className="text-4xl">🔒</div>
      <div>
        <p className="text-white font-semibold text-lg">{message}</p>
        <p className="text-zinc-500 text-sm mt-1">
          Subscribe to unlock real-time signals and the full suite.
        </p>
      </div>
      <div className="flex gap-3">
        <Link
          href="/dashboard/upgrade"
          className="bg-green-500 hover:bg-green-400 text-black font-bold px-6 py-2.5 rounded-lg text-sm transition-colors"
        >
          View plans →
        </Link>
      </div>
      <p className="text-zinc-700 text-xs">
        14-day free trial · Cancel anytime
      </p>
    </div>
  );
}
