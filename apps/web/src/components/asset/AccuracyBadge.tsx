type Accuracy = {
  win_rate: number | null;
  total_signals: number;
};

export default function AccuracyBadge({ accuracy }: { accuracy: Accuracy }) {
  if (!accuracy.total_signals || accuracy.win_rate == null) return null;

  const pct  = accuracy.win_rate * 100;
  const color =
    pct >= 60 ? "text-green-400 border-green-700 bg-green-500/10"
    : pct >= 45 ? "text-amber-400 border-amber-700 bg-amber-500/10"
    : "text-red-400 border-red-700 bg-red-500/10";

  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded border ${color}`}>
      {pct.toFixed(0)}% win rate
    </span>
  );
}
