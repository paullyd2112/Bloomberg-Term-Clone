"use client";

import { useState } from "react";
import Link from "next/link";

type Experience = "beginner" | "intermediate" | "advanced";
type AssetPref  = "stocks" | "crypto" | "predictions";

const EXPERIENCE_OPTIONS: { value: Experience; label: string; desc: string }[] = [
  { value: "beginner",     label: "Beginner",     desc: "New to trading, learning the ropes" },
  { value: "intermediate", label: "Intermediate",  desc: "Comfortable with stocks and charts" },
  { value: "advanced",     label: "Advanced",      desc: "Options, leverage, prediction markets" },
];

const ASSET_OPTIONS: { value: AssetPref; label: string; icon: string; desc: string }[] = [
  { value: "stocks",      label: "Stocks",             icon: "📈", desc: "Equities, ETFs, options flow" },
  { value: "crypto",      label: "Crypto",              icon: "₿",  desc: "BTC, ETH, altcoins" },
  { value: "predictions", label: "Prediction markets",  icon: "🎯", desc: "Polymarket & Kalshi" },
];

const STEPS = ["experience", "markets", "done"] as const;
type Step = (typeof STEPS)[number];

export default function OnboardingPage() {
  const [step, setStep]         = useState<Step>("experience");
  const [experience, setExp]    = useState<Experience | null>(null);
  const [assets, setAssets]     = useState<Set<AssetPref>>(new Set());
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  const stepIndex = STEPS.indexOf(step);

  function toggleAsset(a: AssetPref) {
    setAssets((prev) => {
      const next = new Set(prev);
      if (next.has(a)) next.delete(a); else next.add(a);
      return next;
    });
  }

  async function handleDone() {
    if (!experience || assets.size === 0) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/onboarding", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          trading_experience: experience,
          asset_preferences:  Array.from(assets),
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setStep("done");
    } catch {
      setError("Something went wrong. Try again.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#09090b] flex flex-col items-center justify-center px-4 py-16">
      {/* Brand */}
      <div className="mb-10 text-2xl font-extrabold text-white tracking-tight">
        plebs<span className="text-green-400">.io</span>
      </div>

      {/* Progress dots */}
      {step !== "done" && (
        <div className="flex gap-2 mb-8">
          {STEPS.filter((s) => s !== "done").map((s, i) => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all ${
                i <= stepIndex ? "bg-green-500 w-8" : "bg-zinc-700 w-4"
              }`}
            />
          ))}
        </div>
      )}

      <div className="w-full max-w-md">
        {/* ── Step 1: Experience ── */}
        {step === "experience" && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white">What&apos;s your trading experience?</h1>
              <p className="text-zinc-500 text-sm mt-1">We&apos;ll tailor signal explanations to your level.</p>
            </div>

            <div className="space-y-3">
              {EXPERIENCE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setExp(opt.value)}
                  className={`w-full text-left p-4 rounded-lg border transition-colors ${
                    experience === opt.value
                      ? "border-green-500 bg-green-500/10"
                      : "border-zinc-800 bg-zinc-900 hover:border-zinc-600"
                  }`}
                >
                  <div className="font-semibold text-white">{opt.label}</div>
                  <div className="text-sm text-zinc-400 mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>

            <button
              disabled={!experience}
              onClick={() => setStep("markets")}
              className="w-full bg-green-500 hover:bg-green-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold py-3 rounded-lg transition-colors"
            >
              Continue
            </button>
          </div>
        )}

        {/* ── Step 2: Markets ── */}
        {step === "markets" && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white">What markets do you trade?</h1>
              <p className="text-zinc-500 text-sm mt-1">Select all that apply — pick at least one.</p>
            </div>

            <div className="space-y-3">
              {ASSET_OPTIONS.map((opt) => {
                const selected = assets.has(opt.value);
                return (
                  <button
                    key={opt.value}
                    onClick={() => toggleAsset(opt.value)}
                    className={`w-full text-left p-4 rounded-lg border transition-colors ${
                      selected
                        ? "border-green-500 bg-green-500/10"
                        : "border-zinc-800 bg-zinc-900 hover:border-zinc-600"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{opt.icon}</span>
                      <div>
                        <div className="font-semibold text-white">{opt.label}</div>
                        <div className="text-sm text-zinc-400 mt-0.5">{opt.desc}</div>
                      </div>
                      {selected && (
                        <div className="ml-auto w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M2 5l2.5 2.5L8 3" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {error && (
              <p className="text-sm text-red-400">{error}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setStep("experience")}
                className="px-5 py-3 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white transition-colors text-sm"
              >
                Back
              </button>
              <button
                disabled={assets.size === 0 || loading}
                onClick={handleDone}
                className="flex-1 bg-green-500 hover:bg-green-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold py-3 rounded-lg transition-colors"
              >
                {loading ? "Saving…" : "Let's go →"}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Done ── */}
        {step === "done" && (
          <div className="text-center space-y-6">
            <div className="text-6xl">🎉</div>
            <div>
              <h1 className="text-2xl font-bold text-white">You&apos;re all set!</h1>
              <p className="text-zinc-400 text-sm mt-2">
                Your 7-day trial is active. Full access starts now.
              </p>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-left space-y-2">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Included in your trial
              </p>
              {[
                "Real-time signals — stocks, crypto & predictions",
                "Unlimited watchlist",
                "Full options flow + dark pool",
                "Morning briefing email (8:45am ET)",
                "Congressional trades tracker",
              ].map((f) => (
                <div key={f} className="flex items-center gap-2 text-sm text-zinc-300">
                  <span className="text-green-400">✓</span>
                  {f}
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <Link
                href="/dashboard"
                className="block w-full bg-green-500 hover:bg-green-400 text-black font-bold py-3 rounded-lg transition-colors text-center"
              >
                Open dashboard →
              </Link>
              <Link
                href="/dashboard/upgrade"
                className="block text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                View plans &amp; pricing
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
