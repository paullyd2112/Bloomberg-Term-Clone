import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Glossary | Plebs.Finance",
  description:
    "Trading terms and platform concepts explained — RSI, MACD, confidence scores, prediction markets, and more.",
};

const SECTIONS: { title: string; terms: { term: string; definition: string }[] }[] = [
  {
    title: "Technical indicators",
    terms: [
      {
        term: "RSI (Relative Strength Index)",
        definition:
          "A momentum oscillator that measures the speed and magnitude of recent price changes on a scale of 0–100. Below 30 is generally considered oversold, above 70 is overbought. Our signals use RSI-14 (14-period).",
      },
      {
        term: "MACD (Moving Average Convergence Divergence)",
        definition:
          "A trend-following indicator that shows the relationship between two moving averages of price. When the MACD line crosses above the signal line, it suggests bullish momentum — and vice versa. Our engine also tracks whether the MACD histogram is expanding or contracting, which matters for the evidence gate.",
      },
      {
        term: "Bollinger Bands",
        definition:
          "A volatility indicator that places bands above and below a moving average, typically 2 standard deviations from the 20-period SMA. Price touching the upper band suggests potential overbought conditions; touching the lower band suggests oversold.",
      },
      {
        term: "SMA (Simple Moving Average)",
        definition:
          "The average closing price over a set number of periods. SMA-50 (50-period) is commonly used to gauge medium-term trend direction. Our regime gate uses SMA-50 to determine overall market trend.",
      },
      {
        term: "ATR (Average True Range)",
        definition:
          "A measure of volatility based on the range of price movement over a period. We use ATR-14 to set adaptive stop-loss levels — tighter stops in calm markets, wider stops in volatile ones.",
      },
      {
        term: "RVOL (Relative Volume)",
        definition:
          "Current volume compared to the average volume for the same time of day. An RVOL of 2.5x means 2.5 times the normal volume. Higher RVOL suggests stronger conviction behind a price move.",
      },
      {
        term: "OHLCV",
        definition:
          "Open, High, Low, Close, Volume — the five standard data points for each candle/bar on a price chart. The foundation of all technical analysis.",
      },
    ],
  },
  {
    title: "Signal terminology",
    terms: [
      {
        term: "Signal",
        definition:
          "An AI-generated trade idea with a direction, confidence score, reasoning, and time horizon. Every signal is tracked to outcome.",
      },
      {
        term: "BUY signal",
        definition:
          "The AI model's assessment that a coin is likely to move up from its current price. Comes with a confidence score and written reasoning. Not financial advice.",
      },
      {
        term: "SELL signal",
        definition:
          "The AI model's assessment that a coin is likely to move down from its current price. Comes with a confidence score and written reasoning. Not financial advice.",
      },
      {
        term: "HOLD",
        definition:
          "No actionable signal. This can mean the AI doesn't see a strong setup, or a deterministic gate blocked a BUY/SELL call. HOLDs are not surfaced as signals on the dashboard.",
      },
      {
        term: "Confidence score",
        definition:
          "A 0–100% score representing the AI model's conviction in a signal. Signals below 64% are automatically suppressed. Empirically, signals at 64%+ had a significantly higher win rate than those in the 60–63% range.",
      },
      {
        term: "Direction",
        definition:
          "The signal's recommended action: BUY (bullish) or SELL (bearish).",
      },
      {
        term: "Invalidation price",
        definition:
          "The price level at which the signal's thesis breaks down — essentially a stop-loss. If the coin hits this price, the setup is no longer valid. Set by the AI model or derived from ATR-based calculations.",
      },
      {
        term: "Target price",
        definition:
          "The price level where the AI model expects the move to reach. Used together with the invalidation price to calculate risk/reward ratio.",
      },
      {
        term: "R:R (Risk-to-Reward ratio)",
        definition:
          "The ratio of potential loss (entry to stop) versus potential gain (entry to target). A 2:1 R:R means the target is twice as far from entry as the stop. Our engine requires a minimum R:R before surfacing a signal.",
      },
      {
        term: "Time horizon",
        definition:
          "The expected duration for a signal: Intraday (same day), Swing (days to weeks), or Long-term (weeks to months).",
      },
      {
        term: "WIN / LOSS / EXPIRED",
        definition:
          "Signal outcomes. WIN means price hit the target, LOSS means it hit the invalidation price, EXPIRED means neither was hit within the signal's time horizon. All outcomes are tracked and visible on the dashboard.",
      },
      {
        term: "PENDING",
        definition:
          "A signal that hasn't resolved yet — price hasn't hit either the target or invalidation level, and the time horizon hasn't elapsed.",
      },
      {
        term: "Win rate",
        definition:
          "The percentage of resolved signals that resulted in a WIN outcome. Calculated as wins divided by total resolved signals (wins + losses). Tracked per coin on the dashboard.",
      },
    ],
  },
  {
    title: "Platform concepts",
    terms: [
      {
        term: "Deterministic gates",
        definition:
          "Code-enforced filters that every signal passes through before reaching you. They can downgrade a BUY or SELL to HOLD regardless of what the AI says. Includes confidence floors, regime checks, volatility filters, and evidence gates.",
      },
      {
        term: "Regime gate",
        definition:
          "A gate that checks the broader market trend before allowing signals. For crypto, if BTC's MACD is bearish and deepening, altcoin BUY signals are blocked.",
      },
      {
        term: "Evidence gate",
        definition:
          "A gate that checks signals against empirically validated patterns from a 10-month factor study. If the current indicators match a pattern that historically favored the opposite direction, the signal is downgraded to HOLD.",
      },
      {
        term: "Circuit breaker",
        definition:
          "A gate that blocks counter-trend signals during extreme moves. No SELL signals after a coin gaps up 8%+, no BUY signals after an 8%+ gap down.",
      },
      {
        term: "Correlation cap",
        definition:
          "A limit on concurrent positions in correlated assets. For crypto, a maximum of 2 simultaneous open longs with at most 1 altcoin alongside a BTC/ETH position.",
      },
      {
        term: "Scoring run",
        definition:
          "A single pass of the scoring engine across the coin watchlist. Runs every 2 hours (12x per day). Each run evaluates all core coins and any tier-1 coins that pass the prescreen.",
      },
      {
        term: "Watchlist",
        definition:
          "A personal list of assets you want to monitor. Unlimited on paid plans.",
      },
      {
        term: "News context",
        definition:
          "Recent headlines related to the asset at the time a signal was generated, providing qualitative context for the analysis.",
      },
    ],
  },
  {
    title: "Prediction markets",
    terms: [
      {
        term: "Prediction market",
        definition:
          "A market where you trade on the outcome of real-world events. Contracts resolve to $1 (YES) or $0 (NO) based on whether the event happens. Prices reflect implied probability — a $0.65 YES price implies a 65% chance.",
      },
      {
        term: "Polymarket",
        definition:
          "A decentralised prediction market platform. We scan Polymarket contracts to identify mispriced odds and generate YES/NO signals with AI analysis.",
      },
      {
        term: "YES / NO price",
        definition:
          "The current trading price of a prediction contract's YES or NO outcome. Prices should roughly sum to $1.00. A YES price of $0.70 means the market implies a 70% probability.",
      },
      {
        term: "Settlement",
        definition:
          "When a prediction market resolves — the event either happened (YES wins) or didn't (NO wins). Contracts pay $1 to the winning side and $0 to the losing side.",
      },
      {
        term: "Price drift resolution",
        definition:
          "Our method of resolving prediction signals before official settlement. If the YES price moves 15+ percentage points from the entry price, we resolve the signal as a WIN or LOSS based on direction. After 30 days, this threshold relaxes to 10 points.",
      },
      {
        term: "Whale alerts",
        definition:
          "Unusually large trades detected on prediction market platforms like Polymarket. Helps identify smart-money positioning in event-driven markets.",
      },
    ],
  },
  {
    title: "Account & billing",
    terms: [
      {
        term: "Pro plan",
        definition:
          "The $40/month tier. Includes 24/7 AI crypto signals, confidence scores, win rate tracking, unlimited watchlist, morning briefing, congressional trade tracker, and price alerts.",
      },
      {
        term: "Elite plan",
        definition:
          "The $80/month tier. Everything in Pro, plus prediction-market signals (Polymarket), on-demand AI analysis for any coin, Pleby (AI trading analyst), and a personalised morning briefing.",
      },
      {
        term: "Pleby",
        definition:
          "Your AI trading analyst, available on the Elite plan. Ask it to analyse any coin, explain a signal, or break down current market conditions.",
      },
      {
        term: "Morning briefing",
        definition:
          "A daily AI-generated summary covering crypto, prediction markets, geopolitics, tech, and more. The free newsletter version is the same for everyone. Paid subscribers get a personalised version tailored to their watchlist.",
      },
      {
        term: "Congressional trades",
        definition:
          "Securities transactions disclosed by U.S. senators under the STOCK Act. Shown with a 30–45 day delay based on official filing dates.",
      },
    ],
  },
];

export default function GlossaryPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-16 text-gray-300">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-white transition-colors mb-10"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to home
      </Link>

      <h1 className="text-3xl font-bold text-white mb-2">Glossary</h1>
      <p className="text-sm text-gray-500 mb-12">
        Trading terms and platform concepts, explained plainly
      </p>

      <div className="space-y-12">
        {SECTIONS.map((section) => (
          <section key={section.title}>
            <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-emerald-400 mb-5">
              {section.title}
            </h2>
            <dl className="space-y-3">
              {section.terms.map((item) => (
                <div
                  key={item.term}
                  className="rounded-xl border border-white/[0.06] bg-white/[0.02] ring-hairline px-5 py-4"
                >
                  <dt className="text-sm font-medium text-white mb-1.5">
                    {item.term}
                  </dt>
                  <dd className="text-sm text-gray-400 leading-relaxed">
                    {item.definition}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>

      <div className="mt-16 pt-8 border-t border-white/[0.06] text-center">
        <p className="text-sm text-zinc-500">
          Missing a term?{" "}
          <a
            href="mailto:support@plebs.finance"
            className="text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            Let us know
          </a>
        </p>
      </div>
    </main>
  );
}
