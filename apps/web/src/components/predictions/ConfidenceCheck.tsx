"use client";

import { useState, useRef } from "react";
import { Sparkles, X, ChevronDown, Loader2 } from "lucide-react";
import { clsx } from "clsx";

type SignalResult = {
  direction: string;
  confidence: number;
  reasoning: string;
  edge_explanation?: string;
  trade_setup?: {
    entry_price?: number;
    stop_loss?: number;
    target_price?: number;
    position_size_usd?: number;
  };
};

type CheckResult = {
  status: "ok" | "cached" | "no_signal" | "no_match" | "error";
  matched_market?: string;
  match_score?: number;
  signal?: SignalResult;
  reason?: string;
  error?: string;
  other_matches?: { condition_id: string; title: string; yes_price: number | null; similarity: number }[];
};

export default function ConfidenceCheck() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim() || loading) return;

    setLoading(true);
    setResult(null);

    try {
      const resp = await fetch("/api/confidence-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.trim() }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setResult({ status: "error", error: data.error });
      } else {
        setResult(data);
      }
    } catch {
      setResult({ status: "error", error: "Request failed — try again" });
    } finally {
      setLoading(false);
    }
  }

  async function handleRetry(title: string, conditionId?: string) {
    setQuestion(title);
    setResult(null);
    setLoading(true);
    try {
      const resp = await fetch("/api/confidence-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: title, condition_id: conditionId }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setResult({ status: "error", error: data.error });
      } else {
        setResult(data);
      }
    } catch {
      setResult({ status: "error", error: "Request failed — try again" });
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => {
          setOpen(true);
          setTimeout(() => inputRef.current?.focus(), 100);
        }}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#00d4aa]/10 to-[#4f8cff]/10 border border-[#00d4aa]/20 hover:border-[#00d4aa]/40 text-[0.8125rem] font-medium text-[#00d4aa] transition-all hover:shadow-lg hover:shadow-[#00d4aa]/5"
      >
        <Sparkles className="h-3.5 w-3.5" />
        Confidence Check
      </button>
    );
  }

  return (
    <div className="rounded-2xl bg-[#10131a] border border-[#00d4aa]/20 overflow-hidden">
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-[#00d4aa]">
            <Sparkles className="h-4 w-4" />
            <span className="text-sm font-semibold">Confidence Check</span>
          </div>
          <button
            onClick={() => { setOpen(false); setResult(null); setQuestion(""); }}
            className="p-1 rounded-md hover:bg-white/5 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-[0.75rem] text-zinc-500 mb-3">
          Type a bet you&apos;re considering and Pleby will match it against live Polymarket data, then run the full AI scoring pipeline.
        </p>

        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. Will the Fed cut rates in September?"
            disabled={loading}
            className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-[0.8125rem] text-white placeholder-zinc-600 focus:outline-none focus:border-[#00d4aa]/30 transition-colors disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-[#00d4aa] hover:bg-[#00e4bb] disabled:bg-zinc-700 disabled:text-zinc-500 text-black text-[0.8125rem] font-semibold rounded-lg transition-colors whitespace-nowrap"
          >
            {loading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Scoring…
              </>
            ) : (
              "Check"
            )}
          </button>
        </form>
      </div>

      {/* Results */}
      {result && (
        <div className="border-t border-white/[0.06] p-4 space-y-3">
          {result.status === "error" || result.status === "no_match" ? (
            <div className="text-sm text-red-400">{result.error}</div>
          ) : (
            <>
              {/* Matched market */}
              {result.matched_market && (
                <div className="space-y-1">
                  <div className="text-[0.6875rem] text-zinc-600 uppercase tracking-wide">Matched market</div>
                  <div className="text-[0.8125rem] text-white font-medium leading-snug">{result.matched_market}</div>
                  {result.match_score != null && (
                    <div className="text-[0.6875rem] text-zinc-600">
                      Match confidence: {Math.round(result.match_score * 100)}%
                      {result.status === "cached" && " · From recent analysis"}
                    </div>
                  )}
                </div>
              )}

              {/* Signal */}
              {result.signal ? (
                <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className={clsx(
                      "text-lg font-bold",
                      result.signal.direction === "YES" ? "text-[#00d4aa]" :
                      result.signal.direction === "NO" ? "text-red-400" :
                      "text-zinc-400",
                    )}>
                      {result.signal.direction}
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                        <div
                          className={clsx(
                            "h-full rounded-full transition-all",
                            result.signal.confidence >= 75 ? "bg-[#00d4aa]" :
                            result.signal.confidence >= 64 ? "bg-amber-400" :
                            "bg-zinc-500",
                          )}
                          style={{ width: `${result.signal.confidence}%` }}
                        />
                      </div>
                      <span className="text-sm font-bold tabular-nums text-white">
                        {result.signal.confidence}%
                      </span>
                    </div>
                  </div>

                  <p className="text-[0.8125rem] text-zinc-300 leading-relaxed">
                    {result.signal.reasoning}
                  </p>

                  {result.signal.edge_explanation && (
                    <details className="group">
                      <summary className="flex items-center gap-1 text-[0.75rem] text-zinc-500 cursor-pointer hover:text-zinc-400 transition-colors">
                        <ChevronDown className="h-3 w-3 group-open:rotate-180 transition-transform" />
                        Edge analysis
                      </summary>
                      <p className="mt-2 text-[0.75rem] text-zinc-400 leading-relaxed pl-4">
                        {result.signal.edge_explanation}
                      </p>
                    </details>
                  )}

                  {result.signal.trade_setup && (
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/[0.04]">
                      {result.signal.trade_setup.entry_price != null && (
                        <div>
                          <div className="text-[0.625rem] text-zinc-600 uppercase">Entry</div>
                          <div className="text-sm tabular-nums text-white">
                            ${result.signal.trade_setup.entry_price.toFixed(2)}
                          </div>
                        </div>
                      )}
                      {result.signal.trade_setup.stop_loss != null && (
                        <div>
                          <div className="text-[0.625rem] text-zinc-600 uppercase">Stop</div>
                          <div className="text-sm tabular-nums text-red-400">
                            ${result.signal.trade_setup.stop_loss.toFixed(2)}
                          </div>
                        </div>
                      )}
                      {result.signal.trade_setup.target_price != null && (
                        <div>
                          <div className="text-[0.625rem] text-zinc-600 uppercase">Target</div>
                          <div className="text-sm tabular-nums text-[#00d4aa]">
                            ${result.signal.trade_setup.target_price.toFixed(2)}
                          </div>
                        </div>
                      )}
                      {result.signal.trade_setup.position_size_usd != null && (
                        <div>
                          <div className="text-[0.625rem] text-zinc-600 uppercase">Size</div>
                          <div className="text-sm tabular-nums text-white">
                            ${result.signal.trade_setup.position_size_usd.toFixed(0)}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : result.status === "no_signal" ? (
                <div className="text-sm text-zinc-400">{result.reason}</div>
              ) : null}

              {/* Alternative matches */}
              {result.other_matches && result.other_matches.length > 0 && (
                <details className="group">
                  <summary className="flex items-center gap-1 text-[0.75rem] text-zinc-500 cursor-pointer hover:text-zinc-400 transition-colors">
                    <ChevronDown className="h-3 w-3 group-open:rotate-180 transition-transform" />
                    {result.other_matches.length} other matching market{result.other_matches.length > 1 ? "s" : ""}
                  </summary>
                  <div className="mt-2 space-y-1.5 pl-4">
                    {result.other_matches.map((m) => (
                      <button
                        key={m.condition_id}
                        onClick={() => handleRetry(m.title, m.condition_id)}
                        className="block w-full text-left text-[0.75rem] text-zinc-400 hover:text-white transition-colors leading-snug py-1"
                      >
                        {m.title}
                        {m.yes_price != null && (
                          <span className="ml-2 text-zinc-600">{Math.round(m.yes_price * 100)}% YES</span>
                        )}
                      </button>
                    ))}
                  </div>
                </details>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
