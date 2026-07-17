"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Lock, TrendingUp, BarChart3, Zap } from "lucide-react";

export default function StocksBetaPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || loading) return;
    setLoading(true);
    try {
      const supabase = createClient();
      await supabase.from("waitlist").insert({ email, feature: "stocks_options" });
      setSubmitted(true);
    } catch {
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-lg text-center space-y-8">
        {/* Lock icon */}
        <div className="relative mx-auto w-20 h-20">
          <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-xl" />
          <div className="relative w-20 h-20 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
            <Lock className="w-8 h-8 text-emerald-400" />
          </div>
        </div>

        {/* Headline */}
        <div className="space-y-3">
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Stocks & Options Alpha
          </h1>
          <p className="text-base text-zinc-400 leading-relaxed max-w-md mx-auto">
            Currently sandboxed in private beta to protect user capital. Unlocks in Q3 2026.
          </p>
        </div>

        {/* Feature preview */}
        <div className="grid grid-cols-3 gap-3 max-w-sm mx-auto">
          {[
            { icon: TrendingUp, label: "AI Stock Signals" },
            { icon: BarChart3, label: "Options Flow" },
            { icon: Zap, label: "Real-Time Alerts" },
          ].map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 space-y-2"
            >
              <Icon className="w-5 h-5 text-zinc-500 mx-auto" />
              <p className="text-[11px] text-zinc-500 font-medium">{label}</p>
            </div>
          ))}
        </div>

        {/* Waitlist form */}
        {submitted ? (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-6 py-4">
            <p className="text-emerald-400 font-semibold text-sm">
              You&apos;re on the list. We&apos;ll notify you when Stocks & Options goes live.
            </p>
          </div>
        ) : (
          <form onSubmit={handleJoin} className="flex flex-col sm:flex-row gap-3 max-w-sm mx-auto">
            <input
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 bg-white/[0.04] border border-white/[0.1] rounded-lg px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 transition-colors"
            />
            <button
              type="submit"
              disabled={loading}
              className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-bold text-sm px-6 py-3 rounded-lg transition-colors whitespace-nowrap"
            >
              {loading ? "Joining…" : "Join the Waitlist"}
            </button>
          </form>
        )}

        <p className="text-xs text-zinc-600">
          Early access subscribers get priority when we launch.
        </p>
      </div>
    </div>
  );
}
