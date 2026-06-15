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
  title: "Plebs.finance — Trading Intelligence for Retail Traders",
  description:
    "Real-time AI signals for stocks, crypto, and prediction markets. Congressional trade tracker, options flow, morning briefing — everything Bloomberg has, built for the WSB crowd.",
};

// ─── Nav ──────────────────────────────────────────────────────────────────────

function Nav() {
  return (
    <nav className="fixed top-0 inset-x-0 z-50 border-b border-white/[0.06] bg-black/70 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Plebs" className="h-7 w-auto" />
        </Link>
        <div className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/login"
            className="text-sm text-zinc-400 hover:text-white transition-colors px-3 py-1.5"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="group text-sm bg-green-500 hover:bg-green-400 text-black font-semibold pl-4 pr-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
          >
            Start free
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </div>
      </div>
    </nav>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="relative px-4">
      {/* backdrop grid + glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-grid mask-fade" />
        <div className="absolute left-1/2 top-0 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-green-500/10 blur-[120px]" />
      </div>

      <div className="relative max-w-3xl mx-auto pt-32 pb-16 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-medium text-zinc-300 mb-8">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-400" />
          </span>
          <span className="font-mono uppercase tracking-widest text-[10px] text-green-400">
            Live
          </span>
          <span className="text-zinc-500">Signals updating now</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-semibold text-white leading-[1.05] tracking-tight text-balance">
          Bloomberg depth.
          <br />
          <span className="text-green-400">WSB energy.</span>
        </h1>

        <p className="mt-6 text-lg text-zinc-400 max-w-xl mx-auto leading-relaxed text-pretty">
          AI-generated signals for stocks, crypto, and prediction markets.
          Options flow, congressional trades, and a morning briefing — all in one terminal.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/signup"
            className="group w-full sm:w-auto inline-flex items-center justify-center gap-1.5 bg-green-500 hover:bg-green-400 text-black font-semibold text-base px-7 py-3 rounded-xl transition-colors"
          >
            Start free — 14-day trial
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
          <Link
            href="/login"
            className="w-full sm:w-auto inline-flex items-center justify-center border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/20 text-zinc-200 text-base px-7 py-3 rounded-xl transition-colors"
          >
            Sign in
          </Link>
        </div>

        <p className="mt-4 text-xs text-zinc-600">
          14-day free trial · Credit card required · Cancel anytime
        </p>
      </div>

      {/* Terminal mockup */}
      <TerminalMockup />
    </section>
  );
}

// ─── Terminal mockup (premium product shot) ────────────────────────────────────

function TerminalMockup() {
  const rows = [
    { dir: "BUY",  ticker: "NVDA",      asset: "Equity",   conf: 84, horizon: "Swing",    up: true  },
    { dir: "YES",  ticker: "BTC>100K",  asset: "Kalshi",   conf: 71, horizon: "Swing",    up: true  },
    { dir: "SELL", ticker: "GME",       asset: "Equity",   conf: 78, horizon: "Intraday", up: false },
    { dir: "BUY",  ticker: "ETH",       asset: "Crypto",   conf: 67, horizon: "Swing",    up: true  },
    { dir: "NO",   ticker: "FED-CUT-N", asset: "Polymkt",  conf: 62, horizon: "Longterm", up: false },
  ];

  return (
    <div className="relative max-w-5xl mx-auto">
      {/* glow under panel */}
      <div className="pointer-events-none absolute -inset-x-8 -top-6 bottom-0 bg-green-500/[0.07] blur-3xl rounded-full" />

      <div className="relative rounded-2xl border border-white/10 bg-zinc-950/80 backdrop-blur-sm overflow-hidden ring-hairline shadow-2xl shadow-black/60">
        {/* window chrome */}
        <div className="flex items-center gap-2 border-b border-white/[0.06] bg-white/[0.02] px-4 py-3">
          <span className="h-3 w-3 rounded-full bg-zinc-700" />
          <span className="h-3 w-3 rounded-full bg-zinc-700" />
          <span className="h-3 w-3 rounded-full bg-zinc-700" />
          <div className="ml-3 flex items-center gap-2 font-mono text-[11px] text-zinc-500">
            <span className="text-zinc-400">plebs</span>
            <span className="text-zinc-700">/</span>
            <span>terminal — live signal feed</span>
          </div>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-green-700/40 bg-green-500/10 px-2 py-0.5 font-mono text-[10px] text-green-400">
            <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
            CONNECTED
          </span>
        </div>

        {/* table header */}
        <div className="hidden sm:grid grid-cols-[80px_1fr_1fr_1.4fr_90px] gap-4 px-5 py-2.5 border-b border-white/[0.06] font-mono text-[10px] uppercase tracking-widest text-zinc-600">
          <div>Signal</div>
          <div>Ticker</div>
          <div>Market</div>
          <div>Confidence</div>
          <div className="text-right">Horizon</div>
        </div>

        {/* rows */}
        <div className="divide-y divide-white/[0.04]">
          {rows.map((r) => (
            <div
              key={r.ticker}
              className="grid grid-cols-2 sm:grid-cols-[80px_1fr_1fr_1.4fr_90px] gap-x-4 gap-y-2 px-5 py-3.5 items-center hover:bg-white/[0.02] transition-colors"
            >
              <span
                className={`justify-self-start text-[11px] font-bold px-2 py-0.5 rounded border font-mono ${
                  r.up
                    ? "text-green-400 border-green-700/50 bg-green-500/10"
                    : "text-red-400 border-red-700/50 bg-red-500/10"
                }`}
              >
                {r.dir}
              </span>
              <span className="font-mono font-semibold text-white text-sm justify-self-end sm:justify-self-start tabular-nums">
                {r.ticker}
              </span>
              <span className="hidden sm:block text-xs text-zinc-500">{r.asset}</span>
              <div className="col-span-2 sm:col-span-1 flex items-center gap-2.5">
                <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${r.conf >= 75 ? "bg-green-500" : "bg-amber-500"}`}
                    style={{ width: `${r.conf}%` }}
                  />
                </div>
                <span className="font-mono text-xs text-zinc-300 tabular-nums w-9 text-right">
                  {r.conf}%
                </span>
              </div>
              <span className="hidden sm:block text-right text-xs text-zinc-500">{r.horizon}</span>
            </div>
          ))}
        </div>

        <div className="border-t border-white/[0.06] bg-white/[0.02] px-5 py-2.5 font-mono text-[10px] text-zinc-600">
          Sample feed — your live dashboard refreshes in real time.
        </div>
      </div>
    </div>
  );
}

// ─── Trust / stats strip ────────────────────────────────────────────────────────

function Stats() {
  const items = [
    { value: "3", label: "Markets — stocks, crypto, predictions" },
    { value: "8:45a", label: "Daily briefing, every weekday ET" },
    { value: "2h", label: "Signal dedup cooldown window" },
    { value: "14d", label: "Free trial, cancel anytime" },
  ];

  return (
    <section className="py-16 px-4 border-t border-white/[0.06]">
      <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-10">
        {items.map((item) => (
          <div key={item.label} className="text-center">
            <div className="font-mono text-3xl font-semibold text-white tracking-tight tabular-nums">
              {item.value}
            </div>
            <div className="text-zinc-500 text-xs mt-2 leading-relaxed max-w-[14rem] mx-auto">
              {item.label}
            </div>
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
    desc: "Claude-powered analysis across stocks, crypto, and Polymarket / Kalshi contracts. BUY, SELL, YES, NO — with confidence scores and reasoning.",
  },
  {
    icon: Landmark,
    title: "Congressional trade tracker",
    desc: "STOCK Act disclosures for every House and Senate member. See what politicians are buying before the news breaks.",
  },
  {
    icon: Waves,
    title: "Options flow + dark pool",
    desc: "Unusual call/put sweeps and block trades flagged in real time. Follow the smart money before retail catches on.",
  },
  {
    icon: Sunrise,
    title: "Morning briefing",
    desc: "AI-written market brief lands in your inbox at 8:45am ET every weekday. Tone, top signals, macro context, risk note.",
  },
  {
    icon: Wallet,
    title: "Portfolio tracker",
    desc: "Log entries, track P&L, and see how your positions stack up against the signals that called them.",
  },
  {
    icon: Target,
    title: "Signal accuracy per asset",
    desc: "Every signal is tracked to outcome. Win rates per ticker — so you know which calls actually make money.",
  },
];

function Features() {
  return (
    <section className="py-24 px-4 border-t border-white/[0.06]">
      <div className="max-w-6xl mx-auto">
        <div className="max-w-2xl mb-14">
          <div className="font-mono text-xs uppercase tracking-widest text-green-400 mb-3">
            The terminal
          </div>
          <h2 className="text-3xl sm:text-4xl font-semibold text-white tracking-tight text-balance">
            Everything in one place
          </h2>
          <p className="text-zinc-500 mt-4 leading-relaxed">
            Stop juggling six tabs. Signals, flow, filings, and briefings — the full
            institutional toolkit, priced for retail.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-white/[0.06] rounded-2xl overflow-hidden border border-white/[0.06]">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="group relative bg-zinc-950 p-7 hover:bg-zinc-900/60 transition-colors"
              >
                <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-green-700/30 bg-green-500/10 text-green-400">
                  <Icon className="h-5 w-5" />
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

// ─── Pricing ──────────────────────────────────────────────────────────────────

const PLANS = [
  {
    name:      "Pro",
    price:     "$40",
    period:    "/mo",
    highlight: false,
    cta:       "Start 14-day trial",
    href:      "/signup",
    features: [
      "Real-time AI signals — stocks & crypto",
      "Unlimited watchlist",
      "Full options flow + dark pool",
      "Congressional trade tracker",
      "Morning briefing email (7am ET)",
      "Portfolio tracker + P&L",
      "Price & signal alerts",
      "Per-asset AI accuracy tracking",
    ],
  },
  {
    name:      "Elite",
    price:     "$80",
    period:    "/mo",
    highlight: true,
    cta:       "Start 14-day trial",
    href:      "/signup",
    features: [
      "Everything in Pro",
      "Prediction market signals (Kalshi + Polymarket)",
      "The real alpha — AI finds mispriced contracts",
      "Pleby — AI trading analyst chat",
      "Ask Pleby about any asset anytime",
      "Personalised morning briefing",
      "Priority signal delivery",
    ],
  },
];

function Pricing() {
  return (
    <section className="py-24 px-4 border-t border-white/[0.06]">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <div className="font-mono text-xs uppercase tracking-widest text-green-400 mb-3">
            Pricing
          </div>
          <h2 className="text-3xl sm:text-4xl font-semibold text-white tracking-tight">
            Simple pricing
          </h2>
          <p className="text-zinc-500 mt-4">
            Two tiers. No free tier. The signals pay for themselves.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl mx-auto">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-2xl p-7 border ${
                plan.highlight
                  ? "border-green-600/50 bg-green-500/[0.04] glow-green"
                  : "border-white/10 bg-zinc-950 ring-hairline"
              }`}
            >
              {plan.highlight && (
                <div className="absolute -top-3 left-7">
                  <span className="bg-green-500 text-black text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full">
                    Most popular
                  </span>
                </div>
              )}

              <div className="mb-6">
                <div className="text-zinc-400 text-sm font-medium mb-2">{plan.name}</div>
                <div className="flex items-baseline gap-1">
                  <span className="font-mono text-4xl font-semibold text-white tracking-tight">
                    {plan.price}
                  </span>
                  <span className="text-zinc-500 text-sm">{plan.period}</span>
                </div>
              </div>

              <Link
                href={plan.href}
                className={`block w-full text-center py-2.5 rounded-lg font-semibold text-sm mb-6 transition-colors ${
                  plan.highlight
                    ? "bg-green-500 hover:bg-green-400 text-black"
                    : "border border-white/10 bg-white/[0.02] hover:bg-white/[0.06] text-zinc-200"
                }`}
              >
                {plan.cta}
              </Link>

              <ul className="space-y-3">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-zinc-400">
                    <CircleCheck className="h-4 w-4 mt-0.5 flex-shrink-0 text-green-400" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="text-center text-zinc-600 text-xs mt-8">
          14-day free trial · Credit card required · Cancel anytime
        </p>

        {/* Lifetime callout */}
        <div className="mt-6 max-w-xl mx-auto rounded-xl border border-amber-500/25 bg-amber-500/[0.04] px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-white flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-400" />
              Prefer to pay once? Lifetime access from $399
            </div>
            <div className="text-xs text-zinc-500 mt-1">
              Limited time only — pay once, keep access forever.
            </div>
          </div>
          <Link
            href="/signup"
            className="flex-shrink-0 inline-flex items-center gap-1 bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
          >
            Get lifetime
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

// ─── Testimonials ─────────────────────────────────────────────────────────────

const IMESSAGES: { name: string; messages: { from: "them" | "me"; text: string }[] }[] = [
  {
    name: "Jordan K.",
    messages: [
      { from: "me",   text: "Pleby just called NVDA swing buy at open. up 4.1% by close lol" },
      { from: "them", text: "wait what app is this" },
      { from: "me",   text: "Plebs. AI signals. $40/mo. made that back day one" },
      { from: "them", text: "sending you my venmo for the sub rn" },
    ],
  },
  {
    name: "Marcus T.",
    messages: [
      { from: "them", text: "bro the congress tracker flagged a senator buying semis before the AI bill vote" },
      { from: "me",   text: "no way" },
      { from: "them", text: "yeah loaded calls that morning. printed" },
      { from: "me",   text: "this app pays for itself" },
    ],
  },
];

const EMAILS: { from: string; subject: string; body: string }[] = [
  {
    from:    "Ryan M.",
    subject: "Re: morning brief",
    body:    "Didn't expect much tbh but the 8:45am brief is now part of my routine. Caught the TSLA reversal signal before the move yesterday. Keep it up.",
  },
  {
    from:    "Destiny A.",
    subject: "The prediction market signals are different",
    body:    "Tried Unusual Whales, Benzinga, all of them. Nobody else is doing prediction market signals for retail. The Kalshi plays alone are worth the sub.",
  },
];

function Testimonials() {
  return (
    <section className="py-24 px-4 border-t border-white/[0.06]">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <div className="font-mono text-xs uppercase tracking-widest text-green-400 mb-3">
            Word of mouth
          </div>
          <h2 className="text-3xl sm:text-4xl font-semibold text-white tracking-tight">
            What people are saying
          </h2>
          <p className="text-zinc-500 mt-4">From the group chats and inboxes of actual users.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {IMESSAGES.map((convo) => (
            <div
              key={convo.name}
              className="bg-zinc-950 border border-white/10 rounded-2xl overflow-hidden ring-hairline"
            >
              <div className="bg-white/[0.03] px-4 py-3 flex items-center gap-3 border-b border-white/[0.06]">
                <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold text-white">
                  {convo.name.charAt(0)}
                </div>
                <span className="text-sm font-medium text-white">{convo.name}</span>
                <span className="ml-auto font-mono text-[10px] text-zinc-600">iMessage</span>
              </div>
              <div className="p-4 space-y-2">
                {convo.messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.from === "me" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[75%] px-3.5 py-2 rounded-2xl text-sm leading-snug ${
                        msg.from === "me"
                          ? "bg-green-500 text-black rounded-br-sm"
                          : "bg-zinc-800 text-zinc-100 rounded-bl-sm"
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {EMAILS.map((email) => (
            <div
              key={email.from}
              className="bg-zinc-950 border border-white/10 rounded-2xl overflow-hidden ring-hairline"
            >
              <div className="px-5 py-3 border-b border-white/[0.06] space-y-1">
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <span className="font-mono text-zinc-600">From:</span>
                  <span className="text-white font-medium">{email.from}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <span className="font-mono text-zinc-600">Subject:</span>
                  <span className="text-zinc-300">{email.subject}</span>
                </div>
              </div>
              <div className="px-5 py-4 text-sm text-zinc-400 leading-relaxed">
                &ldquo;{email.body}&rdquo;
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── CTA strip ────────────────────────────────────────────────────────────────

function CTAStrip() {
  return (
    <section className="relative py-24 px-4 border-t border-white/[0.06] overflow-hidden">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[300px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-green-500/10 blur-[120px]" />

      <div className="relative max-w-2xl mx-auto text-center space-y-6">
        <h2 className="text-3xl sm:text-4xl font-semibold text-white tracking-tight text-balance">
          Ready to trade with an edge?
        </h2>
        <p className="text-zinc-400">14-day trial. Real-time signals from day one.</p>
        <Link
          href="/signup"
          className="group inline-flex items-center justify-center gap-1.5 bg-green-500 hover:bg-green-400 text-black font-semibold text-base px-9 py-3.5 rounded-xl transition-colors"
        >
          Start your free trial
          <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </Link>

        <div className="pt-8 mt-2 border-t border-white/[0.06]">
          <p className="text-zinc-500 text-sm mb-4 max-w-md mx-auto leading-relaxed">
            Not ready to sign up? Get the free daily newsletter — markets in plain
            English, every weekday at 7am ET.
          </p>
          <NewsletterSignup />
        </div>

        <p className="inline-flex items-center gap-1.5 text-zinc-600 text-xs">
          <ShieldCheck className="h-3.5 w-3.5" />
          Not financial advice.
        </p>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="border-t border-white/[0.06] py-10 px-4">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="text-base font-semibold text-white tracking-tight">
          plebs<span className="text-green-400">.finance</span>
        </div>
        <div className="flex items-center gap-6 text-xs text-zinc-500">
          <Link href="/dashboard" className="hover:text-zinc-200 transition-colors">Dashboard</Link>
          <Link href="/terms"     className="hover:text-zinc-200 transition-colors">Terms</Link>
          <Link href="/privacy"   className="hover:text-zinc-200 transition-colors">Privacy</Link>
          <Link href="/unsubscribe" className="hover:text-zinc-200 transition-colors">Unsubscribe</Link>
        </div>
        <div className="font-mono text-xs text-zinc-600">
          © {new Date().getFullYear()} Plebs.io · Not financial advice
        </div>
      </div>
    </footer>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="font-sans bg-black min-h-screen antialiased selection:bg-green-500/30 selection:text-white">
      <Nav />
      <div className="pt-14">
        <TickerBar />
      </div>
      <main>
        <Hero />
        <Stats />
        <Features />
        <Testimonials />
        <Pricing />
        <CTAStrip />
      </main>
      <Footer />
    </div>
  );
}
