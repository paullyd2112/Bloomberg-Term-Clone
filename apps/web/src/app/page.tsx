import Link from "next/link";
import type { Metadata } from "next";
import NewsletterSignup from "@/components/NewsletterSignup";
import TickerBar from "@/components/TickerBar";

export const metadata: Metadata = {
  title: "Plebs.finance — Trading Intelligence for Retail Traders",
  description:
    "Real-time AI signals for stocks, crypto, and prediction markets. Congressional trade tracker, options flow, morning briefing — everything Bloomberg has, built for the WSB crowd.",
};

// ─── Nav ──────────────────────────────────────────────────────────────────────

function Nav() {
  return (
    <nav className="fixed top-0 inset-x-0 z-50 border-b border-zinc-800/60 bg-[#09090b]/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link href="/" className="text-lg font-extrabold text-white tracking-tight">
          plebs<span className="text-green-400">.finance</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-sm text-zinc-400 hover:text-white transition-colors px-3 py-1.5"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="text-sm bg-green-500 hover:bg-green-400 text-black font-semibold px-4 py-1.5 rounded-lg transition-colors"
          >
            Start free trial
          </Link>
        </div>
      </div>
    </nav>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="pt-32 pb-20 px-4 text-center">
      <div className="inline-flex items-center gap-2 bg-green-500/10 border border-green-700/40 text-green-400 text-xs font-semibold px-3 py-1 rounded-full mb-8">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
        Live signals updating now
      </div>

      <h1 className="text-4xl sm:text-6xl font-extrabold text-white leading-tight tracking-tight max-w-3xl mx-auto">
        Bloomberg depth.{" "}
        <span className="text-green-400">WSB energy.</span>
      </h1>

      <p className="mt-6 text-lg text-zinc-400 max-w-xl mx-auto leading-relaxed">
        AI-generated signals for stocks, crypto, and prediction markets.
        Options flow, congressional trades, and a morning briefing — all in one terminal.
      </p>

      <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
        <Link
          href="/signup"
          className="w-full sm:w-auto inline-block bg-green-500 hover:bg-green-400 text-black font-bold text-base px-8 py-3.5 rounded-xl transition-colors"
        >
          Start free — 7-day trial →
        </Link>
        <Link
          href="/login"
          className="w-full sm:w-auto inline-block border border-zinc-700 hover:border-zinc-500 text-zinc-300 text-base px-8 py-3.5 rounded-xl transition-colors text-center"
        >
          Sign in
        </Link>
      </div>

      <p className="mt-4 text-xs text-zinc-600">
        7-day free trial · Credit card required · Cancel anytime
      </p>
    </section>
  );
}

// ─── Signal preview strip ──────────────────────────────────────────────────────

function SignalStrip() {
  const signals = [
    { direction: "BUY",  ticker: "NVDA",      confidence: 84, horizon: "Swing",   color: "text-green-400 border-green-700 bg-green-500/10" },
    { direction: "YES",  ticker: "BTC>100k",  confidence: 71, horizon: "Swing",   color: "text-green-400 border-green-700 bg-green-500/10" },
    { direction: "SELL", ticker: "GME",        confidence: 78, horizon: "Intraday",color: "text-red-400 border-red-700 bg-red-500/10" },
    { direction: "BUY",  ticker: "ETH",        confidence: 67, horizon: "Swing",   color: "text-green-400 border-green-700 bg-green-500/10" },
    { direction: "NO",   ticker: "Fed cut Nov",confidence: 62, horizon: "Longterm",color: "text-red-400 border-red-700 bg-red-500/10" },
    { direction: "BUY",  ticker: "TSLA",       confidence: 73, horizon: "Swing",   color: "text-green-400 border-green-700 bg-green-500/10" },
  ];

  return (
    <section className="pb-20 px-4">
      <div className="max-w-6xl mx-auto">
        <p className="text-center text-xs text-zinc-600 mb-4 uppercase tracking-widest font-semibold">
          Sample signals — real feed on dashboard
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {signals.map((s, i) => (
            <div
              key={i}
              className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded border ${s.color}`}
                  >
                    {s.direction}
                  </span>
                  <span className="font-mono font-semibold text-white">{s.ticker}</span>
                </div>
                <span className="text-xs text-zinc-500">{s.horizon}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${s.confidence >= 75 ? "bg-green-500" : "bg-amber-500"}`}
                    style={{ width: `${s.confidence}%` }}
                  />
                </div>
                <span className="text-xs text-zinc-400 tabular-nums">{s.confidence}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Features ─────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: "⚡",
    title: "Real-time AI signals",
    desc: "Claude-powered analysis across stocks, crypto, and Polymarket / Kalshi contracts. BUY, SELL, YES, NO — with confidence scores and reasoning.",
  },
  {
    icon: "🏛",
    title: "Congressional trade tracker",
    desc: "STOCK Act disclosures for every House and Senate member. See what politicians are buying before the news breaks.",
  },
  {
    icon: "🌊",
    title: "Options flow + dark pool",
    desc: "Unusual call/put sweeps and block trades flagged in real time. Follow the smart money before retail catches on.",
  },
  {
    icon: "☀️",
    title: "Morning briefing",
    desc: "AI-written market brief lands in your inbox at 8:45am ET every weekday. Tone, top signals, macro context, risk note.",
  },
  {
    icon: "📊",
    title: "Portfolio tracker",
    desc: "Log entries, track P&L, and see how your positions stack up against the signals that called them.",
  },
  {
    icon: "🎯",
    title: "Signal accuracy per asset",
    desc: "Every signal is tracked to outcome. Win rates per ticker — so you know which calls actually make money.",
  },
];

function Features() {
  return (
    <section className="py-20 px-4 border-t border-zinc-800/60">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold text-white">
            Everything in one terminal
          </h2>
          <p className="text-zinc-500 mt-3 max-w-lg mx-auto">
            Stop juggling 6 tabs. Signals, flow, filings, and briefings — all in one place.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 hover:border-zinc-700 transition-colors"
            >
              <div className="text-3xl mb-4">{f.icon}</div>
              <h3 className="text-white font-semibold mb-2">{f.title}</h3>
              <p className="text-zinc-500 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Pricing ──────────────────────────────────────────────────────────────────

const PLANS = [
  {
    name:     "Lifetime Pro",
    price:    "$399",
    period:   "once",
    highlight: true,
    cta:      "Get lifetime access",
    href:     "/dashboard/upgrade",
    features: [
      "Real-time signals — stocks, crypto & predictions",
      "Unlimited watchlist",
      "Full options flow + dark pool",
      "Morning briefing email (8:45am ET)",
      "Portfolio tracker",
      "Price & signal alerts",
      "Congressional trades tracker",
      "Per-asset AI accuracy tracking",
      "Forever access",
    ],
  },
  {
    name:     "Pro",
    price:    "$79",
    period:   "/mo",
    highlight: false,
    cta:      "Start 7-day trial",
    href:     "/signup",
    features: [
      "Real-time signals — stocks, crypto & predictions",
      "Unlimited watchlist",
      "Full options flow + dark pool",
      "Morning briefing email (8:45am ET)",
      "Portfolio tracker",
      "Price & signal alerts",
      "Congressional trades tracker",
      "Per-asset AI accuracy tracking",
    ],
  },
  {
    name:     "Elite",
    price:    "$149",
    period:   "/mo",
    highlight: false,
    cta:      "Start 7-day trial",
    href:     "/signup",
    features: [
      "Everything in Pro",
      "Pleby — AI trading analyst",
      "Ask Pleby about any asset",
      "Personalised morning briefing",
      "Priority signal delivery",
    ],
  },
];

function Pricing() {
  return (
    <section className="py-20 px-4 border-t border-zinc-800/60">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold text-white">Simple pricing</h2>
          <p className="text-zinc-500 mt-3">Start free. Upgrade when the signals pay for themselves.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-xl p-6 border ${
                plan.highlight
                  ? "border-green-600 bg-green-500/5"
                  : "border-zinc-800 bg-zinc-900"
              }`}
            >
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-green-500 text-black text-xs font-bold px-3 py-1 rounded-full">
                    Most popular
                  </span>
                </div>
              )}

              <div className="mb-6">
                <div className="text-zinc-400 text-sm font-medium mb-1">{plan.name}</div>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-white">{plan.price}</span>
                  <span className="text-zinc-500 text-sm">{plan.period}</span>
                </div>
              </div>

              <Link
                href={plan.href}
                className={`block w-full text-center py-2.5 rounded-lg font-semibold text-sm mb-6 transition-colors ${
                  plan.highlight
                    ? "bg-green-500 hover:bg-green-400 text-black"
                    : "border border-zinc-700 hover:border-zinc-500 text-zinc-300"
                }`}
              >
                {plan.cta}
              </Link>

              <ul className="space-y-2.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-zinc-400">
                    <span className="text-green-400 mt-0.5 flex-shrink-0">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="text-center text-zinc-600 text-xs mt-8">
          All plans include a 7-day free trial · Credit card required · Cancel anytime
        </p>
      </div>
    </section>
  );
}

// ─── Stats bar ────────────────────────────────────────────────────────────────

function Stats() {
  const items = [
    { value: "3 markets",  label: "Stocks, crypto & predictions" },
    { value: "8:45am ET",  label: "Daily briefing delivery" },
    { value: "2h cooldown",label: "Signal dedup window" },
    { value: "7-day trial",label: "CC required, cancel anytime" },
  ];

  return (
    <section className="py-14 px-4 border-t border-zinc-800/60">
      <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
        {items.map((item) => (
          <div key={item.label} className="text-center">
            <div className="text-2xl font-bold text-white">{item.value}</div>
            <div className="text-zinc-500 text-xs mt-1">{item.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── CTA strip ────────────────────────────────────────────────────────────────

function CTAStrip() {
  return (
    <section className="py-20 px-4 border-t border-zinc-800/60">
      <div className="max-w-2xl mx-auto text-center space-y-6">
        <h2 className="text-3xl sm:text-4xl font-bold text-white">
          Ready to trade with an edge?
        </h2>
        <p className="text-zinc-500">
          7-day trial. Real-time signals from day one.
        </p>
        <Link
          href="/signup"
          className="inline-block bg-green-500 hover:bg-green-400 text-black font-bold text-base px-10 py-3.5 rounded-xl transition-colors"
        >
          Start your free trial →
        </Link>
        <div className="pt-6 border-t border-zinc-800/60">
          <p className="text-zinc-500 text-sm mb-4">
            Not ready to sign up? Get the free daily newsletter — markets in plain English, every weekday at 7am ET.
          </p>
          <NewsletterSignup />
        </div>
        <p className="text-zinc-700 text-xs">Not financial advice.</p>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="border-t border-zinc-800/60 py-10 px-4">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="text-base font-extrabold text-white tracking-tight">
          plebs<span className="text-green-400">.finance</span>
        </div>
        <div className="flex items-center gap-6 text-xs text-zinc-500">
          <Link href="/dashboard" className="hover:text-zinc-300 transition-colors">Dashboard</Link>
          <Link href="/terms"     className="hover:text-zinc-300 transition-colors">Terms</Link>
          <Link href="/privacy"   className="hover:text-zinc-300 transition-colors">Privacy</Link>
          <Link href="/unsubscribe" className="hover:text-zinc-300 transition-colors">Unsubscribe</Link>
        </div>
        <div className="text-xs text-zinc-600">
          © {new Date().getFullYear()} Plebs.io · Not financial advice
        </div>
      </div>
    </footer>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="bg-[#09090b] min-h-screen">
      <Nav />
      <div className="pt-14">
        <TickerBar />
      </div>
      <main>
        <Hero />
        <SignalStrip />
        <Features />
        <Stats />
        <Pricing />
        <CTAStrip />
      </main>
      <Footer />
    </div>
  );
}
