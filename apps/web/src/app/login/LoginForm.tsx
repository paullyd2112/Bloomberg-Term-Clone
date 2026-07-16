"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type LoginMode = "password" | "magic-link";

const CARD = "bg-white/[0.02] border border-white/[0.06] ring-hairline rounded-2xl p-6";
const INPUT =
  "w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/60 focus:bg-white/[0.05] transition-colors";
const PRIMARY_BTN =
  "w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";
  const urlError = searchParams.get("error");

  const [mode, setMode] = useState<LoginMode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(urlError ? "Authentication failed. Please try again." : "");
  const [loading, setLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  const supabase = createClient();

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      if (data.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("onboarding_completed")
          .eq("id", data.user.id)
          .single();
        if (!profile?.onboarding_completed) {
          router.push("/onboarding");
          return;
        }
      }
      router.push(next);
      router.refresh();
    }
  }

  async function handleMagicLinkLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      setError(error.message);
    } else {
      setMagicLinkSent(true);
    }
    setLoading(false);
  }

  async function handleGoogleLogin() {
    setError("");
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
  }

  function switchMode(newMode: LoginMode) {
    setMode(newMode);
    setError("");
    setMagicLinkSent(false);
  }

  if (magicLinkSent) {
    return (
      <div className={`${CARD} text-center space-y-4`}>
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-emerald-700/30 bg-emerald-500/10 text-emerald-400">
          <Mail className="h-5 w-5" />
        </div>
        <h2 className="text-white font-semibold">Check your email for a sign-in link</h2>
        <p className="text-secondary-foreground text-sm leading-relaxed">
          We sent a magic link to <span className="text-white">{email}</span>.
          Click it to sign in. No password needed.
        </p>
        <button
          onClick={() => setMagicLinkSent(false)}
          className="text-emerald-400 text-sm hover:text-emerald-300 transition-colors"
        >
          Back to sign in
        </button>
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
        onClick={handleGoogleLogin}
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

      {/* Mode toggle tabs */}
      <div className="flex rounded-lg bg-white/[0.04] p-0.5">
        <button
          type="button"
          onClick={() => switchMode("password")}
          className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${
            mode === "password"
              ? "bg-white/[0.08] text-white"
              : "text-secondary-foreground hover:text-white"
          }`}
        >
          Password
        </button>
        <button
          type="button"
          onClick={() => switchMode("magic-link")}
          className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${
            mode === "magic-link"
              ? "bg-white/[0.08] text-white"
              : "text-secondary-foreground hover:text-white"
          }`}
        >
          Magic link
        </button>
      </div>

      {mode === "password" ? (
        <form onSubmit={handleEmailLogin} className="space-y-3">
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
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={INPUT}
              placeholder="••••••••"
            />
          </div>

          <button type="submit" disabled={loading} className={PRIMARY_BTN}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleMagicLinkLogin} className="space-y-3">
          <div>
            <label className="block text-xs text-secondary-foreground mb-1.5" htmlFor="magic-email">
              Email
            </label>
            <input
              id="magic-email"
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
            {loading ? "Sending link…" : "Send magic link"}
          </button>

          <p className="text-xs text-muted-foreground leading-relaxed">
            We&apos;ll email you a link that signs you in instantly. No password required.
          </p>
        </form>
      )}

      <p className="text-center text-xs text-muted-foreground">
        No account?{" "}
        <Link
          href={`/signup?next=${encodeURIComponent(next)}`}
          className="text-emerald-400 hover:text-emerald-300 transition-colors"
        >
          Start free trial
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
