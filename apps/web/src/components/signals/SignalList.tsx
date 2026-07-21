import SignalCard, { type Signal } from "./SignalCard";

/**
 * Dense, terminal-style list of signal rows.
 * A single bordered container with hairline dividers between rows —
 * scannable like a data grid, not a stack of cards.
 */
export default function SignalList({ signals, hideTrade }: { signals: Signal[]; hideTrade?: boolean }) {
  return (
    <div>
      {/* Column header — desktop only (mobile uses stacked mini-cards) */}
      <div className="hidden sm:flex items-center gap-4 border-b border-white/[0.06] pb-2 pr-4 pl-[1.125rem] font-mono text-[10px] uppercase tracking-wider text-zinc-600">
        <span className="w-10 flex-shrink-0">Dir</span>
        <span className="w-32 flex-shrink-0">Ticker</span>
        <span className="w-[4.75rem] flex-shrink-0">Conf</span>
        <span className="hidden w-14 flex-shrink-0 md:block">Horizon</span>
        <span className="w-20 flex-shrink-0 text-right">Price</span>
        <span className="min-w-0 flex-1">Reasoning</span>
        <span className="hidden w-12 flex-shrink-0 text-right lg:block">Result</span>
        <span className="hidden w-10 flex-shrink-0 text-right lg:block">Age</span>
      </div>

      <div className="divide-y divide-white/[0.06] overflow-hidden rounded-b-xl">
        {signals.map((s) => (
          <SignalCard key={s.id} signal={s} hideTrade={hideTrade} />
        ))}
      </div>

      <p className="mt-2.5 px-1 font-mono text-[10px] text-zinc-700">
        AI analysis only — not financial advice. Do your own research.
      </p>
    </div>
  );
}
