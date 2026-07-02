"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const CARD = "bg-white/[0.02] border border-white/[0.06] ring-hairline rounded-2xl p-6";
const INPUT =
  "w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/60 focus:bg-white/[0.05] transition-colors";
const PRIMARY_BTN =
  "w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors";

type SessionState = "checking" | "ready" | "invalid";

export default function UpdatePasswordForm() {
  const router = useRouter();
  const supabase = createClient();

  const [sessionState, setSessionState] = useState<SessionState>("checking");
  const [password, setPassword]         = useState("");
  const [confirm, setConfirm]           = useState("");
  const [error, setError]               = useState("");
  const [loading, setLoading]           = useState(false);
  const [done, setDone]                 = useState(false);

  useEffect(() => {
    // The recovery link's token is processed automatically by the browser
    // client on load (detectSessionInUrl). We just need to confirm it landed
    // us a session before letting the user set a new password.
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        setSessionState("ready");
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setSessionState("ready");
    });

    const timeout = setTimeout(() => {
      setSessionState((s) => (s === "checking" ? "invalid" : s));
    }, 4000);

    return () => {
      listener.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setDone(true);
      setTimeout(() => router.push("/dashboard"), 1500);
    }
  }

  if (sessionState === "checking") {
    return (
      <div className={`${CARD} h-40 shimmer`} />
    );
  }

  if (sessionState === "invalid") {
    return (
      <div className={`${CARD} text-center space-y-3`}>
        <p className="text-white font-semibold">This link has expired or was already used.</p>
        <p className="text-secondary-foreground text-sm">
          <Link href="/reset-password" className="text-emerald-400 hover:text-emerald-300 transition-colors">
            Request a new reset link
          </Link>
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className={`${CARD} text-center space-y-3`}>
        <p className="text-white font-semibold">Password updated.</p>
        <p className="text-secondary-foreground text-sm">Taking you to your dashboard…</p>
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
          <label className="block text-xs text-secondary-foreground mb-1.5" htmlFor="password">
            New password
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

        <div>
          <label className="block text-xs text-secondary-foreground mb-1.5" htmlFor="confirm">
            Confirm password
          </label>
          <input
            id="confirm"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={INPUT}
            placeholder="re-enter password"
          />
        </div>

        <button type="submit" disabled={loading} className={PRIMARY_BTN}>
          {loading ? "Updating…" : "Update password"}
        </button>
      </form>
    </div>
  );
}
