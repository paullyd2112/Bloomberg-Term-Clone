import { createClient } from "@/lib/supabase/server";
import { format } from "date-fns";
import { Sunrise } from "lucide-react";

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
  opportunistic: "bg-emerald-500/15 text-emerald-400 border-emerald-700/40",
  volatile:      "bg-amber-500/15 text-amber-400 border-amber-700/40",
  cautious:      "bg-red-500/15 text-red-400 border-red-700/40",
  quiet:         "bg-white/[0.06] text-zinc-400 border-white/[0.1]",
};

const DIR_STYLE: Record<string, string> = {
  BUY:  "bg-emerald-500/20 text-emerald-400 border-emerald-700/40",
  SELL: "bg-red-500/20 text-red-400 border-red-700/40",
  HOLD: "bg-white/[0.06] text-zinc-400 border-white/[0.1]",
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
  const briefings = await fetchBriefings();

  if (briefings.length === 0) {
    return (
      <div className="p-6 text-zinc-500 text-sm">
        No briefings yet. The first one generates on the next weekday at 8:30am ET.
      </div>
    );
  }

  const latest = briefings[0];
  const content = latest.content_json;

  return (
    <div className="p-5 md:p-8 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-amber-700/30 bg-amber-500/10 text-amber-400">
            <Sunrise className="h-3.5 w-3.5" />
          </span>
          <span className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">
            {format(new Date(latest.date), "EEEE, MMMM d, yyyy")}
          </span>
          <span
            className={`text-xs font-bold px-2 py-0.5 rounded-md border capitalize ${
              TONE_STYLE[latest.day_tone] ?? TONE_STYLE.quiet
            }`}
          >
            {latest.day_tone}
          </span>
        </div>
        <h1 className="text-xl md:text-2xl font-semibold text-white leading-snug tracking-tight text-balance">
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
              className="flex items-start gap-3 bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2.5"
            >
              <span className="font-mono font-bold text-white text-sm flex-shrink-0">
                {t.identifier}
              </span>
              <span
                className={`flex-shrink-0 text-xs font-bold px-1.5 py-0.5 rounded-md border ${
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

      {/* Watch today */}
      <Section label="Watch today">
        <div className="flex flex-wrap gap-2">
          {content.watch_today.map((t) => (
            <span
              key={t}
              className="font-mono text-xs font-semibold bg-white/[0.04] border border-white/[0.1] text-emerald-400 rounded-md px-2 py-1"
            >
              {t}
            </span>
          ))}
        </div>
      </Section>

      {/* Risk note */}
      <div className="bg-amber-500/[0.06] border border-white/[0.06] border-l-2 border-l-amber-500 rounded-r-xl px-4 py-3">
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
                className="flex items-center justify-between text-sm text-zinc-400 hover:text-white transition-colors py-1.5 border-b border-white/[0.06]"
              >
                <span className="text-xs text-zinc-500">
                  {format(new Date(b.date), "MMM d")}
                </span>
                <span className="flex-1 mx-3 truncate">{b.headline}</span>
                <span
                  className={`text-xs px-1.5 py-0.5 rounded-md border capitalize ${
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
    <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl p-4 space-y-2">
      <div className="flex items-center gap-2.5 font-mono text-[11px] font-semibold text-zinc-500 uppercase tracking-[0.18em]">
        <span className="text-emerald-400 text-[10px] leading-none">●</span>
        {label}
      </div>
      {children}
    </div>
  );
}
