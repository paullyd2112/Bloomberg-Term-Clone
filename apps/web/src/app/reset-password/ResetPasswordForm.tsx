"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const CARD = "bg-white/[0.02] border border-white/[0.06] ring-hairline rounded-2xl p-6";
const INPUT =
  "w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/60 focus:bg-white/[0.05] transition-colors";
const PRIMARY_BTN =
  "w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors";

export default function ResetPasswordForm() {
  const [email, setEmail]     = useState("");
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent]       = useState(false);

  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    // Goes straight to the confirm page, deliberately bypassing /auth/callback —
    // that route has post-signup checkout redirect logic that has no business
    // running during a password reset.
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password/confirm`,
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setSent(true);
    }
  }

  if (sent) {
    return (
      <div className={`${CARD} text-center space-y-4`}>
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-emerald-700/30 bg-emerald-500/10 text-emerald-400">
          <Mail className="h-5 w-5" />
        </div>
        <h2 className="text-white font-semibold">Check your email</h2>
        <p className="text-secondary-foreground text-sm leading-relaxed">
          If an account exists for <span className="text-white">{email}</span>, we sent a
          link to reset your password.
        </p>
      </div>
    );
  }

  return (
    <div className={`${CARD} space-y-4`}>
      {error && (
        <div className="text-sm text-red-400 bg-red-950/40 border border-red-800/60 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs text-secondary-foreground mb-1.5" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={INPUT}
            placeholder="you@example.com"
          />
        </div>

        <button type="submit" disabled={loading} className={PRIMARY_BTN}>
          {loading ? "Sending…" : "Send reset link"}
        </button>
      </form>
    </div>
  );
}
