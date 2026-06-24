import Link from "next/link";
import type { Metadata } from "next";
import NewsletterSignup from "@/components/NewsletterSignup";
import TickerBar from "@/components/TickerBar";
import LiveSignalStrip from "@/components/landing/LiveSignalStrip";
import { createAdminClient } from "@/lib/supabase/admin";

export const revalidate = 120;

export const metadata: Metadata = {
  title: "Plebs.finance — Trading Intelligence for Retail Traders",
  description:
    "AI signals for stocks, crypto, and prediction markets. Unusual options flow, morning briefing, and per-asset accuracy tracking — everything Bloomberg has, built for the WSB crowd.",
};

// ─── Nav ──────────────────────────────────────────────────────────────────────

function Nav() {
  return (
    <nav className="fixed top-0 inset-x-0 z-50 border-b border-zinc-800/60 bg-[#09090b]/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link href="/">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Plebs" className="h-8 w-auto" />
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
        Unusual options flow, prediction-market edges, and a morning briefing — all in one terminal.
      </p>

      <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
        <Link
          href="/signup"
          className="w-full sm:w-auto inline-block bg-green-500 hover:bg-green-400 text-black font-bold text-base px-8 py-3.5 rounded-xl transition-colors"
        >
          Start free — 14-day trial →
        </Link>
        <Link
          href="/login"
          className="w-full sm:w-auto inline-block border border-zinc-700 hover:border-zinc-500 text-zinc-300 text-base px-8 py-3.5 rounded-xl transition-colors text-center"
        >
          Sign in
        </Link>
      </div>

      <p className="mt-4 text-xs text-zinc-600">
        14-day free trial · Credit card required · Cancel anytime
      </p>
    </section>
  );
}

// ─── Signal preview strip ──────────────────────────────────────────────────────

type LandingSignal = {
  id: number;
  identifier: string;
  direction: string;
  confidence: number;
  time_horizon: string;
  created_at: string;
};


async function fetchLandingSignals(): Promise<LandingSignal[]> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("signals")
      .select("id, identifier, direction, confidence, time_horizon, created_at")
      .eq("is_backtest", false)
      .neq("direction", "HOLD")
      .order("created_at", { ascending: false })
      .limit(6);

    if (error) {
      console.error("Landing signal fetch error:", error.message);
      return [];
    }
    return (data as LandingSignal[]) ?? [];
  } catch (err) {
    console.error("Landing signal fetch exception:", err);
    return [];
  }
}


// ─── Features ─────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: "⚡",
    title: "AI trading signals",
    desc: "Claude-powered analysis across stocks, crypto, and Polymarket / Kalshi contracts. BUY, SELL, YES, NO — with confidence scores and reasoning.",
  },
  {
    icon: "🌊",
    title: "Unusual options flow",
    desc: "Call/put activity screened for unusual volume and outsized premium. Spot where the size is positioning before retail catches on.",
  },
  {
    icon: "🎯",
    title: "Prediction market edges",
    desc: "AI scans Polymarket and Kalshi contracts for mispriced odds — the alpha nobody else is surfacing for retail.",
  },
  {
    icon: "🏛",
    title: "Congress tracker",
    desc: "STOCK Act disclosures — see what senators and representatives are buying and selling before the news catches up.",
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
    name:      "Pro",
    price:     "$40",
    period:    "/mo",
    highlight: false,
    cta:       "Start 14-day trial",
    href:      "/signup",
    features: [
      "AI signals — stocks & crypto",
      "Unlimited watchlist",
      "Unusual options flow",
      "Congressional trade tracker",
      "Morning briefing email (8:45am ET)",
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
    <section className="py-20 px-4 border-t border-zinc-800/60">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold text-white">Simple pricing</h2>
          <p className="text-zinc-500 mt-3">Two tiers. No free tier. The signals pay for themselves.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
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
          14-day free trial · Credit card required · Cancel anytime
        </p>

        {/* Lifetime callout */}
        <div className="mt-8 max-w-xl mx-auto rounded-xl border border-amber-500/30 bg-amber-500/5 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-white flex items-center gap-2">
              <span className="text-amber-400">⚡</span>
              Prefer to pay once? Lifetime access from $399
            </div>
            <div className="text-xs text-zinc-500 mt-0.5">
              Limited time only — pay once, keep access forever.
            </div>
          </div>
          <Link
            href="/signup"
            className="flex-shrink-0 bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
          >
            Get lifetime →
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
      { from: "them", text: "the options flow screen flagged unusual call sweeps on SMCI before it ran" },
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
    <section className="py-20 px-4 border-t border-zinc-800/60">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-white">What people are saying</h2>
          <p className="text-zinc-500 mt-3">From the group chats and inboxes of actual users.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {IMESSAGES.map((convo) => (
            <div key={convo.name} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
              {/* Phone header */}
              <div className="bg-zinc-800/80 px-4 py-2.5 flex items-center gap-3 border-b border-zinc-700/50">
                <div className="w-7 h-7 rounded-full bg-zinc-600 flex items-center justify-center text-xs font-bold text-white">
                  {convo.name.charAt(0)}
                </div>
                <span className="text-sm font-medium text-white">{convo.name}</span>
                <span className="ml-auto text-[10px] text-zinc-500">iMessage</span>
              </div>
              {/* Bubbles */}
              <div className="p-4 space-y-2">
                {convo.messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.from === "me" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm leading-snug ${
                        msg.from === "me"
                          ? "bg-green-500 text-black rounded-br-sm"
                          : "bg-zinc-700 text-white rounded-bl-sm"
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {EMAILS.map((email) => (
            <div key={email.from} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              {/* Email header */}
              <div className="px-5 py-3 border-b border-zinc-800 space-y-0.5">
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <span className="text-zinc-600">From:</span>
                  <span className="text-white font-medium">{email.from}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <span className="text-zinc-600">Subject:</span>
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

// ─── Stats bar ────────────────────────────────────────────────────────────────

function Stats() {
  const items = [
    { value: "3 markets",  label: "Stocks, crypto & predictions" },
    { value: "8:45am ET",  label: "Daily briefing delivery" },
    { value: "2h cooldown",label: "Signal dedup window" },
    { value: "14-day trial",label: "CC required, cancel anytime" },
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
          14-day trial. Real-time signals from day one.
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
      <div className="max-w-6xl mx-auto flex flex-col items-center gap-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 w-full">
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
            © {new Date().getFullYear()} Plebs.io
          </div>
        </div>
        <p className="text-[11px] text-zinc-600 text-center max-w-2xl leading-relaxed">
          Plebs.finance provides AI-generated market analysis for informational purposes only.
          Nothing on this platform constitutes financial, investment, or trading advice.
          Always do your own research and consult a licensed financial advisor before making investment decisions.
          Past performance of AI signals does not guarantee future results.
        </p>
      </div>
    </footer>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function LandingPage() {
  const signals = await fetchLandingSignals();

  return (
    <div className="bg-[#09090b] min-h-screen">
      <Nav />
      <div className="pt-14">
        <TickerBar />
      </div>
      <main>
        <Hero />
        <LiveSignalStrip initial={signals} />
        <Features />
        <Testimonials />
        <Stats />
        <Pricing />
        <CTAStrip />
      </main>
      <Footer />
    </div>
  );
}
