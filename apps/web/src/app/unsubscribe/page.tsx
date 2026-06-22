"use client";

import { useState } from "react";

type Status = "idle" | "loading" | "done" | "error";

export default function UnsubscribePage() {
  const [email,  setEmail]  = useState("");
  const [status, setStatus] = useState<Status>("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setStatus("loading");
    try {
      const res = await fetch("/api/newsletter/unsubscribe", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email }),
      });
      setStatus(res.ok ? "done" : "error");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <div className="text-2xl font-bold text-white mb-1">
          plebs<span className="text-green-400">.finance</span>
        </div>
        <p className="text-zinc-500 text-sm mb-8">Newsletter preferences</p>

        {status === "done" ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <p className="text-green-400 font-medium mb-1">You&apos;re unsubscribed.</p>
            <p className="text-zinc-500 text-sm">
              You won&apos;t receive any more emails from us.{" "}
              <a href="/signup" className="text-zinc-400 underline underline-offset-2 hover:text-white transition-colors">
                Create an account
              </a>{" "}
              any time.
            </p>
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <h1 className="text-white font-semibold text-lg mb-1">Unsubscribe</h1>
            <p className="text-zinc-500 text-sm mb-6">
              Enter the email address you subscribed with and we&apos;ll remove you immediately.
            </p>
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <input
                type="email"
                required
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
              />
              <button
                type="submit"
                disabled={status === "loading"}
                className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 border border-zinc-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
              >
                {status === "loading" ? "Unsubscribing…" : "Unsubscribe"}
              </button>
              {status === "error" && (
                <p className="text-red-400 text-xs">Something went wrong. Try again.</p>
              )}
            </form>
          </div>
        )}

        <a href="/" className="inline-block mt-6 text-zinc-600 hover:text-zinc-400 text-xs transition-colors">
          ← Back to Plebs
        </a>
      </div>
    </div>
  );
}
