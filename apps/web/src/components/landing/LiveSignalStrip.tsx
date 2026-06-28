"use client";

import { useEffect, useState } from "react";

type LandingSignal = {
  id: number;
  identifier: string;
  direction: string;
  confidence: number;
  time_horizon: string;
  created_at: string;
};

const DIRECTION_COLOR: Record<string, string> = {
  BUY:  "text-green-400 border-green-700 bg-green-500/10",
  SELL: "text-red-400 border-red-700 bg-red-500/10",
};

const HORIZON_LABEL: Record<string, string> = {
  intraday:     "Intraday",
  swing:        "Swing",
  longterm:     "Long-term",
  before_close: "Before close",
};

function timeAgo(iso: string, now: number): string {
  const diff = now - new Date(iso).getTime();
  if (diff < 1000) return "0s ago";
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  const remainSecs = secs % 60;
  if (mins < 60) return `${mins}m ${remainSecs}s ago`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  if (hrs < 24) return `${hrs}h ${remainMins}m ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function localTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export default function LiveSignalStrip({
  initial,
}: {
  initial: LandingSignal[];
}) {
  const [signals, setSignals] = useState(initial);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const res = await fetch("/api/landing-signals");
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) setSignals(data);
      } catch {}
    }, 60_000);
    return () => clearInterval(poll);
  }, []);

  if (signals.length === 0) {
    return (
      <section className="pb-20 px-4">
        <div className="max-w-6xl mx-auto">
          <p className="text-center text-xs text-zinc-600 mb-4 uppercase tracking-widest font-semibold">
            Latest signals
          </p>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center">
            <p className="text-zinc-400 text-sm">
              Signals generating — check back shortly.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="pb-20 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-center gap-2 mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          <p className="text-center text-xs text-zinc-600 uppercase tracking-widest font-semibold">
            Live signal feed
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {signals.map((s) => {
            const color =
              DIRECTION_COLOR[s.direction] ??
              "text-zinc-400 border-zinc-600 bg-zinc-700/40";
            const horizon = HORIZON_LABEL[s.time_horizon] ?? s.time_horizon;

            return (
              <div
                key={s.id}
                className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded border ${color}`}
                    >
                      {s.direction}
                    </span>
                    <span className="font-mono font-semibold text-white">
                      {s.identifier}
                    </span>
                  </div>
                  <span className="text-xs text-zinc-500">{horizon}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${s.confidence >= 75 ? "bg-green-500" : "bg-amber-500"}`}
                      style={{ width: `${s.confidence}%` }}
                    />
                  </div>
                  <span className="text-xs text-zinc-400 tabular-nums">
                    {s.confidence}%
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-zinc-600">
                  <span>{localTime(s.created_at)}</span>
                  <span className="tabular-nums">{timeAgo(s.created_at, now)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
