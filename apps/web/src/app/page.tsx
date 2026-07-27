import Link from "next/link";
import type { Metadata } from "next";
import {
  Zap,
  Landmark,
  Sunrise,
  Target,
  Dices,
  BellRing,
  ArrowUpRight,
  CircleCheck,
  ShieldCheck,
  Plus,
  Gauge,
  Eye,
  Scale,
} from "lucide-react";
import NewsletterSignup from "@/components/NewsletterSignup";
import TickerBar from "@/components/TickerBar";
import LiveSignalFeed from "@/components/LiveSignalFeed";
import Reveal from "@/components/landing/Reveal";
import LiveWinRate from "@/components/landing/LiveWinRate";
import MobileNav from "@/components/landing/MobileNav";
import BrowserFrame from "@/components/landing/showcase/BrowserFrame";
import DashboardShot from "@/components/landing/showcase/DashboardShot";
import AssetShot from "@/components/landing/showcase/AssetShot";

export const metadata: Metadata = {
  title: "Plebs · 24/7 AI crypto signals, tracked to outcome.",
  description:
    "AI signals for BTC, ETH, and 50+ coins, rescored around the clock. Polymarket prediction-market edge, congressional trades, and a morning briefing. Every call tracked to outcome.",
};

// ─── Nav ──────────────────────────────────────────────────────────────────────

function Nav() {
  return (
    <nav className="fixed top-0 inset-x-0 z-50 border-b border-white/[0.06] bg-background/70 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2" aria-label="Plebs home">
          <span className="text-lg font-semibold tracking-tightest text-white">
            Plebs<span className="text-emerald-400">.</span>
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-8 text-sm text-secondary-foreground">
          <a href="#terminal" className="hover:text-white transition-colors">The terminal</a>
          <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
          <a href="/faq" className="hover:text-white transition-colors">FAQ</a>
        </div>

        <div className="flex items-center gap-1 sm:gap-3">
          <Link
            href="/login"
            className="hidden md:inline-flex text-sm text-secondary-foreground hover:text-white transition-colors px-2 sm:px-3 py-1.5"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="hidden md:inline-flex group text-sm bg-emerald-500 hover:bg-emerald-400 text-black font-semibold pl-4 pr-3 py-1.5 rounded-lg transition-colors items-center gap-1"
          >
            Start free
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
          <MobileNav />
        </div>
      </div>
    </nav>
  );
}

// ─── Section label ──────────────────────────────────────────────────────────────

function SectionLabel({ index, children }: { index: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
      <span className="text-emerald-400">{index}</span>
      <span className="h-px w-8 bg-white/15" />
      <span>{children}</span>
    </div>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

const COVERAGE = ["Crypto", "Polymarket", "Congress"];

function Hero() {
  return (
    <section className="relative px-5 sm:px-8 overflow-hidden">
      {/* backdrop glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-20 left-1/4 h-[480px] w-[680px] -translate-x-1/2 rounded-full bg-emerald-500/[0.08] blur-[130px]" />
      </div>

      <div className="relative max-w-6xl mx-auto pt-28 sm:pt-32 pb-16">
        <div className="grid lg:grid-cols-12 gap-12 lg:gap-10 items-center">
          {/* Left — editorial copy */}
          <div className="lg:col-span-6 animate-fade-up">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs mb-7">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
              <span className="font-mono uppercase tracking-[0.18em] text-[10px] text-emerald-400">
                Live
              </span>
              <span className="text-muted-foreground">Crypto 24/7 · signals updating</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-semibold text-white leading-[1.03] tracking-tightest text-balance">
              Crypto never sleeps.
              <br />
              <span className="text-gradient-emerald">Neither does your analyst.</span>
            </h1>

            <p className="mt-6 text-lg text-secondary-foreground max-w-md leading-relaxed text-pretty">
              AI-scored BUY/SELL signals on BTC, ETH, and 50+ coins, updated around
              the clock with confidence, reasoning, and a win rate you can check.
              Plus Polymarket edge and a morning briefing in your inbox.
            </p>

            <div className="mt-9 flex flex-col sm:flex-row sm:items-center gap-3">
              <Link
                href="/signup"
                className="group inline-flex items-center justify-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-base px-6 py-3 rounded-xl transition-colors"
              >
                Get started free
                <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center justify-center text-zinc-300 hover:text-white text-base px-5 py-3 transition-colors"
              >
                Sign in →
              </Link>
            </div>

            {/* Live accuracy proof */}
            <LiveWinRate />

            {/* Coverage bar */}
            <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">
                Covering
              </span>
              {COVERAGE.map((c) => (
                <span
                  key={c}
                  className="font-mono text-[11px] text-zinc-500"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>

          {/* Right — live panel */}
          <div className="lg:col-span-6 animate-fade-up [animation-delay:120ms]">
            <LiveSignalFeed />
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Product showcase ───────────────────────────────────────────────────────────

function Showcase() {
  return (
    <section id="terminal" className="relative px-5 sm:px-8 pt-8 pb-24">
      {/* ambient glow behind the shot */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] glow-ambient" />

      <div className="relative max-w-6xl mx-auto">
        <Reveal className="max-w-2xl mb-10">
          <SectionLabel index="01">The terminal</SectionLabel>
          <h2 className="mt-5 text-3xl sm:text-4xl font-semibold text-white tracking-tightest text-balance">
            The whole crypto desk, on one screen
          </h2>
          <p className="text-secondary-foreground mt-4 leading-relaxed">
            Signals, confidence, reasoning, and live win rates in a single view.
            This is the terminal you get the moment you sign in.
          </p>
        </Reveal>

        <Reveal delay={80} className="relative">
          <BrowserFrame className="glow-green">
            <DashboardShot />
          </BrowserFrame>
          {/* reflection fade at the bottom */}
          <div className="pointer-events-none absolute inset-x-0 -bottom-px h-24 bg-gradient-to-t from-background to-transparent" />
        </Reveal>
      </div>
    </section>
  );
}

// ─── Stats strip ────────────────────────────────────────────────────────────────

function Stats() {
  const items = [
    { value: "50+",   label: "Coins scored" },
    { value: "12×",   label: "Scoring runs per day" },
    { value: "7d",    label: "Daily briefing" },
    { value: "14d",   label: "Trial period" },
  ];

  return (
    <section className="px-5 sm:px-8">
      <Reveal className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 border-t border-l border-white/[0.06]">
        {items.map((item) => (
          <div key={item.label} className="py-10 px-6 border-b border-r border-white/[0.06]">
            <div className="font-mono text-3xl sm:text-4xl font-semibold text-white tracking-tightest tabular-nums">
              {item.value}
            </div>
            <div className="text-muted-foreground text-sm mt-2">{item.label}</div>
          </div>
        ))}
      </Reveal>
    </section>
  );
}

// ─── Transparency ────────────────────────────────────────────────────────────

function Transparency() {
  const pillars = [
    {
      icon: Eye,
      title: "Every signal tracked",
      desc: "BUY, SELL, or HOLD — every call is logged with a timestamp and tracked to its final outcome. No cherry-picking, no quiet deletions.",
    },
    {
      icon: Target,
      title: "Misses published",
      desc: "Wrong calls stay on the record. You see the real win rate — not a curated highlight reel. If it's 58%, we say 58%.",
    },
    {
      icon: Scale,
      title: "No black box",
      desc: "Every signal ships with the reasoning behind it. You see which indicators fired, what the model weighed, and why. Agree or override.",
    },
  ];

  return (
    <section id="transparency" className="py-24 px-5 sm:px-8">
      <div className="max-w-6xl mx-auto">
        <Reveal className="max-w-2xl mb-12">
          <SectionLabel index="02">Transparency</SectionLabel>
          <h2 className="mt-5 text-3xl sm:text-4xl font-semibold text-white tracking-tightest text-balance">
            Signal services hide their losses.<br />We publish ours.
          </h2>
          <p className="text-secondary-foreground mt-4 leading-relaxed max-w-lg">
            Most signal groups delete bad calls, lock win rates behind paywalls, or
            stop posting after a losing streak. Plebs tracks every signal to outcome —
            live, public, and permanent.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {pillars.map((p, i) => {
            const Icon = p.icon;
            return (
              <Reveal key={p.title} delay={i * 60}>
                <div className="h-full rounded-2xl border border-white/[0.06] bg-white/[0.02] p-7 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.12]">
                  <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-700/30 bg-emerald-500/10 text-emerald-400 mb-5">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-white font-medium mb-2">{p.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{p.desc}</p>
                </div>
              </Reveal>
            );
          })}
        </div>

        <Reveal delay={200}>
          <div className="mt-8 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.03] p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
            <div className="flex-1">
              <p className="text-white font-medium">Check for yourself →</p>
              <p className="text-muted-foreground text-sm mt-1">
                The accuracy page is live on the dashboard. Every resolved signal,
                every coin, every outcome. Free accounts can see it too.
              </p>
            </div>
            <Link
              href="/signup"
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-400 hover:bg-emerald-500/20 transition-colors flex-shrink-0"
            >
              View live accuracy
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ─── Prop Trading Desk ──────────────────────────────────────────────────────────

function PropDesk() {
  return (
    <section className="py-24 px-5 sm:px-8">
      <div className="max-w-6xl mx-auto">
        <Reveal className="max-w-2xl mb-10">
          <SectionLabel index="04">Risk management</SectionLabel>
          <h2 className="mt-5 text-3xl sm:text-4xl font-semibold text-white tracking-tightest text-balance">
            Know your size before you trade
          </h2>
          <p className="text-secondary-foreground mt-4 leading-relaxed">
            Most signal services tell you what to buy. None tell you how much.
            The prop trading desk runs Monte Carlo simulations against your account
            to find optimal position sizing — so one bad call doesn&apos;t blow the account.
          </p>
        </Reveal>

        <Reveal delay={80}>
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-white/[0.06]">
              {/* Left — feature list */}
              <div className="p-8">
                <div className="flex items-center gap-2 mb-6">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#00d4aa]/30 bg-[#00d4aa]/10 text-[#00d4aa]">
                    <Gauge className="h-4.5 w-4.5" />
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md border bg-amber-500/15 text-amber-400 border-amber-700/40 tracking-wider uppercase">
                    Elite
                  </span>
                </div>

                <ul className="space-y-4">
                  {[
                    { title: "Monte Carlo simulation", desc: "Thousands of randomised trade sequences stress-tested against prop firm rules" },
                    { title: "Position sizing engine", desc: "Per-trade risk calculated from your account size, drawdown limits, and stop method" },
                    { title: "Drawdown tracking", desc: "Real-time headroom gauges — know exactly how much runway you have left" },
                    { title: "Multi-profile support", desc: "Model $10K retail, $50K funded, or $150K boss accounts side by side" },
                  ].map((item) => (
                    <li key={item.title} className="flex gap-3">
                      <CircleCheck className="h-4 w-4 mt-0.5 flex-shrink-0 text-[#00d4aa]" />
                      <div>
                        <span className="text-white text-sm font-medium">{item.title}</span>
                        <p className="text-muted-foreground text-xs mt-0.5 leading-relaxed">{item.desc}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Right — visual mockup */}
              <div className="p-8 flex flex-col justify-center">
                <div className="space-y-3">
                  {/* Gauge mockups */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3 text-center">
                      <div className="font-mono text-2xl font-bold text-[#00d4aa] tabular-nums">87%</div>
                      <div className="text-[10px] text-zinc-500 mt-1 uppercase tracking-wider">Survival</div>
                    </div>
                    <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3 text-center">
                      <div className="font-mono text-2xl font-bold text-amber-400 tabular-nums">62%</div>
                      <div className="text-[10px] text-zinc-500 mt-1 uppercase tracking-wider">DD Used</div>
                    </div>
                  </div>
                  {/* Progress bar mockup */}
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-4">
                    <div className="flex items-baseline justify-between mb-2">
                      <span className="text-xs text-zinc-400">Profit Target</span>
                      <span className="font-mono text-xs text-white tabular-nums">$3,200 <span className="text-zinc-600">/ $5,000</span></span>
                    </div>
                    <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                      <div className="h-full w-[64%] rounded-full bg-[#00d4aa]" />
                    </div>
                  </div>
                  {/* Rules */}
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-4 space-y-2">
                    {["Max Daily Loss", "Kill Switch", "Position Cap"].map((rule) => (
                      <div key={rule} className="flex items-center gap-2">
                        <CircleCheck className="h-3.5 w-3.5 text-[#00d4aa]" />
                        <span className="text-xs text-zinc-400">{rule}</span>
                        <span className="ml-auto font-mono text-[10px] text-[#00d4aa]">OK</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ─── Ethos ──────────────────────────────────────────────────────────────────────

function Ethos() {
  return (
    <section className="py-24 px-5 sm:px-8">
      <div className="max-w-4xl mx-auto">
        <Reveal>
          <div className="relative rounded-2xl border border-white/[0.08] bg-white/[0.02] p-8 sm:p-12 overflow-hidden">
            <div className="pointer-events-none absolute -top-20 -right-20 h-[300px] w-[300px] rounded-full bg-emerald-500/[0.05] blur-[100px]" />

            <div className="relative">
              <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-emerald-400 mb-6">
                Why we built this
              </div>

              <blockquote className="text-xl sm:text-2xl font-medium text-white leading-relaxed tracking-tight text-balance">
                &ldquo;We got tired of paying for signals from anonymous accounts
                that delete their misses and screenshot their wins. So we built
                the opposite: every call tracked, every outcome published, every
                miss on the record. If the AI is wrong, you&apos;ll know — because
                we show you.&rdquo;
              </blockquote>

              <div className="mt-8 pt-6 border-t border-white/[0.06]">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  <div>
                    <div className="text-white font-medium text-sm">No hidden losses</div>
                    <p className="text-muted-foreground text-xs mt-1 leading-relaxed">
                      Every signal stays on the record forever. Wins and losses, publicly tracked.
                    </p>
                  </div>
                  <div>
                    <div className="text-white font-medium text-sm">Priced for retail</div>
                    <p className="text-muted-foreground text-xs mt-1 leading-relaxed">
                      Institutional-grade analysis shouldn&apos;t cost institutional prices. Free tier included.
                    </p>
                  </div>
                  <div>
                    <div className="text-white font-medium text-sm">Built in public</div>
                    <p className="text-muted-foreground text-xs mt-1 leading-relaxed">
                      We ship features in the open. The accuracy page isn&apos;t gated — even free users see the track record.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ─── Features (bento) ────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: Zap,
    title: "24/7 AI crypto signals",
    desc: "BUY/SELL calls on BTC, ETH, SOL, and 50+ coins, rescored every two hours around the clock. Each comes with a confidence score and the reasoning behind it.",
    span: "lg:col-span-3",
  },
  {
    icon: Dices,
    title: "Prediction-market edge",
    desc: "AI scans live Polymarket contracts for mispriced odds. YES/NO calls with the edge spelled out, not just a probability.",
    span: "lg:col-span-3",
  },
  {
    icon: Sunrise,
    title: "Morning briefing",
    desc: "An AI-written market brief delivered daily to your inbox. Top signals, macro, and risk.",
    span: "lg:col-span-3",
  },
  {
    icon: Target,
    title: "Accuracy, tracked",
    desc: "Every signal is tracked to outcome, so you see real win rates per coin, not vibes. Misses included.",
    span: "lg:col-span-3",
  },
  {
    icon: Landmark,
    title: "Congressional trades",
    desc: "STOCK Act disclosures for every House and Senate member, surfaced before the headlines.",
    span: "lg:col-span-3",
  },
  {
    icon: BellRing,
    title: "Price & signal alerts",
    desc: "Push notifications the moment a high-confidence signal fires or a price level you set gets hit.",
    span: "lg:col-span-3",
  },
];

function Features() {
  return (
    <section className="py-24 px-5 sm:px-8">
      <div className="max-w-6xl mx-auto">
        <Reveal className="max-w-2xl mb-12">
          <SectionLabel index="03">What you get</SectionLabel>
          <h2 className="mt-5 text-3xl sm:text-4xl font-semibold text-white tracking-tightest text-balance">
            A full crypto desk, in one tab
          </h2>
          <p className="text-secondary-foreground mt-4 leading-relaxed">
            Stop juggling six subscriptions. Signals, prediction markets, filings,
            and briefings: the full toolkit, priced for retail.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 lg:auto-rows-fr gap-3">
          {/* Visual anchor cell */}
          <Reveal className="sm:col-span-2 lg:col-span-3 lg:row-span-2">
            <div className="group relative h-full overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] transition-all duration-300 hover:border-white/[0.12]">
              <div className="border-b border-white/[0.06] px-6 pt-6 pb-2">
                <h3 className="text-white font-medium">Asset intelligence</h3>
                <p className="text-muted-foreground text-sm mt-1 leading-relaxed">
                  Price action, AI score, and tracked accuracy for every coin.
                </p>
              </div>
              <div className="px-4 pb-4 pt-2">
                <div className="rounded-xl border border-white/[0.06] bg-background overflow-hidden">
                  <AssetShot />
                </div>
              </div>
            </div>
          </Reveal>

          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <Reveal
                key={f.title}
                delay={i * 40}
                className={`sm:col-span-1 ${f.span}`}
              >
                <div className="group relative h-full rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.12] hover:bg-white/[0.04]">
                  <div className="flex items-start justify-between mb-5">
                    <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-700/30 bg-emerald-500/10 text-emerald-400 transition-colors group-hover:bg-emerald-500/15">
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="font-mono text-[11px] text-zinc-700 tabular-nums">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <h3 className="text-white font-medium mb-2">{f.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{f.desc}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── Newsletter band ──────────────────────────────────────────────────────────

function NewsletterBand() {
  return (
    <section className="px-5 sm:px-8 pb-8">
      <Reveal className="relative max-w-6xl mx-auto rounded-2xl border border-white/[0.06] bg-white/[0.02] ring-hairline overflow-hidden">
        <div className="pointer-events-none absolute -top-20 right-10 h-[220px] w-[420px] rounded-full bg-emerald-500/[0.07] blur-[100px]" />
        <div className="relative grid md:grid-cols-2 gap-6 md:gap-10 items-center px-6 sm:px-10 py-10">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-emerald-400 mb-3">
              Free newsletter
            </div>
            <h3 className="text-xl sm:text-2xl font-semibold text-white tracking-tightest text-balance">
              The daily brief, before the market wakes up
            </h3>
            <p className="text-muted-foreground text-sm mt-2 leading-relaxed">
              Crypto, prediction markets, geopolitics, tech, and more — in plain English, 7 days a week.
              Written by the same AI that scores the signals. Choose your frequency, unsubscribe anytime.
            </p>
          </div>
          <NewsletterSignup />
        </div>
      </Reveal>
    </section>
  );
}

// ─── Pricing ──────────────────────────────────────────────────────────────────

const PLANS = [
  {
    name:      "Free",
    price:     "$0",
    period:    "",
    blurb:     "See the signals. Decide when you're ready for more.",
    highlight: false,
    cta:       "Create free account",
    href:      "/signup",
    features: [
      "3 AI signals per day (4h delay)",
      "Weekly Monday newsletter recap",
      "Dashboard access (view-only)",
      "Track record & accuracy stats",
    ],
  },
  {
    name:      "Pro",
    price:     "$40",
    period:    "/mo",
    blurb:     "Everything you need to trade crypto with an edge.",
    highlight: false,
    cta:       "Start 7-day trial",
    href:      "/signup",
    features: [
      "24/7 AI signals for BTC, ETH & 50+ coins",
      "Confidence scores + full reasoning",
      "Win rates tracked per coin",
      "Unlimited watchlist",
      "Morning briefing email",
      "Congressional trade tracker",
      "Price & signal alerts",
    ],
  },
  {
    name:      "Elite",
    price:     "$80",
    period:    "/mo",
    blurb:     "The real alpha: prediction markets and your own AI analyst.",
    highlight: true,
    cta:       "Start 14-day trial",
    href:      "/signup",
    features: [
      "Everything in Pro",
      "Prediction-market signals (Polymarket)",
      "AI finds mispriced contracts",
      "Pleby, your AI trading analyst, on call",
      "Personalised morning briefing",
      "On-demand AI analysis: score any coin",
    ],
  },
];

function Pricing() {
  return (
    <section id="pricing" className="py-24 px-5 sm:px-8">
      <div className="max-w-5xl mx-auto">
        <Reveal className="max-w-2xl mb-12">
          <SectionLabel index="05">Pricing</SectionLabel>
          <h2 className="mt-5 text-3xl sm:text-4xl font-semibold text-white tracking-tightest">
            Start free. Upgrade when the signals pay for themselves.
          </h2>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {PLANS.map((plan, i) => (
            <Reveal key={plan.name} delay={i * 80}>
              <div
                className={`relative h-full rounded-2xl p-8 border transition-all duration-300 ${
                  plan.highlight
                    ? "border-emerald-600/40 bg-emerald-500/[0.03] glow-green"
                    : "border-white/10 bg-white/[0.02] ring-hairline hover:-translate-y-0.5 hover:border-white/20"
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
                    <span className="font-mono text-4xl font-semibold text-white tracking-tightest">
                      {plan.price}
                    </span>
                    <span className="text-muted-foreground text-sm">{plan.period}</span>
                  </div>
                </div>

                <p className="text-muted-foreground text-sm mt-3 leading-relaxed">{plan.blurb}</p>

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
                    <li key={f} className="flex items-start gap-2.5 text-sm text-secondary-foreground">
                      <CircleCheck className="h-4 w-4 mt-0.5 flex-shrink-0 text-emerald-400" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>

        <p className="text-center text-muted-foreground text-sm mt-8">
          Free forever. Pro includes a 7-day trial, Elite a 14-day trial. Cancel anytime. Prefer to pay once?{" "}
          <Link href="/signup" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-4 transition-colors">
            Lifetime access from $399
          </Link>
          .
        </p>
      </div>
    </section>
  );
}

// ─── FAQ ──────────────────────────────────────────────────────────────────────

const FAQS = [
  {
    q: "What exactly is Plebs?",
    a: "Plebs is an AI-powered crypto signal terminal for retail traders. We run AI models over live technicals, news, and market structure to generate BUY/SELL signals on 50+ coins around the clock, each with a confidence score and full reasoning. Think Bloomberg Terminal meets AI analyst, priced for normal people.",
  },
  {
    q: "Is this financial advice?",
    a: "No. Plebs provides AI-generated market analysis for informational purposes only. We surface signals and data, but every trade decision is yours. Always do your own research.",
  },
  {
    q: "How does the trial work?",
    a: "Pro comes with a 7-day trial, Elite with a 14-day trial — full access to everything in that tier. Credit card is required upfront. Cancel anytime during the trial and you won't be charged. Or start with the free plan, no card needed.",
  },
  {
    q: "What markets do you cover?",
    a: "Crypto and prediction markets. We score BTC, ETH, SOL, and 50+ coins around the clock, plus AI-scored YES/NO calls on Polymarket prediction contracts. Every signal comes with a confidence score and full reasoning.",
  },
  {
    q: "What's in the newsletter?",
    a: "A full morning brief covering crypto markets, prediction markets, geopolitics, AI and tech, health and science, sports, and whatever else is moving the world. Think 7 days a week is too much? You can choose your newsletter frequency in settings.",
  },
  {
    q: "How accurate are the signals?",
    a: "Every signal is tracked to outcome. You can see real win rates per coin on the dashboard. No cherry-picking, no hiding misses. Full transparency is the whole point.",
  },
];

function Faq() {
  return (
    <section id="faq" className="py-24 px-5 sm:px-8">
      <div className="max-w-3xl mx-auto">
        <Reveal className="max-w-2xl mb-12">
          <SectionLabel index="06">FAQ</SectionLabel>
          <h2 className="mt-5 text-3xl sm:text-4xl font-semibold text-white tracking-tightest">
            Questions, answered.
          </h2>
        </Reveal>

        <div className="flex flex-col gap-3">
          {FAQS.map((item, i) => (
            <Reveal key={item.q} delay={i * 60}>
              <details className="group rounded-2xl border border-white/[0.06] bg-white/[0.02] ring-hairline transition-colors open:border-white/[0.12] open:bg-white/[0.03]">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 text-left [&::-webkit-details-marker]:hidden">
                  <span className="text-base font-medium text-white text-pretty">{item.q}</span>
                  <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-zinc-400 transition-all duration-300 group-open:rotate-45 group-open:border-emerald-500/40 group-open:text-emerald-400">
                    <Plus className="h-4 w-4" strokeWidth={2} />
                  </span>
                </summary>
                <p className="px-6 pb-6 pt-0 text-secondary-foreground leading-relaxed text-pretty">
                  {item.a}
                </p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── CTA strip ────────────────────────────────────────────────────────────────

function CTAStrip() {
  return (
    <section className="py-24 px-5 sm:px-8">
      <Reveal className="relative max-w-5xl mx-auto rounded-3xl border border-white/[0.08] bg-white/[0.02] overflow-hidden ring-hairline">
        <div className="pointer-events-none absolute -top-24 left-1/2 h-[320px] w-[680px] -translate-x-1/2 rounded-full bg-emerald-500/[0.10] blur-[120px]" />

        <div className="relative px-6 sm:px-12 py-16 text-center">
          <h2 className="text-3xl sm:text-4xl font-semibold text-white tracking-tightest text-balance">
            The market never closes. Your edge shouldn&apos;t either.
          </h2>
          <p className="text-secondary-foreground mt-4">Start free. Signals around the clock from day one.</p>

          <Link
            href="/signup"
            className="group mt-8 inline-flex items-center justify-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-base px-9 py-3.5 rounded-xl transition-colors"
          >
            Start your trial
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>

          <div className="mt-12 pt-10 border-t border-white/[0.06] max-w-md mx-auto">
            <p className="text-muted-foreground text-sm mb-4 leading-relaxed">
              Not ready? Get the free daily newsletter. Crypto, prediction
              markets, and world news in plain English, 7 days a week.
            </p>
            <NewsletterSignup />
          </div>

          <p className="mt-8 inline-flex items-center gap-1.5 text-zinc-600 text-xs">
            <ShieldCheck className="h-3.5 w-3.5" />
            Not financial advice.
          </p>
        </div>
      </Reveal>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

const FOOTER_COLS = [
  {
    heading: "Product",
    links: [
      { label: "The terminal", href: "#terminal" },
      { label: "Pricing", href: "#pricing" },
      { label: "FAQ", href: "/faq" },
      { label: "Glossary", href: "/glossary" },
      { label: "Prop trading", href: "/prop-trading" },
      { label: "Dashboard", href: "/dashboard" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "Log in", href: "/login" },
      { label: "Start free", href: "/signup" },
      { label: "Newsletter", href: "/#pricing" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Terms", href: "/terms" },
      { label: "Privacy", href: "/privacy" },
      { label: "Unsubscribe", href: "/unsubscribe" },
    ],
  },
];

function Footer() {
  return (
    <footer className="border-t border-white/[0.06] px-5 sm:px-8">
      <div className="max-w-6xl mx-auto py-14">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <div className="text-base font-semibold text-white tracking-tightest">
              plebs<span className="text-emerald-400">.finance</span>
            </div>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed max-w-xs">
              24/7 AI crypto signals, tracked to outcome.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
              <span className="font-mono text-[10px] uppercase tracking-wider text-emerald-400">
                Live
              </span>
            </div>
          </div>

          {FOOTER_COLS.map((col) => (
            <div key={col.heading}>
              <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-600 mb-4">
                {col.heading}
              </h3>
              <ul className="space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-secondary-foreground hover:text-white transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 pt-8 border-t border-white/[0.06] flex flex-col gap-4">
          <p className="text-[11px] text-zinc-600 leading-relaxed max-w-3xl">
            Plebs.Finance provides AI-generated market analysis for informational purposes only.
            Nothing on this platform constitutes financial, investment, or trading advice.
            Always do your own research and consult a licensed financial advisor before making investment decisions.
            Past performance of AI signals does not guarantee future results.
          </p>
          <div className="font-mono text-xs text-zinc-600">
            © {new Date().getFullYear()} Plebs · Not financial advice
          </div>
        </div>
      </div>
    </footer>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="font-sans bg-background min-h-screen antialiased selection:bg-emerald-500/30 selection:text-white">
      <Nav />
      <div className="pt-14">
        <TickerBar showStatus={false} />
      </div>
      <main>
        <Hero />
        <Showcase />
        <Stats />
        <Transparency />
        <Features />
        <PropDesk />
        <Ethos />
        <NewsletterBand />
        <Pricing />
        <Faq />
        <CTAStrip />
      </main>
      <Footer />
    </div>
  );
}
