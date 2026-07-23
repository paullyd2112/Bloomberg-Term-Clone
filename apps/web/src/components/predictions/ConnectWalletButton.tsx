"use client";

import { useAccount, useConnect, useDisconnect, useBalance } from "wagmi";
import { polygon } from "wagmi/chains";
import { Wallet, ChevronDown, LogOut } from "lucide-react";
import { useState } from "react";
import { clsx } from "clsx";

const USDC_ADDRESS = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" as const;

export default function ConnectWalletButton() {
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const [showMenu, setShowMenu] = useState(false);

  const { data: usdcBalance } = useBalance({
    address,
    token: USDC_ADDRESS,
    chainId: polygon.id,
  });

  if (isConnected && address) {
    const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
    const balance = usdcBalance ? Number(usdcBalance.formatted).toFixed(2) : "—";

    return (
      <div className="relative">
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.1] rounded-lg px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/[0.06] transition-colors"
        >
          <Wallet className="h-3.5 w-3.5 text-emerald-400" />
          <span className="tabular-nums">{short}</span>
          <span className="text-zinc-500">·</span>
          <span className="text-emerald-400 tabular-nums">${balance}</span>
          <ChevronDown className="h-3 w-3 text-zinc-500" />
        </button>

        {showMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
            <div className="absolute right-0 top-full mt-1 z-50 bg-zinc-900 border border-white/[0.08] rounded-lg shadow-xl py-1 min-w-[160px]">
              <button
                onClick={() => { disconnect(); setShowMenu(false); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs text-red-400 hover:bg-white/[0.04] transition-colors"
              >
                <LogOut className="h-3.5 w-3.5" />
                Disconnect
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        disabled={isPending}
        className="flex items-center gap-2 bg-emerald-500/15 border border-emerald-500/30 rounded-lg px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/25 transition-colors disabled:opacity-50"
      >
        <Wallet className="h-3.5 w-3.5" />
        {isPending ? "Connecting…" : "Connect Wallet"}
      </button>

      {showMenu && !isPending && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 bg-zinc-900 border border-white/[0.08] rounded-lg shadow-xl py-1 min-w-[200px]">
            {connectors.map((connector) => (
              <button
                key={connector.uid}
                onClick={() => { connect({ connector }); setShowMenu(false); }}
                className={clsx(
                  "flex items-center gap-2 w-full px-3 py-2.5 text-xs text-zinc-300",
                  "hover:bg-white/[0.04] transition-colors",
                )}
              >
                <Wallet className="h-3.5 w-3.5 text-zinc-500" />
                {connector.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
