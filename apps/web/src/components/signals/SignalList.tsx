import SignalCard, { type Signal } from "./SignalCard";

/**
 * Dense, terminal-style list of signal rows.
 * A single bordered container with hairline dividers between rows —
 * scannable like a data grid, not a stack of cards.
 */
export default function SignalList({ signals, canLogPosition }: { signals: Signal[]; canLogPosition?: boolean }) {
  return (
    <div>
      {/* Column header — aligns with SignalCard's fixed-width columns */}
      <div className="flex items-center gap-3 border-b border-white/[0.06] pb-2 pr-3 pl-[0.875rem] font-mono text-[10px] uppercase tracking-wider text-zinc-600 sm:gap-4 sm:pr-4 sm:pl-[1.125rem]">
        <span className="w-10 flex-shrink-0">Dir</span>
        <span className="w-[4.5rem] flex-shrink-0 sm:w-32">Ticker</span>
        <span className="w-14 flex-shrink-0 sm:w-[4.75rem]">Conf</span>
        <span className="hidden w-14 flex-shrink-0 md:block">Horizon</span>
        <span className="hidden w-20 flex-shrink-0 text-right sm:block">Price</span>
        <span className="min-w-0 flex-1">Reasoning</span>
        <span className="hidden w-12 flex-shrink-0 text-right lg:block">Result</span>
        <span className="hidden w-10 flex-shrink-0 text-right lg:block">Age</span>
      </div>

      <div className="divide-y divide-white/[0.06] overflow-hidden rounded-b-xl">
        {signals.map((s) => (
          <SignalCard key={s.id} signal={s} canLogPosition={canLogPosition} />
        ))}
      </div>

      <p className="mt-2.5 px-1 font-mono text-[10px] text-zinc-700">
        AI analysis only — not financial advice. Do your own research.
      </p>
    </div>
  );
}
