import Link from "next/link";
import type { Metadata } from "next";
import {
  Zap,
  Landmark,
  Waves,
  Sunrise,
  Wallet,
  Target,
  ArrowUpRight,
  CircleCheck,
  ShieldCheck,
} from "lucide-react";
import NewsletterSignup from "@/components/NewsletterSignup";
import TickerBar from "@/components/TickerBar";

export const metadata: Metadata = {
  title: "Plebs — Hedge fund tools. Retail prices.",
  description:
    "Real-time AI signals for stocks, crypto, and prediction markets. Congressional trade tracker, options flow, morning briefing — Wall Street's toolkit, finally for everyone.",
};

// ─── Nav ──────────────────────────────────────────────────────────────────────

function Nav() {
  return (
    <nav className="fixed top-0 inset-x-0 z-50 border-b border-white/[0.06] bg-black/70 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2" aria-label="Plebs home">
          <span className="text-lg font-semibold tracking-tight text-white">
            Plebs<span className="text-emerald-400">.</span>
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-8 text-sm text-zinc-400">
          <a href="#terminal" className="hover:text-white transition-colors">The terminal</a>
          <a href="#proof" className="hover:text-white transition-colors">Results</a>
          <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
        </div>

        <div className="flex items-center gap-1 sm:gap-3">
          <Link
            href="/login"
            className="text-sm text-zinc-400 hover:text-white transition-colors px-2 sm:px-3 py-1.5"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="group text-sm bg-emerald-500 hover:bg-emerald-400 text-black font-semibold pl-4 pr-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
          >
            Start free
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </div>
      </div>
    </nav>
  );
}

// ─── Section label ──────────────────────────────────────────────────────────────

function SectionLabel({ index, children }: { index: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-500">
      <span className="text-emerald-400">{index}</span>
      <span className="h-px w-8 bg-white/15" />
      <span>{children}</span>
    </div>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="relative px-5 sm:px-8 overflow-hidden">
      {/* backdrop glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-20 left-1/4 h-[480px] w-[680px] -translate-x-1/2 rounded-full bg-emerald-500/[0.08] blur-[130px]" />
      </div>

      <div className="relative max-w-6xl mx-auto pt-28 sm:pt-32 pb-20">
        <div className="grid lg:grid-cols-12 gap-12 lg:gap-10 items-center">
          {/* Left — editorial copy */}
          <div className="lg:col-span-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs mb-7">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
              <span className="font-mono uppercase tracking-[0.18em] text-[10px] text-emerald-400">
                Live
              </span>
              <span className="text-zinc-500">Markets open · signals updating</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-semibold text-white leading-[1.04] tracking-tight text-balance">
              Hedge fund tools.
              <br />
              <span className="text-emerald-400">Retail prices.</span>
            </h1>

            <p className="mt-6 text-lg text-zinc-400 max-w-md leading-relaxed text-pretty">
              Real-time AI signals across stocks, crypto, and prediction markets —
              plus options flow, congressional trades, and a morning briefing. One terminal.
            </p>

            <div className="mt-9 flex flex-col sm:flex-row sm:items-center gap-3">
              <Link
                href="/signup"
                className="group inline-flex items-center justify-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-base px-6 py-3 rounded-xl transition-colors"
              >
                Start 14-day trial
                <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center justify-center text-zinc-300 hover:text-white text-base px-5 py-3 transition-colors"
              >
                Sign in →
              </Link>
            </div>

            <p className="mt-5 font-mono text-[11px] uppercase tracking-wider text-zinc-600">
              Cancel anytime · No lock-in
            </p>
          </div>

          {/* Right — live panel */}
          <div className="lg:col-span-6">
            <TerminalMockup />
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Terminal mockup (premium product shot) ────────────────────────────────────

function TerminalMockup() {
  const rows = [
    { dir: "BUY",  ticker: "NVDA",     asset: "Equity",  conf: 84, up: true  },
    { dir: "YES",  ticker: "BTC>100K", asset: "Kalshi",  conf: 71, up: true  },
    { dir: "SELL", ticker: "GME",      asset: "Equity",  conf: 78, up: false },
    { dir: "BUY",  ticker: "ETH",      asset: "Crypto",  conf: 67, up: true  },
    { dir: "NO",   ticker: "FED-CUT",  asset: "Polymkt", conf: 62, up: false },
  ];

  return (
    <div className="relative">
      <div className="pointer-events-none absolute -inset-6 bg-emerald-500/[0.06] blur-3xl rounded-full" />

      <div className="relative rounded-2xl border border-white/10 bg-zinc-950/90 backdrop-blur-sm overflow-hidden ring-hairline shadow-2xl shadow-black/60">
        {/* window chrome */}
        <div className="flex items-center gap-2 border-b border-white/[0.06] bg-white/[0.02] px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
          <div className="ml-3 font-mono text-[11px] text-zinc-500">
            <span className="text-zinc-400">plebs</span>
            <span className="text-zinc-700"> / </span>
            <span>live signal feed</span>
          </div>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-emerald-700/40 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            LIVE
          </span>
        </div>

        {/* rows */}
        <div className="divide-y divide-white/[0.04]">
          {rows.map((r) => (
            <div
              key={r.ticker}
              className="grid grid-cols-[52px_1fr_auto] gap-3 px-4 py-3.5 items-center hover:bg-white/[0.02] transition-colors"
            >
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded border font-mono text-center ${
                  r.up
                    ? "text-emerald-400 border-emerald-700/50 bg-emerald-500/10"
                    : "text-rose-400 border-rose-700/50 bg-rose-500/10"
                }`}
              >
                {r.dir}
              </span>

              <div className="min-w-0">
                <div className="font-mono font-semibold text-white text-sm tabular-nums truncate">
                  {r.ticker}
                </div>
                <div className="text-[11px] text-zinc-600">{r.asset}</div>
              </div>

              <div className="flex items-center gap-2.5">
                <div className="h-1 w-20 sm:w-28 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${r.conf >= 75 ? "bg-emerald-500" : "bg-emerald-500/50"}`}
                    style={{ width: `${r.conf}%` }}
                  />
                </div>
                <span className="font-mono text-xs text-zinc-300 tabular-nums w-8 text-right">
                  {r.conf}%
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-white/[0.06] bg-white/[0.02] px-4 py-2.5 font-mono text-[10px] text-zinc-600">
          Sample feed — your dashboard refreshes in real time.
        </div>
      </div>
    </div>
  );
}

// ─── Stats strip ────────────────────────────────────────────────────────────────

function Stats() {
  const items = [
    { value: "3",     label: "Markets covered" },
    { value: "8:45a", label: "Daily briefing, ET" },
    { value: "<2s",   label: "Signal latency" },
    { value: "14d",   label: "Free trial" },
  ];

  return (
    <section className="px-5 sm:px-8 border-t border-white/[0.06]">
      <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 divide-x divide-white/[0.06]">
        {items.map((item) => (
          <div key={item.label} className="py-10 px-6 first:pl-0">
            <div className="font-mono text-3xl sm:text-4xl font-semibold text-white tracking-tight tabular-nums">
              {item.value}
            </div>
            <div className="text-zinc-500 text-sm mt-2">{item.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Features ─────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: Zap,
    title: "Real-time AI signals",
    desc: "Model-driven analysis across stocks, crypto, and Polymarket / Kalshi contracts. BUY, SELL, YES, NO — each with a confidence score and the reasoning behind it.",
    wide: true,
  },
  {
    icon: Landmark,
    title: "Congressional trades",
    desc: "STOCK Act disclosures for every House and Senate member — surfaced before the headlines.",
  },
  {
    icon: Waves,
    title: "Options & dark pool flow",
    desc: "Unusual sweeps and block trades flagged in real time. Follow the smart money early.",
  },
  {
    icon: Sunrise,
    title: "Morning briefing",
    desc: "An AI-written market brief in your inbox at 8:45a ET — top signals, macro, and risk.",
  },
  {
    icon: Wallet,
    title: "Portfolio tracker",
    desc: "Log entries, track P&L, and measure your positions against the signals that called them.",
  },
  {
    icon: Target,
    title: "Accuracy per asset",
    desc: "Every signal is tracked to outcome, so you see real win rates per ticker — not vibes.",
  },
];

function Features() {
  return (
    <section id="terminal" className="py-24 px-5 sm:px-8 border-t border-white/[0.06]">
      <div className="max-w-6xl mx-auto">
        <div className="max-w-2xl mb-14">
          <SectionLabel index="01">The terminal</SectionLabel>
          <h2 className="mt-5 text-3xl sm:text-4xl font-semibold text-white tracking-tight text-balance">
            The institutional stack, in one tab
          </h2>
          <p className="text-zinc-500 mt-4 leading-relaxed">
            Stop juggling six subscriptions. Signals, flow, filings, and briefings —
            the full toolkit, priced for retail.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-white/[0.06] rounded-2xl overflow-hidden border border-white/[0.06]">
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className={`group relative bg-zinc-950 p-7 hover:bg-zinc-900/50 transition-colors ${
                  f.wide ? "sm:col-span-2 lg:col-span-1" : ""
                }`}
              >
                <div className="flex items-start justify-between mb-5">
                  <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-700/30 bg-emerald-500/10 text-emerald-400">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="font-mono text-[11px] text-zinc-700 tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="text-white font-medium mb-2">{f.title}</h3>
                <p className="text-zinc-500 text-sm leading-relaxed">{f.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── Social proof ────────────────────────────────────────────────────────────

const QUOTES = [
  {
    quote:
      "The 8:45a brief is the only newsletter I actually open. Caught the TSLA reversal a full session before the move.",
    name: "Ryan M.",
    role: "Swing trader",
  },
  {
    quote:
      "Nobody else is doing prediction-market signals for retail. The Kalshi plays alone have paid for the year.",
    name: "Destiny A.",
    role: "Options + events",
  },
  {
    quote:
      "Congress tracker flagged a senator loading semis before the AI bill vote. That one alert covered months of sub.",
    name: "Marcus T.",
    role: "Equities",
  },
];

function SocialProof() {
  return (
    <section id="proof" className="py-24 px-5 sm:px-8 border-t border-white/[0.06]">
      <div className="max-w-6xl mx-auto">
        <div className="max-w-2xl mb-14">
          <SectionLabel index="02">Results</SectionLabel>
          <h2 className="mt-5 text-3xl sm:text-4xl font-semibold text-white tracking-tight text-balance">
            Traders don&apos;t churn. They tell their group chat.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-white/[0.06] rounded-2xl overflow-hidden border border-white/[0.06]">
          {QUOTES.map((q) => (
            <figure key={q.name} className="bg-zinc-950 p-8 flex flex-col">
              <span className="font-serif text-4xl leading-none text-emerald-500/40">&ldquo;</span>
              <blockquote className="mt-3 text-zinc-200 leading-relaxed flex-1 text-pretty">
                {q.quote}
              </blockquote>
              <figcaption className="mt-6 pt-5 border-t border-white/[0.06] flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-emerald-500/10 border border-emerald-700/30 flex items-center justify-center font-mono text-sm font-semibold text-emerald-400">
                  {q.name.charAt(0)}
                </div>
                <div>
                  <div className="text-sm font-medium text-white">{q.name}</div>
                  <div className="text-xs text-zinc-500">{q.role}</div>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Pricing ──────────────────────────────────────────────────────────────────

const PLANS = [
  {
    name:      "Pro",
    price:     "$40",
    period:    "/mo",
    blurb:     "Everything you need to trade stocks & crypto with an edge.",
    highlight: false,
    cta:       "Start 14-day trial",
    href:      "/signup",
    features: [
      "Real-time AI signals — stocks & crypto",
      "Unlimited watchlist",
      "Full options flow + dark pool",
      "Congressional trade tracker",
      "Morning briefing email",
      "Portfolio tracker + P&L",
      "Price & signal alerts",
    ],
  },
  {
    name:      "Elite",
    price:     "$80",
    period:    "/mo",
    blurb:     "The real alpha — prediction markets and your own AI analyst.",
    highlight: true,
    cta:       "Start 14-day trial",
    href:      "/signup",
    features: [
      "Everything in Pro",
      "Prediction-market signals (Kalshi + Polymarket)",
      "AI finds mispriced contracts",
      "Pleby — your AI trading analyst, on call",
      "Personalised morning briefing",
      "Priority signal delivery",
    ],
  },
];

function Pricing() {
  return (
    <section id="pricing" className="py-24 px-5 sm:px-8 border-t border-white/[0.06]">
      <div className="max-w-5xl mx-auto">
        <div className="max-w-2xl mb-14">
          <SectionLabel index="03">Pricing</SectionLabel>
          <h2 className="mt-5 text-3xl sm:text-4xl font-semibold text-white tracking-tight">
            Two tiers. The signals pay for themselves.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-2xl p-8 border ${
                plan.highlight
                  ? "border-emerald-600/40 bg-emerald-500/[0.03] glow-green"
                  : "border-white/10 bg-zinc-950 ring-hairline"
              }`}
            >
              {plan.highlight && (
                <span className="absolute -top-3 left-8 bg-emerald-500 text-black text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full">
                  Most popular
                </span>
              )}

              <div className="flex items-baseline justify-between">
                <div className="text-zinc-300 font-medium">{plan.name}</div>
                <div className="flex items-baseline gap-1">
                  <span className="font-mono text-4xl font-semibold text-white tracking-tight">
                    {plan.price}
                  </span>
                  <span className="text-zinc-500 text-sm">{plan.period}</span>
                </div>
              </div>

              <p className="text-zinc-500 text-sm mt-3 leading-relaxed">{plan.blurb}</p>

              <Link
                href={plan.href}
                className={`block w-full text-center py-2.5 rounded-lg font-semibold text-sm my-7 transition-colors ${
                  plan.highlight
                    ? "bg-emerald-500 hover:bg-emerald-400 text-black"
                    : "border border-white/10 bg-white/[0.02] hover:bg-white/[0.06] text-zinc-200"
                }`}
              >
                {plan.cta}
              </Link>

              <ul className="space-y-3">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-zinc-400">
                    <CircleCheck className="h-4 w-4 mt-0.5 flex-shrink-0 text-emerald-400" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="text-center text-zinc-500 text-sm mt-8">
          14-day free trial, cancel anytime. Prefer to pay once?{" "}
          <Link href="/signup" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-4 transition-colors">
            Lifetime access from $399
          </Link>
          .
        </p>
      </div>
    </section>
  );
}

// ─── CTA strip ────────────────────────────────────────────────────────────────

function CTAStrip() {
  return (
    <section className="py-24 px-5 sm:px-8 border-t border-white/[0.06]">
      <div className="relative max-w-5xl mx-auto rounded-3xl border border-white/[0.08] bg-zinc-950 overflow-hidden ring-hairline">
        <div className="pointer-events-none absolute -top-24 left-1/2 h-[320px] w-[680px] -translate-x-1/2 rounded-full bg-emerald-500/[0.10] blur-[120px]" />

        <div className="relative px-6 sm:px-12 py-16 text-center">
          <h2 className="text-3xl sm:text-4xl font-semibold text-white tracking-tight text-balance">
            Trade with an edge tomorrow morning.
          </h2>
          <p className="text-zinc-400 mt-4">14-day trial. Real-time signals from day one.</p>

          <Link
            href="/signup"
            className="group mt-8 inline-flex items-center justify-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-base px-9 py-3.5 rounded-xl transition-colors"
          >
            Start your free trial
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>

          <div className="mt-12 pt-10 border-t border-white/[0.06] max-w-md mx-auto">
            <p className="text-zinc-500 text-sm mb-4 leading-relaxed">
              Not ready? Get the free daily newsletter — markets in plain English,
              every weekday at 7a ET.
            </p>
            <NewsletterSignup />
          </div>

          <p className="mt-8 inline-flex items-center gap-1.5 text-zinc-600 text-xs">
            <ShieldCheck className="h-3.5 w-3.5" />
            Not financial advice.
          </p>
        </div>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="border-t border-white/[0.06] py-10 px-5 sm:px-8">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="text-base font-semibold text-white tracking-tight">
          plebs<span className="text-emerald-400">.finance</span>
        </div>
        <div className="flex items-center gap-6 text-xs text-zinc-500">
          <Link href="/dashboard" className="hover:text-zinc-200 transition-colors">Dashboard</Link>
          <Link href="/terms"     className="hover:text-zinc-200 transition-colors">Terms</Link>
          <Link href="/privacy"   className="hover:text-zinc-200 transition-colors">Privacy</Link>
          <Link href="/unsubscribe" className="hover:text-zinc-200 transition-colors">Unsubscribe</Link>
        </div>
        <div className="font-mono text-xs text-zinc-600">
          © {new Date().getFullYear()} Plebs · Not financial advice
        </div>
      </div>
    </footer>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="font-sans bg-black min-h-screen antialiased selection:bg-emerald-500/30 selection:text-white">
      <Nav />
      <div className="pt-14">
        <TickerBar />
      </div>
      <main>
        <Hero />
        <Stats />
        <Features />
        <SocialProof />
        <Pricing />
        <CTAStrip />
      </main>
      <Footer />
    </div>
  );
}
