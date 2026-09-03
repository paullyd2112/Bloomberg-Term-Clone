import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Shield, Target, TrendingDown, Layers, Clock, Zap } from "lucide-react";

export const metadata = {
  title: "Prop Trading",
  description:
    "AI crypto signals built for prop traders. Risk profiles modeled on real prop firm rules — position sizing, daily kill switches, drawdown limits, and more.",
  alternates: { canonical: "/prop-trading" },
};

/* ── Hero ──────────────────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section className="pt-8 pb-16 border-b border-white/[0.06]">
      <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-emerald-400 mb-5">
        For prop traders
      </div>
      <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tightest text-balance mb-4">
        Signals sized for your account.
        <br />
        <span className="text-emerald-400">Risk rules you can trust.</span>
      </h1>
      <p className="text-gray-400 text-lg leading-relaxed max-w-2xl mb-8">
        Most signal services hand you a direction and leave you to figure out the rest.
        Plebs gives you the full trade plan — position size, stop, target, and risk per trade —
        all computed against prop firm drawdown rules so you never have to do the math yourself.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/signup"
          className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-sm px-6 py-2.5 rounded-xl transition-colors"
        >
          Start 14-day trial
          <ArrowUpRight className="h-4 w-4" />
        </Link>
        <a
          href="#profiles"
          className="inline-flex items-center gap-1.5 border border-white/10 hover:border-white/20 text-white font-medium text-sm px-6 py-2.5 rounded-xl transition-colors"
        >
          See risk profiles
        </a>
      </div>
    </section>
  );
}

/* ── Why it matters ───────────────────────────────────────────────────────── */

const WHY_CARDS = [
  {
    icon: Shield,
    title: "Daily kill switches",
    desc: "Each risk profile has a hard daily loss limit. Hit it and all signals are suppressed for the rest of the day — just like a real prop firm.",
  },
  {
    icon: Target,
    title: "Automatic position sizing",
    desc: "Every signal comes with exact units sized to your profile's risk-per-trade, with a 10% slippage buffer baked in. No spreadsheets needed.",
  },
  {
    icon: TrendingDown,
    title: "Drawdown protection",
    desc: "Max drawdown limits, correlation caps, and breadth gates prevent the clustered losses that blow prop accounts.",
  },
  {
    icon: Layers,
    title: "4 risk profiles",
    desc: "From $10k retail to $150k funded. Each profile models real prop firm constraints — max daily loss, max overall drawdown, and risk per trade.",
  },
  {
    icon: Clock,
    title: "Market cutoffs",
    desc: "Stock signals are blocked after 3:30 PM EST. No late-day entries when liquidity thins out and spreads widen.",
  },
  {
    icon: Zap,
    title: "Minimum R:R enforced",
    desc: "Every signal must meet a minimum risk-to-reward ratio before it reaches you. Bad setups are killed automatically, not left to discipline.",
  },
];

function WhyItMatters() {
  return (
    <section className="py-16 border-b border-white/[0.06]">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-emerald-400 mb-3">
        Why prop traders use Plebs
      </h2>
      <p className="text-xl font-semibold text-white tracking-tightest mb-8">
        Risk management that runs on code, not willpower
      </p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {WHY_CARDS.map((card) => (
          <div
            key={card.title}
            className="rounded-xl border border-white/[0.06] bg-white/[0.02] ring-hairline p-5"
          >
            <card.icon className="h-5 w-5 text-emerald-400 mb-3" />
            <h3 className="text-sm font-semibold text-white mb-1.5">{card.title}</h3>
            <p className="text-sm text-gray-400 leading-relaxed">{card.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Risk profiles ────────────────────────────────────────────────────────── */

const PROFILES = [
  {
    name: "Retail Standard",
    id: "retail_standard",
    size: "$10,000",
    maxDrawdown: "$1,000",
    maxDailyLoss: "$500",
    riskPerTrade: "$25",
    effectiveRisk: "$22.50",
    killSwitch: "$400",
    tag: null,
  },
  {
    name: "25k Conservative",
    id: "25k_prop_conservative",
    size: "$25,000",
    maxDrawdown: "$1,000",
    maxDailyLoss: "$500",
    riskPerTrade: "$75",
    effectiveRisk: "$67.50",
    killSwitch: "$375",
    tag: null,
  },
  {
    name: "50k Moderate",
    id: "50k_prop_moderate",
    size: "$50,000",
    maxDrawdown: "$2,000",
    maxDailyLoss: "$1,000",
    riskPerTrade: "$125",
    effectiveRisk: "$112.50",
    killSwitch: "$750",
    tag: "Default",
  },
  {
    name: "150k Boss",
    id: "150k_prop_boss",
    size: "$150,000",
    maxDrawdown: "$4,500",
    maxDailyLoss: "$2,700",
    riskPerTrade: "$225",
    effectiveRisk: "$202.50",
    killSwitch: "$2,025",
    tag: null,
  },
];

function RiskProfiles() {
  return (
    <section id="profiles" className="py-16 border-b border-white/[0.06]">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-emerald-400 mb-3">
        Risk profiles
      </h2>
      <p className="text-xl font-semibold text-white tracking-tightest mb-3">
        Four profiles modeled on real prop firm rules
      </p>
      <p className="text-sm text-gray-400 mb-8 max-w-2xl leading-relaxed">
        Every signal is sized across all four profiles. You see your position size, stop,
        target, and total risk — all pre-computed. A 10% slippage friction buffer is applied
        to every profile so your effective risk per trade is always slightly below the nominal limit.
      </p>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-white/[0.06] ring-hairline">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06] bg-white/[0.02]">
              <th className="text-left font-mono text-[11px] uppercase tracking-[0.15em] text-zinc-500 px-5 py-3">Profile</th>
              <th className="text-left font-mono text-[11px] uppercase tracking-[0.15em] text-zinc-500 px-5 py-3">Account</th>
              <th className="text-left font-mono text-[11px] uppercase tracking-[0.15em] text-zinc-500 px-5 py-3">Max drawdown</th>
              <th className="text-left font-mono text-[11px] uppercase tracking-[0.15em] text-zinc-500 px-5 py-3">Max daily loss</th>
              <th className="text-left font-mono text-[11px] uppercase tracking-[0.15em] text-zinc-500 px-5 py-3">Risk / trade</th>
              <th className="text-left font-mono text-[11px] uppercase tracking-[0.15em] text-zinc-500 px-5 py-3">Kill switch</th>
            </tr>
          </thead>
          <tbody>
            {PROFILES.map((p) => (
              <tr key={p.id} className="border-b border-white/[0.06] last:border-0 hover:bg-white/[0.02] transition-colors">
                <td className="px-5 py-3.5 font-medium text-white whitespace-nowrap">
                  {p.name}
                  {p.tag && (
                    <span className="ml-2 text-[10px] font-mono uppercase tracking-wider bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded">
                      {p.tag}
                    </span>
                  )}
                </td>
                <td className="px-5 py-3.5 text-gray-300">{p.size}</td>
                <td className="px-5 py-3.5 text-gray-300">{p.maxDrawdown}</td>
                <td className="px-5 py-3.5 text-gray-300">{p.maxDailyLoss}</td>
                <td className="px-5 py-3.5 text-gray-300">
                  {p.effectiveRisk}
                  <span className="text-zinc-600 ml-1 text-xs">after friction</span>
                </td>
                <td className="px-5 py-3.5 text-gray-300">{p.killSwitch}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {PROFILES.map((p) => (
          <div key={p.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] ring-hairline p-4">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-semibold text-white">{p.name}</h3>
              {p.tag && (
                <span className="text-[10px] font-mono uppercase tracking-wider bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded">
                  {p.tag}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
              <div><span className="text-zinc-500">Account</span></div>
              <div className="text-gray-300">{p.size}</div>
              <div><span className="text-zinc-500">Max drawdown</span></div>
              <div className="text-gray-300">{p.maxDrawdown}</div>
              <div><span className="text-zinc-500">Max daily loss</span></div>
              <div className="text-gray-300">{p.maxDailyLoss}</div>
              <div><span className="text-zinc-500">Risk / trade</span></div>
              <div className="text-gray-300">{p.effectiveRisk}</div>
              <div><span className="text-zinc-500">Kill switch</span></div>
              <div className="text-gray-300">{p.killSwitch}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── R:R minimums ─────────────────────────────────────────────────────────── */

const RR_TABLE = [
  { asset: "Crypto", minRR: "2:1", maxRR: "3:1", stopRange: "1% – 5%" },
  { asset: "Prediction markets", minRR: "2:1", maxRR: "5:1", stopRange: "10% – 100%" },
  { asset: "Stocks", minRR: "2:1", maxRR: "3:1", stopRange: "0.5% – 3%" },
  { asset: "Options", minRR: "2.5:1", maxRR: "3:1", stopRange: "20% – 30%" },
  { asset: "Futures", minRR: "2:1", maxRR: "3:1", stopRange: "0.3% – 2%" },
];

function RiskReward() {
  return (
    <section className="py-16 border-b border-white/[0.06]">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-emerald-400 mb-3">
        Risk-to-reward
      </h2>
      <p className="text-xl font-semibold text-white tracking-tightest mb-3">
        Minimum R:R enforced per asset class
      </p>
      <p className="text-sm text-gray-400 mb-8 max-w-2xl leading-relaxed">
        Every signal must meet the minimum risk-to-reward ratio for its asset class.
        Setups that don&apos;t clear the bar are automatically suppressed — you never see them.
        Stops are clamped within the min/max range to prevent unrealistically tight or wide levels.
      </p>
      <div className="overflow-x-auto rounded-xl border border-white/[0.06] ring-hairline">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06] bg-white/[0.02]">
              <th className="text-left font-mono text-[11px] uppercase tracking-[0.15em] text-zinc-500 px-5 py-3">Asset class</th>
              <th className="text-left font-mono text-[11px] uppercase tracking-[0.15em] text-zinc-500 px-5 py-3">Min R:R</th>
              <th className="text-left font-mono text-[11px] uppercase tracking-[0.15em] text-zinc-500 px-5 py-3">Max R:R</th>
              <th className="text-left font-mono text-[11px] uppercase tracking-[0.15em] text-zinc-500 px-5 py-3">Stop range</th>
            </tr>
          </thead>
          <tbody>
            {RR_TABLE.map((row) => (
              <tr key={row.asset} className="border-b border-white/[0.06] last:border-0 hover:bg-white/[0.02] transition-colors">
                <td className="px-5 py-3.5 font-medium text-white">{row.asset}</td>
                <td className="px-5 py-3.5 text-gray-300">{row.minRR}</td>
                <td className="px-5 py-3.5 text-gray-300">{row.maxRR}</td>
                <td className="px-5 py-3.5 text-gray-300">{row.stopRange}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ── Guard rails ──────────────────────────────────────────────────────────── */

const GATES = [
  {
    name: "Confidence floor",
    rule: "Signals below 64% confidence are auto-suppressed",
    why: "Empirically, 60–63% confidence signals had a 31% win rate. At 64%+ it jumps to 69%.",
  },
  {
    name: "Circuit breaker",
    rule: "No BUYs after 8%+ gap down, no SELLs after 8%+ gap up",
    why: "Prevents catching falling knives and fading catalyst-driven rips.",
  },
  {
    name: "BTC regime gate",
    rule: "Alt-coin BUYs blocked when BTC MACD is bearish and deepening",
    why: "When BTC is rolling over, alts follow. No point buying into a macro downtrend.",
  },
  {
    name: "Correlation cap",
    rule: "Max 2 concurrent crypto longs, max 1 alt alongside a BTC/ETH position",
    why: "Alts track BTC — a basket of longs is really one directional bet. This caps your exposure.",
  },
  {
    name: "Evidence gate",
    rule: "Signals contradicting validated patterns are downgraded to HOLD",
    why: "Based on a 10-month, ~9,800-observation factor study with out-of-sample validation.",
  },
  {
    name: "Accuracy penalty",
    rule: "Assets with 3+ signals and <15% win rate get capped at 55% confidence",
    why: "Stops the engine from repeatedly signaling chronic losers.",
  },
];

function GuardRails() {
  return (
    <section className="py-16 border-b border-white/[0.06]">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-emerald-400 mb-3">
        Guard rails
      </h2>
      <p className="text-xl font-semibold text-white tracking-tightest mb-3">
        10 deterministic gates between the AI and your account
      </p>
      <p className="text-sm text-gray-400 mb-8 max-w-2xl leading-relaxed">
        Every signal passes through a stack of code-enforced gates before it reaches you.
        These gates override the AI model — they can kill a signal regardless of what
        the model thinks. Here are the ones that matter most for prop traders.
      </p>
      <div className="space-y-3">
        {GATES.map((gate) => (
          <div
            key={gate.name}
            className="rounded-xl border border-white/[0.06] bg-white/[0.02] ring-hairline p-5"
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-white mb-1">{gate.name}</h3>
                <p className="text-sm text-gray-300 mb-1">{gate.rule}</p>
                <p className="text-xs text-zinc-500">{gate.why}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── How sizing works ─────────────────────────────────────────────────────── */

function HowSizingWorks() {
  return (
    <section className="py-16 border-b border-white/[0.06]">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-emerald-400 mb-3">
        How position sizing works
      </h2>
      <p className="text-xl font-semibold text-white tracking-tightest mb-8">
        From signal to trade plan in milliseconds
      </p>
      <div className="space-y-6">
        {[
          {
            step: "01",
            title: "Stop level is set",
            detail:
              "If the AI model provides an invalidation price, that's the stop. Otherwise, ATR-14 is used (1.5x ATR, clamped within the asset class's min/max stop range). Crypto stops adapt to volatility — tighter in calm markets, wider in volatile ones.",
          },
          {
            step: "02",
            title: "Target is computed",
            detail:
              "Target price = entry + (stop distance x minimum R:R). For crypto that's at least 2:1, so the target is always at least twice as far as the stop.",
          },
          {
            step: "03",
            title: "Position is sized",
            detail:
              "Units = effective risk per trade / risk per unit. A 10% slippage friction buffer is already baked into the effective risk. Result: exact units for crypto (8 decimal places), whole contracts for options and futures.",
          },
          {
            step: "04",
            title: "Kill switch check",
            detail:
              "Before the signal goes live, the daily session tracker checks cumulative losses. If you've hit the kill switch threshold for your profile, the signal is suppressed. No overrides, no exceptions.",
          },
        ].map((item) => (
          <div key={item.step} className="flex gap-4">
            <span className="font-mono text-sm text-emerald-400/60 pt-0.5 flex-shrink-0">
              {item.step}
            </span>
            <div>
              <h3 className="text-sm font-semibold text-white mb-1">{item.title}</h3>
              <p className="text-sm text-gray-400 leading-relaxed">{item.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── CTA ──────────────────────────────────────────────────────────────────── */

function CTA() {
  return (
    <section className="py-16 text-center">
      <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tightest mb-3">
        Stop doing the math yourself.
      </h2>
      <p className="text-gray-400 mb-8 max-w-lg mx-auto">
        14-day free trial. Every signal comes with the full trade plan —
        sized to your risk profile, gated by real prop firm rules.
      </p>
      <Link
        href="/signup"
        className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-sm px-8 py-3 rounded-xl transition-colors"
      >
        Start your trial
        <ArrowUpRight className="h-4 w-4" />
      </Link>
      <p className="mt-4 text-xs text-zinc-600">
        Cancel anytime. Not financial advice.
      </p>
    </section>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────────── */

export default function PropTradingPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-16 text-gray-300">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-white transition-colors mb-10"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to home
      </Link>

      <Hero />
      <WhyItMatters />
      <RiskProfiles />
      <RiskReward />
      <GuardRails />
      <HowSizingWorks />
      <CTA />
    </main>
  );
}
