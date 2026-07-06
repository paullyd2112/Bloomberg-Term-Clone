import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDistanceToNow } from "date-fns";

type Signal = {
  id:              number;
  asset_type:      string;
  identifier:      string;
  direction:       "BUY" | "SELL" | "HOLD";
  confidence:      number;
  reasoning:       string;
  time_horizon:    string;
  price_at_signal: number | null;
  news_context:    string[] | null;
  created_at:      string;
  outcome:         "WIN" | "LOSS" | "NEUTRAL" | "PENDING";
};

// Prediction-market identifiers are Polymarket conditionId hex hashes, not
// readable names — look up raw_prices.metadata.title so shared links and
// the page title show the actual market question instead of a hex string.
async function fetchPredictionTitle(identifier: string): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("raw_prices")
    .select("metadata")
    .eq("asset_type", "prediction")
    .eq("identifier", identifier)
    .limit(1)
    .maybeSingle();
  const title = (data?.metadata as Record<string, unknown> | null)?.title;
  return typeof title === "string" ? title : null;
}

const DIRECTION_STYLE: Record<string, string> = {
  BUY:  "bg-green-500/20 text-green-400 border-green-700",
  SELL: "bg-red-500/20 text-red-400 border-red-700",
  HOLD: "bg-zinc-700/40 text-zinc-400 border-zinc-600",
};

const OUTCOME_STYLE: Record<string, { label: string; cls: string }> = {
  WIN:     { label: "WIN",     cls: "text-green-400" },
  LOSS:    { label: "LOSS",    cls: "text-red-400" },
  NEUTRAL: { label: "NEUTRAL", cls: "text-zinc-400" },
  PENDING: { label: "PENDING", cls: "text-zinc-500" },
};

const HORIZON_LABEL: Record<string, string> = {
  intraday:     "Intraday",
  swing:        "Swing",
  longterm:     "Long-term",
  before_close: "Before close",
};

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const supabase = createClient();
  const { data } = await supabase
    .from("signals")
    .select("direction, identifier, asset_type, confidence, reasoning")
    .eq("id", params.id)
    .single();

  if (!data) return { title: "Signal — Plebs.Finance" };

  const displayName = data.asset_type === "prediction"
    ? (await fetchPredictionTitle(data.identifier)) ?? data.identifier
    : data.identifier;
  const title = `${data.direction} ${displayName} (${data.confidence}%) — Plebs.Finance`;
  const desc  = (data.reasoning as string).slice(0, 160);

  return {
    title,
    description: desc,
    openGraph: {
      title,
      description: desc,
      siteName:    "Plebs.Finance",
      type:        "website",
    },
    twitter: {
      card:        "summary",
      title,
      description: desc,
    },
  };
}

export default async function SharedSignalPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const [{ data: signal }, { data: { user } }] = await Promise.all([
    supabase.from("signals").select("*").eq("id", params.id).single(),
    supabase.auth.getUser(),
  ]);

  if (!signal) notFound();

  const s         = signal as Signal;
  const isLoggedIn = !!user;
  const dirStyle  = DIRECTION_STYLE[s.direction] ?? DIRECTION_STYLE.HOLD;
  const outcome   = OUTCOME_STYLE[s.outcome];
  const timeAgo   = formatDistanceToNow(new Date(s.created_at), { addSuffix: true });
  const displayName = s.asset_type === "prediction"
    ? (await fetchPredictionTitle(s.identifier)) ?? s.identifier
    : s.identifier;

  return (
    <div className="min-h-screen bg-[#09090b] flex flex-col items-center justify-center px-4 py-16">
      {/* Brand */}
      <Link href="/" className="mb-10 text-2xl font-extrabold text-white tracking-tight">
        plebs<span className="text-green-400">.finance</span>
      </Link>

      {/* Card */}
      <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className={`flex-shrink-0 text-sm font-bold px-2.5 py-1 rounded border ${dirStyle}`}
            >
              {s.direction}
            </span>
            <div className="min-w-0">
              <div
                className={
                  s.asset_type === "prediction"
                    ? "font-bold text-white text-base leading-snug"
                    : "font-mono font-bold text-white text-lg truncate"
                }
                title={s.asset_type === "prediction" ? displayName : undefined}
              >
                {displayName}
              </div>
              <div className="text-xs text-zinc-500 capitalize">
                {s.asset_type} · {timeAgo}
              </div>
            </div>
          </div>

          {s.outcome !== "PENDING" && (
            <span className={`text-sm font-semibold flex-shrink-0 ${outcome.cls}`}>
              {outcome.label}
            </span>
          )}
        </div>

        {/* Confidence bar */}
        <div>
          <div className="flex justify-between text-xs text-zinc-500 mb-1.5">
            <span>Confidence</span>
            <div className="group relative inline-block">
              <span className="tabular-nums font-medium text-zinc-300 cursor-help">{s.confidence}%</span>
              <div className="hidden group-hover:block absolute bottom-full right-0 mb-1.5 w-52 bg-zinc-800 border border-white/10 text-zinc-300 text-[11px] rounded-lg px-3 py-2 shadow-xl z-50">
                Model certainty in this signal direction, based on technical indicators, sentiment, and market context.
              </div>
            </div>
          </div>
          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${
                s.confidence >= 75
                  ? "bg-green-500"
                  : s.confidence >= 50
                  ? "bg-amber-500"
                  : "bg-zinc-500"
              }`}
              style={{ width: `${s.confidence}%` }}
            />
          </div>
        </div>

        {/* Reasoning */}
        <p className="text-zinc-300 text-sm leading-relaxed">{s.reasoning}</p>

        {/* Meta strip */}
        <div className="flex flex-wrap gap-4 text-xs text-zinc-500 pt-1 border-t border-zinc-800">
          <span>
            Horizon:{" "}
            <span className="text-zinc-300">
              {HORIZON_LABEL[s.time_horizon] ?? s.time_horizon}
            </span>
          </span>
          {s.price_at_signal != null && (
            <span>
              Entry:{" "}
              <span className="font-mono text-zinc-300">
                ${Number(s.price_at_signal).toLocaleString()}
              </span>
            </span>
          )}
          {s.news_context && s.news_context.length > 0 && (
            <span>{s.news_context.length} news items</span>
          )}
        </div>
        {/* News context with links */}
        {s.news_context && s.news_context.length > 0 && (
          <div className="space-y-1.5 pt-1 border-t border-zinc-800">
            <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-1">Related news</div>
            {s.news_context.map((item, i) => (
              <p key={i} className="text-xs text-zinc-500 leading-snug truncate">
                • {item}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* CTA */}
      <div className="mt-8 text-center space-y-3">
        {isLoggedIn ? (
          <>
            <Link
              href="/dashboard"
              className="inline-block bg-green-500 hover:bg-green-400 text-black font-bold text-sm px-6 py-2.5 rounded-lg transition-colors"
            >
              ← Back to Dashboard
            </Link>
          </>
        ) : (
          <>
            <p className="text-zinc-400 text-sm">
              Get live signals for stocks and crypto.
            </p>
            <div className="flex gap-3 justify-center">
              <Link
                href="/signup"
                className="inline-block bg-green-500 hover:bg-green-400 text-black font-bold text-sm px-6 py-2.5 rounded-lg transition-colors"
              >
                Start trial →
              </Link>
              <Link
                href="/login"
                className="inline-block border border-zinc-700 hover:border-zinc-500 text-zinc-300 text-sm px-6 py-2.5 rounded-lg transition-colors"
              >
                Log in
              </Link>
            </div>
            <p className="text-zinc-600 text-xs">14-day trial · Credit card required</p>
          </>
        )}
      </div>

      <p className="mt-6 text-[11px] text-zinc-700 text-center max-w-md mx-auto leading-relaxed">
        AI-generated analysis for informational purposes only — not financial advice.
        Always do your own research before making investment decisions.
      </p>
    </div>
  );
}
