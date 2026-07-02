export const metadata = {
  title: "Glossary — Plebs.finance",
  description:
    "Key terms and concepts used across the Plebs.finance platform.",
};

const TERMS = [
  {
    term: "Asset Type",
    definition:
      "Whether an instrument is a stock or cryptocurrency.",
  },
  {
    term: "Call",
    definition:
      "An options contract that profits if the underlying asset's price rises above the strike price. Shown in green in the options flow table.",
  },
  {
    term: "Confidence Score",
    definition:
      "The model's certainty (0–100%) in a signal's direction, derived from technical indicators, sentiment analysis, and market context. Higher scores indicate stronger conviction but do not guarantee outcomes.",
  },
  {
    term: "Congressional Trades",
    definition:
      "Stock transactions disclosed by U.S. lawmakers under the STOCK Act. Shown with a delay based on official filing dates.",
  },
  {
    term: "Direction",
    definition:
      "The signal's recommended action: BUY (bullish) or SELL (bearish).",
  },
  {
    term: "Expiry",
    definition:
      "The date an options contract becomes worthless if not exercised. Shown per trade in the options flow table.",
  },
  {
    term: "HOLD",
    definition:
      "A neutral signal indicating no strong directional conviction at the time of analysis.",
  },
  {
    term: "MACD",
    definition:
      "Moving Average Convergence/Divergence — a momentum indicator comparing two moving averages, used by the scoring engine and sometimes referenced directly in a signal's AI-generated reasoning.",
  },
  {
    term: "News Context",
    definition:
      "Recent headlines related to the asset at the time the signal was generated, providing qualitative context for the analysis.",
  },
  {
    term: "Options Flow",
    definition:
      "Unusual options activity detected for a stock, including large volume trades, high volume-to-open-interest ratios, and significant premium. Helps identify institutional positioning.",
  },
  {
    term: "Outcome",
    definition:
      "The resolved result of a signal: WIN (price moved in the predicted direction), LOSS (price moved against), NEUTRAL (no significant move), or PENDING (not yet resolved).",
  },
  {
    term: "Premium",
    definition:
      "The price paid for an options contract, shown per trade in the options flow table (in thousands of dollars).",
  },
  {
    term: "Put",
    definition:
      "An options contract that profits if the underlying asset's price falls below the strike price. Shown in red in the options flow table.",
  },
  {
    term: "RSI (Relative Strength Index)",
    definition:
      "A 0–100 momentum indicator shown on the asset page. Above 70 is generally read as overbought, below 30 as oversold.",
  },
  {
    term: "Signal",
    definition:
      "An AI-generated trade idea with a direction, confidence score, reasoning, and time horizon. Every signal is tracked to outcome.",
  },
  {
    term: "Strike",
    definition:
      "The price at which an options contract can be exercised. Shown per trade in the options flow table.",
  },
  {
    term: "Time Horizon",
    definition:
      "The expected duration for a signal: Intraday (same day), Swing (days to weeks), or Long-term (weeks to months).",
  },
  {
    term: "Unusual (Options Flow)",
    definition:
      "A trade flagged when its size or premium is meaningfully larger than typical activity for that contract — one signal institutions may be positioning ahead of a move. Marked with a lightning icon in the options flow table.",
  },
  {
    term: "Volume Ratio",
    definition:
      "Today's trading volume divided by its recent average. Above roughly 1.5–2x is generally considered elevated. Shown on the asset page as \"Vol Ratio.\"",
  },
  {
    term: "Watchlist",
    definition:
      "A personal list of assets you want to monitor. Unlimited on Pro and Elite.",
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
