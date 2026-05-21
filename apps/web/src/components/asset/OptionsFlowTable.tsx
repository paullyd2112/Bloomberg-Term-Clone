type OptionsRow = {
  contract_type: string;
  strike: number | null;
  expiry: string | null;
  volume: number | null;
  premium_usd: number | null;
  is_unusual: boolean;
  captured_at: string;
};

export default function OptionsFlowTable({ rows }: { rows: OptionsRow[] }) {
  return (
    <div className="space-y-1.5">
      {rows.map((row, i) => {
        const isCall = row.contract_type === "call";
        return (
          <div
            key={i}
            className="flex items-center gap-2 text-xs text-zinc-300"
          >
            <span
              className={`font-bold w-8 flex-shrink-0 ${
                isCall ? "text-green-400" : "text-red-400"
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
              <span className="text-amber-400 font-bold">⚡</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
