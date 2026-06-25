import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDistanceToNow } from "date-fns";

type Signal = {
  id:              number;
  asset_type:      string;
  identifier:      string;
  direction:       "BUY" | "SELL" | "HOLD" | "YES" | "NO";
  confidence:      number;
  reasoning:       string;
  time_horizon:    string;
  price_at_signal: number | null;
  news_context:    string[] | null;
  created_at:      string;
  outcome:         "WIN" | "LOSS" | "NEUTRAL" | "PENDING";
};

const DIRECTION_STYLE: Record<string, string> = {
  BUY:  "bg-green-500/20 text-green-400 border-green-700",
  YES:  "bg-green-500/20 text-green-400 border-green-700",
  SELL: "bg-red-500/20 text-red-400 border-red-700",
  NO:   "bg-red-500/20 text-red-400 border-red-700",
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
    .select("direction, identifier, confidence, reasoning")
    .eq("id", params.id)
    .single();

  if (!data) return { title: "Signal — Plebs.io" };

  const title = `${data.direction} ${data.identifier} (${data.confidence}%) — Plebs.io`;
  const desc  = (data.reasoning as string).slice(0, 160);

  return {
    title,
    description: desc,
    openGraph: {
      title,
      description: desc,
      siteName:    "Plebs.io",
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
  const { data: signal } = await supabase
    .from("signals")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!signal) notFound();

  const s         = signal as Signal;
  const dirStyle  = DIRECTION_STYLE[s.direction] ?? DIRECTION_STYLE.HOLD;
  const outcome   = OUTCOME_STYLE[s.outcome];
  const timeAgo   = formatDistanceToNow(new Date(s.created_at), { addSuffix: true });
  const isPredict = s.asset_type === "prediction";

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
              <div className="font-mono font-bold text-white text-lg truncate">
                {s.identifier}
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
            <span className="tabular-nums font-medium text-zinc-300">{s.confidence}%</span>
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
                {isPredict
                  ? `${(Number(s.price_at_signal) * 100).toFixed(1)}%`
                  : `$${Number(s.price_at_signal).toLocaleString()}`}
              </span>
            </span>
          )}
          {s.news_context && s.news_context.length > 0 && (
            <span>{s.news_context.length} news items</span>
          )}
        </div>
      </div>

      {/* CTA */}
      <div className="mt-8 text-center space-y-3">
        <p className="text-zinc-400 text-sm">
          Get live signals for stocks, crypto &amp; prediction markets.
        </p>
        <div className="flex gap-3 justify-center">
          <Link
            href="/signup"
            className="inline-block bg-green-500 hover:bg-green-400 text-black font-bold text-sm px-6 py-2.5 rounded-lg transition-colors"
          >
            Start free trial →
          </Link>
          <Link
            href="/login"
            className="inline-block border border-zinc-700 hover:border-zinc-500 text-zinc-300 text-sm px-6 py-2.5 rounded-lg transition-colors"
          >
            Log in
          </Link>
        </div>
        <p className="text-zinc-600 text-xs">14-day free trial · Credit card required</p>
      </div>

      <p className="mt-6 text-[11px] text-zinc-700 text-center max-w-md mx-auto leading-relaxed">
        AI-generated analysis for informational purposes only — not financial advice.
        Always do your own research before making investment decisions.
      </p>
    </div>
  );
}
