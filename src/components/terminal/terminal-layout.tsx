"use client";

import { useState, useEffect } from "react";
import { useAppStore } from "@/store/app-store";
import { TopNav } from "./top-nav";
import { TickerBar } from "./ticker-bar";
import { UpgradeModal } from "./upgrade-modal";
import { SignalFeed } from "@/components/signals/signal-feed";
import { StocksPanel } from "@/components/markets/stocks-panel";
import { CryptoPanel } from "@/components/markets/crypto-panel";
import { PredictionsPanel } from "@/components/markets/predictions-panel";
import {
  getMockSignals,
  getMockStockQuotes,
  getMockOptionsFlow,
  getMockDarkPoolPrints,
  getMockCryptoQuotes,
  getMockPredictionMarkets,
  getMockTickerItems,
} from "@/lib/adapters/mock-data";
import { Zap } from "lucide-react";

// Load data (will be replaced with React Query + real adapters)
const signals         = getMockSignals();
const stockQuotes     = getMockStockQuotes();
const optionsFlow     = getMockOptionsFlow();
const darkPoolPrints  = getMockDarkPoolPrints();
const cryptoQuotes    = getMockCryptoQuotes();
const predMarkets     = getMockPredictionMarkets();
const tickerItems     = getMockTickerItems();

type Panel = "signals" | "market";

export function TerminalLayout() {
  const { activeVertical } = useAppStore();
  const [activePanel, setActivePanel] = useState<Panel>("signals");
  const [showUpgrade, setShowUpgrade] = useState(false);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#0a0b0d]">
      <TopNav onUpgradeClick={() => setShowUpgrade(true)} />
      <TickerBar items={tickerItems} />

      {/* Sub-nav */}
      <div className="flex items-center gap-1 px-4 h-9 bg-[#0a0b0d] border-b border-[#1e2433] flex-shrink-0">
        {(["signals", "market"] as Panel[]).map((p) => (
          <button
            key={p}
            onClick={() => setActivePanel(p)}
            className={`px-3 py-1 rounded text-xs font-medium capitalize transition-colors ${
              activePanel === p
                ? "text-[#e2e8f0] bg-[#1e2433]"
                : "text-[#64748b] hover:text-[#94a3b8]"
            }`}
          >
            {p === "signals" ? (
              <span className="flex items-center gap-1.5">
                <Zap size={10} />
                Signal Feed
              </span>
            ) : (
              <span className="capitalize">
                {activeVertical.charAt(0).toUpperCase() + activeVertical.slice(1)} View
              </span>
            )}
          </button>
        ))}

        {/* Live clock */}
        <LiveClock />
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">
        {activePanel === "signals" ? (
          <SignalFeed signals={signals} onUpgrade={() => setShowUpgrade(true)} />
        ) : activeVertical === "stocks" ? (
          <StocksPanel quotes={stockQuotes} optionsFlow={optionsFlow} darkPool={darkPoolPrints} />
        ) : activeVertical === "crypto" ? (
          <CryptoPanel quotes={cryptoQuotes} />
        ) : (
          <PredictionsPanel markets={predMarkets} />
        )}
      </main>

      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}
    </div>
  );
}

function LiveClock() {
  const [time, setTime] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="ml-auto text-[10px] tabular-nums text-[#64748b]">
      {time.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
      {" "}ET
    </div>
  );
}
