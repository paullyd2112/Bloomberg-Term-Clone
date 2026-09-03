import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import JsonLd from "@/components/seo/JsonLd";

export const metadata = {
  // Brand suffix comes from the root `%s · Plebs` template.
  title: "FAQ",
  description:
    "Frequently asked questions about Plebs.Finance — AI crypto signals, prediction markets, pricing, and more.",
  alternates: { canonical: "/faq" },
};

const CATEGORIES: { title: string; items: { q: string; a: string }[] }[] = [
  {
    title: "Getting started",
    items: [
      {
        q: "What exactly is Plebs?",
        a: "Plebs is an AI-powered crypto signal terminal for retail traders. We run AI models over live technicals, news, and market structure to generate BUY/SELL signals on 50+ coins around the clock, each with a confidence score and full reasoning. Think Bloomberg Terminal meets AI analyst, priced for normal people.",
      },
      {
        q: "How does the trial work?",
        a: "You get 14 days of full access to your chosen plan (Pro or Elite). Credit card is required upfront. Cancel anytime during the trial and you won't be charged.",
      },
      {
        q: "Can I switch plans after signing up?",
        a: "Yes. You can upgrade from Pro to Elite or downgrade at any time from your dashboard settings. Changes take effect on your next billing cycle.",
      },
      {
        q: "Can I cancel anytime?",
        a: "Yes. Cancel from your dashboard settings whenever you want. You'll keep access through the end of your current billing period.",
      },
    ],
  },
  {
    title: "Signals & accuracy",
    items: [
      {
        q: "How are signals generated?",
        a: "Every signal starts with live market data — price action, RSI, MACD, Bollinger Bands, volume, and news. That data passes through a stack of deterministic gates (regime filters, volatility checks, correlation caps) before reaching our AI model. The model produces a BUY, SELL, or HOLD call with a confidence score and written reasoning. Signals below our confidence threshold are automatically suppressed.",
      },
      {
        q: "How often are signals generated?",
        a: "Crypto signals run every 2 hours, 24/7 — that's 12 scoring runs per day. Core coins (BTC, ETH, SOL, and others) are scored every run. The rest go through a fast prescreen first, and only high-potential setups get the full AI analysis.",
      },
      {
        q: "How accurate are the signals?",
        a: "Every signal is tracked to outcome — WIN, LOSS, or EXPIRED. You can see real win rates per coin on the dashboard. No cherry-picking, no hiding misses. Full transparency is the whole point.",
      },
      {
        q: "What does the confidence score mean?",
        a: "It's the AI model's conviction in the signal, from 0–100%. We suppress anything below 64% — that threshold was set empirically based on backtesting, where signals at 60–63% had a 31% win rate versus 69% for 64+. Higher confidence generally means a stronger setup.",
      },
      {
        q: "What are the deterministic gates?",
        a: "Before any signal reaches you, it passes through code-enforced filters: a confidence floor, circuit breakers for extreme moves, BTC regime checks for altcoins, correlation caps to prevent clustered risk, and evidence gates based on historical factor analysis. These gates override the AI model — they can downgrade a BUY or SELL to HOLD regardless of what the model says.",
      },
    ],
  },
  {
    title: "Markets & coverage",
    items: [
      {
        q: "What markets do you cover?",
        a: "Crypto and prediction markets. We score BTC, ETH, SOL, and 50+ coins around the clock, plus AI-scored YES/NO calls on Polymarket prediction contracts. Every signal comes with a confidence score and full reasoning.",
      },
      {
        q: "Which coins are covered?",
        a: "10 core coins (BTC, ETH, SOL, XRP, ADA, DOGE, BNB, AVAX, LINK, UNI) are scored every run. Another 53 tier-1 coins go through a fast prescreen. Coins with large daily moves (5%+) get scored regardless of tier.",
      },
      {
        q: "What are prediction-market signals?",
        a: "We scan live Polymarket contracts and use AI to find mispriced odds. Each signal is a YES or NO call on a real-world event — elections, policy decisions, crypto milestones — with the edge spelled out. Available on the Elite plan.",
      },
      {
        q: "Do you cover stocks?",
        a: "Not currently. We're focused on crypto and prediction markets. Stock scoring infrastructure exists and may return in the future.",
      },
    ],
  },
  {
    title: "Newsletter & briefings",
    items: [
      {
        q: "What's in the newsletter?",
        a: "A full morning brief covering crypto markets, prediction markets, geopolitics, AI and tech, health and science, sports, and whatever else is moving the world. Think 7 days a week is too much? You can choose your newsletter frequency in settings.",
      },
      {
        q: "Is the newsletter free?",
        a: "Yes. Anyone can sign up for the daily newsletter — no paid plan required. Paid subscribers get a personalised version tailored to their watchlist and portfolio.",
      },
      {
        q: "What's the difference between the newsletter and the morning briefing?",
        a: "The free newsletter is the same for everyone — a broad world brief. The morning briefing (included with paid plans) is personalised to your watchlist and open positions, with AI-generated commentary specific to your portfolio.",
      },
    ],
  },
  {
    title: "Plans & pricing",
    items: [
      {
        q: "What's the difference between Pro and Elite?",
        a: "Pro ($40/mo) gives you 24/7 AI crypto signals, confidence scores, win rate tracking, watchlists, a morning briefing, congressional trade tracking, and price alerts. Elite ($80/mo) adds prediction-market signals (Polymarket), on-demand AI analysis for any coin, Pleby (your AI trading analyst), and a personalised morning briefing.",
      },
      {
        q: "Is this financial advice?",
        a: "No. Plebs provides AI-generated market analysis for informational purposes only. We surface signals and data, but every trade decision is yours. Always do your own research.",
      },
    ],
  },
  {
    title: "Features",
    items: [
      {
        q: "What is Pleby?",
        a: "Pleby is your on-call AI trading analyst, available on the Elite plan. You can ask it to analyse any coin, explain a signal's reasoning, or break down market conditions — like having a research analyst on demand.",
      },
      {
        q: "What are price alerts?",
        a: "You can set alerts on any coin in your watchlist. When the price crosses your target, you get notified. Alerts are available on both Pro and Elite plans.",
      },
      {
        q: "What is the congressional trade tracker?",
        a: "We track stock and ETF trades disclosed by US senators under the STOCK Act. Disclosures are filed with a 30–45 day lag, so the data reflects what Congress was buying or selling roughly a month ago.",
      },
    ],
  },
];

/**
 * FAQPage schema built by flattening CATEGORIES — the same source the page
 * renders from, so the markup and the visible answers can never disagree
 * (Google requires the answer text to be present on the page).
 */
function faqJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: CATEGORIES.flatMap((category) =>
      category.items.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    ),
  };
}

export default function FaqPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-16 text-gray-300">
      <JsonLd data={faqJsonLd()} />
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-white transition-colors mb-10"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to home
      </Link>

      <h1 className="text-3xl font-bold text-white mb-2">
        Frequently Asked Questions
      </h1>
      <p className="text-sm text-gray-500 mb-12">
        Everything you need to know about Plebs.Finance
      </p>

      <div className="space-y-12">
        {CATEGORIES.map((cat) => (
          <section key={cat.title}>
            <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-emerald-400 mb-5">
              {cat.title}
            </h2>
            <div className="space-y-3">
              {cat.items.map((item) => (
                <details
                  key={item.q}
                  className="group rounded-xl border border-white/[0.06] bg-white/[0.02] ring-hairline transition-colors open:border-white/[0.12] open:bg-white/[0.03]"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-left [&::-webkit-details-marker]:hidden">
                    <span className="text-sm font-medium text-white">
                      {item.q}
                    </span>
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-zinc-400 transition-all duration-300 group-open:rotate-45 group-open:border-emerald-500/40 group-open:text-emerald-400">
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    </span>
                  </summary>
                  <p className="px-5 pb-5 pt-0 text-sm text-gray-400 leading-relaxed">
                    {item.a}
                  </p>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-16 pt-8 border-t border-white/[0.06] text-center">
        <p className="text-sm text-zinc-500">
          Still have questions?{" "}
          <a
            href="mailto:support@plebs.finance"
            className="text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            support@plebs.finance
          </a>
        </p>
      </div>
    </main>
  );
}
