"use client";

import { useState } from "react";

type Status = "idle" | "loading" | "done" | "already_subscribed" | "has_account" | "error";

export default function NewsletterSignup() {
  const [email,  setEmail]  = useState("");
  const [status, setStatus] = useState<Status>("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setStatus("loading");
    try {
      const res  = await fetch("/api/newsletter/subscribe", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok)            setStatus("error");
      else if (data.exists)   setStatus("has_account");
      else if (data.already_subscribed) setStatus("already_subscribed");
      else                    setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <p className="text-green-400 font-medium text-sm">
        You&apos;re in. First email drops tomorrow before market open.
      </p>
    );
  }

  if (status === "already_subscribed") {
    return (
      <p className="text-zinc-400 font-medium text-sm">
        You&apos;re already subscribed. Check your inbox tomorrow morning.
      </p>
    );
  }

  if (status === "has_account") {
    return (
      <p className="text-zinc-400 font-medium text-sm">
        Looks like you already have a Plebs account.{" "}
        <a href="/login" className="text-green-400 underline underline-offset-2 hover:text-green-300">
          Log in to access the full dashboard.
        </a>
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2 w-full max-w-md mx-auto">
      <input
        type="email"
        required
        placeholder="your@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-green-500 transition-colors"
      />
      <button
        type="submit"
        disabled={status === "loading"}
        className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 border border-zinc-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors whitespace-nowrap"
      >
        {status === "loading" ? "..." : "Get the newsletter"}
      </button>
      {status === "error" && (
        <p className="text-red-400 text-xs mt-1 w-full">Something went wrong. Try again.</p>
      )}
    </form>
  );
}
