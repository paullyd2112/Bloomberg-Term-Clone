"use client";

import { Layers, Wallet, BarChart3, ArrowRight } from "lucide-react";
import Link from "next/link";

export default function PositionsPage() {
  return (
    <div className="p-5 md:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-2.5">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-violet-700/30 bg-violet-500/10 text-violet-400">
          <Layers className="h-4 w-4" />
        </span>
        <h1 className="text-xl font-semibold tracking-tight text-white">Positions</h1>
      </div>

      <div className="flex flex-col items-center justify-center py-20 gap-6">
        <div className="relative">
          <div className="h-20 w-20 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
            <Wallet className="h-9 w-9 text-violet-400" />
          </div>
          <div className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
            <BarChart3 className="h-3.5 w-3.5 text-emerald-400" />
          </div>
        </div>

        <div className="text-center max-w-sm">
          <h2 className="text-lg font-semibold text-white mb-2">Trading — Coming Soon</h2>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Non-custodial Polymarket trading directly from Plebs. Connect your wallet, place orders, and track your positions — all in one interface.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-lg">
          {[
            { label: "Wallet Connection", desc: "MetaMask, WalletConnect, Coinbase" },
            { label: "Order Placement", desc: "Market & limit orders via CLOB" },
            { label: "Live P&L Tracking", desc: "Real-time position monitoring" },
          ].map(({ label, desc }) => (
            <div key={label} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 text-center">
              <div className="text-xs font-medium text-zinc-300">{label}</div>
              <div className="text-[10px] text-zinc-500 mt-0.5">{desc}</div>
            </div>
          ))}
        </div>

        <Link
          href="/dashboard/predictions"
          className="inline-flex items-center gap-2 text-sm font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
        >
          Browse Prediction Markets
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
