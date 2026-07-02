import { Zap } from "lucide-react";

type OptionsRow = {
  contract_type: string;
  strike: number | null;
  expiry: string | null;
  volume: number | null;
  premium_usd: number | null;
  is_unusual: boolean;
  captured_at: string;
};

export default function OptionsFlowTable({
  rows,
  beginnerMode,
}: {
  rows: OptionsRow[];
  beginnerMode?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      {beginnerMode && (
        <p className="text-[11px] text-zinc-500 leading-relaxed pb-1">
          CALL bets the price rises, PUT bets it falls. Strike is the trigger
          price, premium is what was paid, and the lightning bolt flags a
          trade that&apos;s unusually large for that contract.{" "}
          <a href="/glossary" className="text-emerald-400/80 hover:text-emerald-300 underline underline-offset-2">
            More terms →
          </a>
        </p>
      )}
      <div className="flex items-center gap-2 text-[10px] text-zinc-600 uppercase tracking-wider px-0.5">
        <span className="w-8 flex-shrink-0">Type</span>
        <span title="Strike price">Strike</span>
        <span className="ml-2" title="Expiry date">Expiry</span>
        <span className="ml-auto" title="Premium paid">Premium</span>
      </div>
      {rows.map((row, i) => {
        const isCall = row.contract_type === "call";
        return (
          <div
            key={i}
            className="flex items-center gap-2 text-xs text-zinc-300"
          >
            <span
              className={`font-bold w-8 flex-shrink-0 ${
                isCall ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {isCall ? "CALL" : "PUT"}
            </span>
            {row.strike && (
              <span className="font-mono text-zinc-400">${row.strike}</span>
            )}
            {row.expiry && (
              <span className="text-zinc-600">
                {new Date(row.expiry).toLocaleDateString([], { month: "short", day: "numeric" })}
              </span>
            )}
            <span className="ml-auto font-mono tabular-nums text-white">
              {row.premium_usd != null
                ? `$${(row.premium_usd / 1000).toFixed(0)}k`
                : "—"}
            </span>
            {row.is_unusual && (
              <Zap className="h-3 w-3 text-amber-400" fill="currentColor" />
            )}
          </div>
        );
      })}
    </div>
  );
}
