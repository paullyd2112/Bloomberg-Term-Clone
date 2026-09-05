"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Experience = "beginner" | "intermediate" | "advanced";
type AssetPref  = "crypto" | "predictions";

const EXPERIENCE_OPTIONS: { value: Experience; label: string; desc: string }[] = [
  { value: "beginner",     label: "Beginner",     desc: "New to trading, learning the ropes" },
  { value: "intermediate", label: "Intermediate",  desc: "Comfortable with crypto and charts" },
  { value: "advanced",     label: "Advanced",      desc: "Leverage, DeFi, active trading" },
];

const ASSET_OPTIONS: { value: AssetPref; label: string; icon: string; desc: string }[] = [
  { value: "crypto",       label: "Crypto",              icon: "₿",  desc: "BTC, ETH, altcoins" },
  { value: "predictions",  label: "Prediction Markets",  icon: "🎯", desc: "Polymarket, macro events, elections" },
];

const STEPS = ["profile", "experience", "markets", "done"] as const;
type Step = (typeof STEPS)[number];

export default function OnboardingPage() {
  const [step, setStep]         = useState<Step>("profile");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone]       = useState("");
  const [experience, setExp]    = useState<Experience | null>(null);
  const [assets, setAssets]     = useState<Set<AssetPref>>(new Set());
  const [newsletter, setNews]    = useState(true);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  const stepIndex = STEPS.indexOf(step);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }: { data: { user: { user_metadata?: Record<string, string> } | null } }) => {
      const name = data.user?.user_metadata?.full_name
        ?? data.user?.user_metadata?.name
        ?? "";
      if (name) setFullName(name);
    });
  }, []);

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
          full_name:          fullName.trim(),
          phone_number:       phone.trim() || null,
          trading_experience: experience,
          asset_preferences:  Array.from(assets),
          subscribe_newsletter: newsletter,
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
        plebs<span className="text-green-400">.finance</span>
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
        {/* ── Step 1: Profile ── */}
        {step === "profile" && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Welcome to Plebs</h1>
              <p className="text-zinc-500 text-sm mt-1">Tell us a bit about yourself.</p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1" htmlFor="full_name">
                  Full name <span className="text-red-400">*</span>
                </label>
                <input
                  id="full_name"
                  type="text"
                  autoComplete="name"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-green-500 transition-colors"
                  placeholder="Your name"
                />
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1" htmlFor="phone">
                  Phone number <span className="text-zinc-600">(optional)</span>
                </label>
                <input
                  id="phone"
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-green-500 transition-colors"
                  placeholder="+1 (555) 123-4567"
                />
              </div>
            </div>

            <button
              disabled={!fullName.trim()}
              onClick={() => setStep("experience")}
              className="w-full bg-green-500 hover:bg-green-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold py-3 rounded-lg transition-colors"
            >
              Continue
            </button>
          </div>
        )}

        {/* ── Step 2: Experience ── */}
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

            <div className="flex gap-3">
              <button
                onClick={() => setStep("profile")}
                className="px-5 py-3 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white transition-colors text-sm"
              >
                Back
              </button>
              <button
                disabled={!experience}
                onClick={() => setStep("markets")}
                className="flex-1 bg-green-500 hover:bg-green-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold py-3 rounded-lg transition-colors"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Markets ── */}
        {step === "markets" && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white">What markets do you trade?</h1>
              <p className="text-zinc-500 text-sm mt-1">Select all that apply, pick at least one.</p>
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

            <label className="flex items-start gap-3 p-4 rounded-lg border border-zinc-800 bg-zinc-900 cursor-pointer hover:border-zinc-600 transition-colors">
              <input
                type="checkbox"
                checked={newsletter}
                onChange={(e) => setNews(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-green-500 focus:ring-green-500 focus:ring-offset-0 accent-green-500"
              />
              <div>
                <div className="font-semibold text-white text-sm">Daily morning briefing</div>
                <div className="text-xs text-zinc-400 mt-0.5">
                  Market recap, AI signals, and trade ideas, delivered daily
                </div>
              </div>
            </label>

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

        {/* ── Step 4: Done ── */}
        {step === "done" && (
          <div className="text-center space-y-6">
            <div className="text-6xl">🎉</div>
            <div>
              <h1 className="text-2xl font-bold text-white">You&apos;re all set!</h1>
              <p className="text-zinc-400 text-sm mt-2">
                Everything is ready. Jump into the dashboard to see live signals.
              </p>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-left space-y-2">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                What&apos;s included
              </p>
              {[
                "AI crypto signals with tracked win rates",
                "Prediction market analysis",
                "Unlimited watchlist",
                "Morning briefing email",
                "Per-asset AI accuracy tracking",
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
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
