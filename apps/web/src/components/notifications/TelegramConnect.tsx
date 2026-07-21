"use client";

import { useEffect, useState } from "react";

type State = "loading" | "disconnected" | "connected" | "working";

export default function TelegramConnect() {
  const [state, setState] = useState<State>("loading");
  const [deepLink, setDeepLink] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/telegram")
      .then((r) => r.json())
      .then((d) => setState(d.connected ? "connected" : "disconnected"))
      .catch(() => setState("disconnected"));
  }, []);

  async function connect() {
    setState("working");
    try {
      const resp = await fetch("/api/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "connect" }),
      });
      const data = await resp.json();
      if (data.deepLink) {
        setDeepLink(data.deepLink);
        window.open(data.deepLink, "_blank");
        setTimeout(async () => {
          const check = await fetch("/api/telegram").then((r) => r.json());
          setState(check.connected ? "connected" : "disconnected");
          if (check.connected) setDeepLink(null);
        }, 10000);
        setState("disconnected");
      }
    } catch {
      setState("disconnected");
    }
  }

  async function disconnect() {
    setState("working");
    try {
      await fetch("/api/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disconnect" }),
      });
      setState("disconnected");
      setDeepLink(null);
    } catch {
      setState("connected");
    }
  }

  if (state === "loading") {
    return <div className="text-xs text-zinc-600">Checking Telegram status...</div>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-white font-medium">Telegram alerts</p>
          <p className="text-xs text-zinc-500">
            Instant signal alerts via Telegram — faster than browser push.
          </p>
        </div>
        {state === "connected" ? (
          <button
            onClick={disconnect}
            disabled={state === "working" as never}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white/[0.06] border border-white/[0.1] text-zinc-300 hover:bg-white/[0.1] transition-colors flex-shrink-0"
          >
            Disconnect
          </button>
        ) : (
          <button
            onClick={connect}
            disabled={state === "working" as never}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#2AABEE] text-white hover:bg-[#229ED9] transition-colors flex-shrink-0 disabled:opacity-50"
          >
            {state === "working" ? "..." : "Connect"}
          </button>
        )}
      </div>

      {state === "connected" && (
        <p className="text-xs text-emerald-500">Connected — signals will arrive in Telegram instantly.</p>
      )}

      {deepLink && state !== "connected" && (
        <div className="text-xs text-zinc-400 space-y-1">
          <p>
            Didn&apos;t open?{" "}
            <a
              href={deepLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#2AABEE] hover:underline"
            >
              Tap here to open Telegram
            </a>
          </p>
          <p className="text-zinc-600">After pressing Start in Telegram, come back here — it&apos;ll update automatically.</p>
        </div>
      )}
    </div>
  );
}
