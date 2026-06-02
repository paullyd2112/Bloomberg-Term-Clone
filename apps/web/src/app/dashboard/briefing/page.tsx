import { createClient } from "@/lib/supabase/server";
import { getUserTier } from "@/lib/user";
import { canAccessFeature } from "@/lib/tier";
import { format } from "date-fns";
import Link from "next/link";

export const revalidate = 300;

type Trade = {
  identifier:  string;
  asset_type:  string;
  direction:   string;
  confidence:  number;
  one_liner:   string;
};

type BriefingContent = {
  market_overview:        string;
  top_trades:             Trade[];
  macro_context:          string;
  prediction_market_edge: string;
  watch_today:            string[];
  risk_note:              string;
};

type Briefing = {
  id:           number;
  date:         string;
  headline:     string;
  day_tone:     "cautious" | "opportunistic" | "volatile" | "quiet";
  content_json: BriefingContent;
  generated_at: string;
};

const TONE_STYLE = {
  opportunistic: "bg-green-500/15 text-green-400 border-green-700",
  volatile:      "bg-amber-500/15 text-amber-400 border-amber-700",
  cautious:      "bg-red-500/15 text-red-400 border-red-700",
  quiet:         "bg-zinc-700/40 text-zinc-400 border-zinc-600",
};

const DIR_STYLE: Record<string, string> = {
  BUY:  "bg-green-500/20 text-green-400 border-green-700",
  YES:  "bg-green-500/20 text-green-400 border-green-700",
  SELL: "bg-red-500/20 text-red-400 border-red-700",
  NO:   "bg-red-500/20 text-red-400 border-red-700",
  HOLD: "bg-zinc-700/40 text-zinc-400 border-zinc-600",
};

async function fetchBriefings(): Promise<Briefing[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("daily_briefings")
    .select("*")
    .order("date", { ascending: false })
    .limit(5);
  return (data as Briefing[]) ?? [];
}

export default async function BriefingPage() {
  const [briefings, tier] = await Promise.all([fetchBriefings(), getUserTier()]);
  const hasBriefingAccess = canAccessFeature(tier, "real_time");

  if (!hasBriefingAccess) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center space-y-4">
          <div className="text-3xl">☀️</div>
          <h2 className="text-white font-semibold text-lg">Morning Briefing</h2>
          <p className="text-zinc-400 text-sm leading-relaxed">
            A daily AI-generated market brief lands in your inbox at 8:45am ET — covering top signals, macro context, and prediction market edge. Pro and Elite only.
          </p>
          <Link
            href="/dashboard/upgrade"
            className="inline-block bg-green-500 hover:bg-green-400 text-black font-semibold text-sm px-5 py-2.5 rounded transition-colors"
          >
            Upgrade to Pro →
          </Link>
        </div>
      </div>
    );
  }

  if (briefings.length === 0) {
    return (
      <div className="p-6 text-zinc-500 text-sm">
        No briefings yet — the first one generates on the next weekday at 8:30am ET.
      </div>
    );
  }

  const latest = briefings[0];
  const content = latest.content_json;

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">
            {format(new Date(latest.date), "EEEE, MMMM d, yyyy")}
          </span>
          <span
            className={`text-xs font-bold px-2 py-0.5 rounded border capitalize ${
              TONE_STYLE[latest.day_tone] ?? TONE_STYLE.quiet
            }`}
          >
            {latest.day_tone}
          </span>
        </div>
        <h1 className="text-xl md:text-2xl font-bold text-white leading-snug">
          {latest.headline}
        </h1>
      </div>

      {/* Market overview */}
      <Section label="Market overview">
        <p className="text-zinc-300 text-sm leading-relaxed">{content.market_overview}</p>
      </Section>

      {/* Top trades */}
      <Section label="Top signals">
        <div className="space-y-2">
          {content.top_trades.map((t, i) => (
            <div
              key={i}
              className="flex items-start gap-3 bg-zinc-800/50 rounded-lg px-3 py-2.5"
            >
              <span className="font-mono font-bold text-white text-sm flex-shrink-0">
                {t.identifier}
              </span>
              <span
                className={`flex-shrink-0 text-xs font-bold px-1.5 py-0.5 rounded border ${
                  DIR_STYLE[t.direction] ?? DIR_STYLE.HOLD
                }`}
              >
                {t.direction}
              </span>
              <span className="text-xs text-zinc-500 flex-shrink-0 tabular-nums">
                {t.confidence}%
              </span>
              <span className="text-sm text-zinc-300 leading-snug">{t.one_liner}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* Macro */}
      <Section label="Macro context">
        <p className="text-zinc-300 text-sm leading-relaxed">{content.macro_context}</p>
      </Section>

      {/* Prediction market edge */}
      {content.prediction_market_edge && (
        <Section label="Prediction market edge">
          <p className="text-zinc-300 text-sm leading-relaxed">
            {content.prediction_market_edge}
          </p>
        </Section>
      )}

      {/* Watch today */}
      <Section label="Watch today">
        <div className="flex flex-wrap gap-2">
          {content.watch_today.map((t) => (
            <span
              key={t}
              className="font-mono text-xs font-semibold bg-zinc-800 border border-zinc-700 text-green-400 rounded px-2 py-1"
            >
              {t}
            </span>
          ))}
        </div>
      </Section>

      {/* Risk note */}
      <div className="bg-zinc-900 border-l-2 border-amber-500 rounded-r-lg px-4 py-3">
        <div className="text-xs font-bold text-amber-500 uppercase tracking-widest mb-1">
          Risk note
        </div>
        <p className="text-zinc-300 text-sm leading-relaxed">{content.risk_note}</p>
      </div>

      {/* Archive */}
      {briefings.length > 1 && (
        <div className="pt-2">
          <div className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-2">
            Previous briefings
          </div>
          <div className="space-y-1">
            {briefings.slice(1).map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between text-sm text-zinc-400 hover:text-white transition-colors py-1.5 border-b border-zinc-800"
              >
                <span className="text-xs text-zinc-500">
                  {format(new Date(b.date), "MMM d")}
                </span>
                <span className="flex-1 mx-3 truncate">{b.headline}</span>
                <span
                  className={`text-xs px-1.5 py-0.5 rounded border ${
                    TONE_STYLE[b.day_tone] ?? TONE_STYLE.quiet
                  }`}
                >
                  {b.day_tone}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-2">
      <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{label}</div>
      {children}
    </div>
  );
}
