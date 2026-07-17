export const metadata = {
  title: "Glossary — Plebs.finance",
  description:
    "Key terms and concepts used across the Plebs.finance platform.",
};

const TERMS = [
  {
    term: "Asset Type",
    definition:
      "Whether an instrument is a cryptocurrency or a prediction market contract.",
  },
  {
    term: "Confidence Score",
    definition:
      "The model's certainty (0–100%) in a signal's direction, derived from technical indicators, sentiment analysis, and market context. Higher scores indicate stronger conviction but do not guarantee outcomes.",
  },
  {
    term: "Congressional Trades",
    definition:
      "Securities transactions disclosed by U.S. lawmakers under the STOCK Act. Shown with a delay based on official filing dates.",
  },
  {
    term: "Direction",
    definition:
      "The signal's recommended action: BUY (bullish) or SELL (bearish).",
  },
  {
    term: "HOLD",
    definition:
      "A neutral signal indicating no strong directional conviction at the time of analysis.",
  },
  {
    term: "News Context",
    definition:
      "Recent headlines related to the asset at the time the signal was generated, providing qualitative context for the analysis.",
  },
  {
    term: "Whale Alerts",
    definition:
      "Unusually large trades detected on prediction market platforms like Polymarket. Helps identify smart-money positioning in event-driven markets.",
  },
  {
    term: "Outcome",
    definition:
      "The resolved result of a signal: WIN (price moved in the predicted direction), LOSS (price moved against), NEUTRAL (no significant move), or PENDING (not yet resolved).",
  },
  {
    term: "Signal",
    definition:
      "An AI-generated trade idea with a direction, confidence score, reasoning, and time horizon. Every signal is tracked to outcome.",
  },
  {
    term: "Time Horizon",
    definition:
      "The expected duration for a signal: Intraday (same day), Swing (days to weeks), or Long-term (weeks to months).",
  },
  {
    term: "Watchlist",
    definition:
      "A personal list of assets you want to monitor. Free tier allows up to 5 assets.",
  },
  {
    term: "Win Rate",
    definition:
      "The percentage of resolved signals that resulted in a WIN outcome, calculated as wins divided by total resolved signals (wins + losses + neutrals).",
  },
];

export default function GlossaryPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-16 text-gray-300">
      <h1 className="text-3xl font-bold text-white mb-2">Glossary</h1>
      <p className="text-sm text-gray-500 mb-10">
        Key terms and concepts used across Plebs.finance.
      </p>

      <div className="space-y-6">
        {TERMS.map((t) => (
          <div
            key={t.term}
            className="border-l-2 border-emerald-500/30 pl-4"
          >
            <dt className="text-sm font-semibold text-white">{t.term}</dt>
            <dd className="text-sm text-zinc-400 mt-1">{t.definition}</dd>
          </div>
        ))}
      </div>
    </main>
  );
}
