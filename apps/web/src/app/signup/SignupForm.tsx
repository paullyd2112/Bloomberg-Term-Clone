"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const CARD = "bg-white/[0.02] border border-white/[0.06] ring-hairline rounded-2xl p-6";
const INPUT =
  "w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/60 focus:bg-white/[0.05] transition-colors";
const PRIMARY_BTN =
  "w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors";

export default function SignupForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const supabase = createClient();

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setSent(true);
    }
  }

  async function handleGoogleSignup() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
  }

  if (sent) {
    return (
      <div className={`${CARD} text-center space-y-4`}>
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-emerald-700/30 bg-emerald-500/10 text-emerald-400">
          <Mail className="h-5 w-5" />
        </div>
        <h2 className="text-white font-semibold">Check your email</h2>
        <p className="text-secondary-foreground text-sm leading-relaxed">
          We sent a confirmation link to <span className="text-white">{email}</span>.
          Click it to activate your account and start your 14-day trial.
        </p>
        <Link href="/login" className="text-emerald-400 text-sm hover:text-emerald-300 transition-colors">
          Back to sign in
        </Link>
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

      <button
        onClick={handleGoogleSignup}
        className="w-full flex items-center justify-center gap-2 bg-white text-black font-medium rounded-lg px-4 py-2.5 text-sm hover:bg-zinc-100 transition-colors"
      >
        <GoogleIcon />
        Continue with Google
      </button>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-white/[0.08]" />
        <span className="text-xs text-muted-foreground">or</span>
        <div className="flex-1 h-px bg-white/[0.08]" />
      </div>

      <form onSubmit={handleSignup} className="space-y-3">
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

        <div>
          <label className="block text-xs text-secondary-foreground mb-1.5" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={INPUT}
            placeholder="min. 8 characters"
          />
        </div>

        <button type="submit" disabled={loading} className={PRIMARY_BTN}>
          {loading ? "Creating account…" : "Create account, 14-day trial"}
        </button>
      </form>

      <p className="text-center text-xs text-muted-foreground leading-relaxed">
        By signing up you agree to our{" "}
        <Link href="/terms" className="text-secondary-foreground hover:text-white transition-colors">Terms</Link>
        {" "}and{" "}
        <Link href="/privacy" className="text-secondary-foreground hover:text-white transition-colors">Privacy Policy</Link>.
      </p>

      <p className="text-center text-xs text-muted-foreground">
        Already have an account?{" "}
        <Link
          href={`/login?next=${encodeURIComponent(next)}`}
          className="text-emerald-400 hover:text-emerald-300 transition-colors"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}
