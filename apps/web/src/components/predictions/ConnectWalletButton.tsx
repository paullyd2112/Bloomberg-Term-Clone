"use client";

import { Wallet } from "lucide-react";
import { useState } from "react";

export default function ConnectWalletButton() {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setShowTooltip(true)}
        className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-300 transition-colors cursor-default"
      >
        <Wallet className="h-3.5 w-3.5" />
        Trade
      </button>

      {showTooltip && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowTooltip(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 bg-zinc-900 border border-white/[0.1] rounded-xl shadow-2xl p-4 w-64">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-6 w-6 rounded-full bg-emerald-500/15 flex items-center justify-center">
                <Wallet className="h-3 w-3 text-emerald-400" />
              </div>
              <span className="text-sm font-medium text-white">Coming Soon</span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Non-custodial trading directly on Polymarket. Connect your wallet, place orders, and track positions — all from here.
            </p>
            <button
              onClick={() => setShowTooltip(false)}
              className="mt-3 w-full py-1.5 text-xs font-medium text-zinc-400 bg-white/[0.04] border border-white/[0.08] rounded-lg hover:bg-white/[0.06] transition-colors"
            >
              Got it
            </button>
          </div>
        </>
      )}
    </div>
  );
}
