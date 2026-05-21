/**
 * Mock data layer — replace each function with a real API adapter
 * when API keys are available. Shape matches the types in /types/index.ts.
 */

import type {
  Signal,
  StockQuote,
  OptionsFlow,
  CryptoQuote,
  PredictionMarket,
  TickerItem,
  DarkPoolPrint,
} from "@/types";

// ─── Signals ─────────────────────────────────────────────────────────────────

export function getMockSignals(): Signal[] {
  const now = new Date();
  const ago = (s: number) => new Date(now.getTime() - s * 1000);

  return [
    {
      id: "s1",
      type: "options_sweep",
      vertical: "stocks",
      ticker: "NVDA",
      title: "NVDA — Massive Call Sweep",
      summary: "$4.2M in call sweeps hit the tape at the ask. Exp. Jun 21, $950 strike.",
      detail: "3 separate sweep orders totaling 2,100 contracts crossed at the ask within 45 seconds. Open interest on this strike up 340% today. Unusual Whales flow score: 94/100.",
      sentiment: "bullish",
      urgency: "high",
      tier: "free",
      value: 4_200_000,
      premium: 4_200_000,
      timestamp: ago(42),
      tags: ["sweep", "calls", "semis"],
    },
    {
      id: "s2",
      type: "whale_trade",
      vertical: "crypto",
      ticker: "BTC",
      title: "BTC — Whale Accumulation",
      summary: "Unknown wallet moved 1,240 BTC ($83M) to Coinbase Prime cold storage.",
      detail: "On-chain data shows this wallet has been accumulating since March 2024. Last moved funds 6 months ago. Coinbase Prime deposits historically precede institutional announcements.",
      sentiment: "bullish",
      urgency: "high",
      tier: "paid",
      value: 83_000_000,
      timestamp: ago(180),
      tags: ["on-chain", "accumulation", "institutional"],
    },
    {
      id: "s3",
      type: "prediction_shift",
      vertical: "predictions",
      ticker: "FED-JUNE",
      title: "Fed Rate Cut June — Odds Spike",
      summary: "Kalshi cut probability jumped from 28% → 41% in the last hour.",
      detail: "Volume on the YES side up 8x in the past hour. $2.1M in new YES contracts. Correlates with soft CPI print and dovish Fed speaker comments.",
      sentiment: "neutral",
      urgency: "high",
      tier: "paid",
      value: 2_100_000,
      timestamp: ago(310),
      tags: ["fed", "macro", "rates"],
      relatedSignals: ["s4"],
    },
    {
      id: "s4",
      type: "options_sweep",
      vertical: "stocks",
      ticker: "TLT",
      title: "TLT — Bond ETF Calls Printing",
      summary: "$1.8M in TLT calls swept across 4 exchanges. Exp. Jul 19.",
      detail: "Rate-sensitive play. If Fed cuts in June, TLT call buyers win big. This sweep crossed at the ask 3 minutes after the Kalshi odds moved.",
      sentiment: "bullish",
      urgency: "medium",
      tier: "paid",
      value: 1_800_000,
      timestamp: ago(480),
      tags: ["bonds", "rates", "tlt"],
      relatedSignals: ["s3"],
    },
    {
      id: "s5",
      type: "dark_pool",
      vertical: "stocks",
      ticker: "AAPL",
      title: "AAPL — Dark Pool Block Print",
      summary: "$245M dark pool print at $192.40. Largest single print in 60 days.",
      sentiment: "bullish",
      urgency: "medium",
      tier: "free",
      value: 245_000_000,
      timestamp: ago(900),
      tags: ["dark-pool", "block"],
    },
    {
      id: "s6",
      type: "unusual_volume",
      vertical: "crypto",
      ticker: "SOL",
      title: "SOL — Perp Volume Exploding",
      summary: "SOL perpetual futures volume up 430% vs 7-day average. Funding rate turning positive.",
      sentiment: "bullish",
      urgency: "medium",
      tier: "free",
      value: 890_000_000,
      timestamp: ago(1200),
      tags: ["perps", "volume", "solana"],
    },
    {
      id: "s7",
      type: "congressional_trade",
      vertical: "stocks",
      ticker: "PLTR",
      title: "Congressional Buy — PLTR",
      summary: "Rep. Nancy Pelosi disclosed a $500K–$1M purchase of PLTR calls. Exp. Jan 2026.",
      detail: "Filed 28 days after purchase (near the legal limit). PLTR has significant DoD contract exposure.",
      sentiment: "bullish",
      urgency: "low",
      tier: "paid",
      value: 750_000,
      timestamp: ago(3600),
      tags: ["congress", "insider", "defense"],
    },
    {
      id: "s8",
      type: "prediction_shift",
      vertical: "predictions",
      ticker: "BTC-100K",
      title: "BTC $100K by EOY — Odds Surge",
      summary: "Polymarket: BTC hitting $100K by Dec 31 probability up from 52% → 67%.",
      sentiment: "bullish",
      urgency: "low",
      tier: "free",
      value: 5_400_000,
      timestamp: ago(7200),
      tags: ["bitcoin", "polymarket"],
    },
  ];
}

// ─── Stock Quotes ─────────────────────────────────────────────────────────────

export function getMockStockQuotes(): StockQuote[] {
  return [
    { ticker: "NVDA", price: 924.50, change: 18.30, changePct: 2.02, volume: 48_200_000, avgVolume: 42_000_000, marketCap: 2_280_000_000_000, timestamp: new Date() },
    { ticker: "AAPL", price: 192.40, change: -1.20, changePct: -0.62, volume: 52_100_000, avgVolume: 58_000_000, marketCap: 2_960_000_000_000, timestamp: new Date() },
    { ticker: "TSLA", price: 178.20, change: 4.80, changePct: 2.77, volume: 92_300_000, avgVolume: 88_000_000, marketCap: 568_000_000_000, timestamp: new Date() },
    { ticker: "SPY",  price: 524.10, change: 1.40, changePct: 0.27, volume: 68_000_000, avgVolume: 72_000_000, timestamp: new Date() },
    { ticker: "QQQ",  price: 448.30, change: 2.10, changePct: 0.47, volume: 38_000_000, avgVolume: 41_000_000, timestamp: new Date() },
    { ticker: "PLTR", price: 22.80, change: 0.90, changePct: 4.11, volume: 38_400_000, avgVolume: 30_000_000, timestamp: new Date() },
    { ticker: "AMD",  price: 164.70, change: -2.40, changePct: -1.44, volume: 44_100_000, avgVolume: 48_000_000, timestamp: new Date() },
    { ticker: "META", price: 512.60, change: 8.20, changePct: 1.63, volume: 18_300_000, avgVolume: 20_000_000, timestamp: new Date() },
  ];
}

// ─── Options Flow ─────────────────────────────────────────────────────────────

export function getMockOptionsFlow(): OptionsFlow[] {
  const now = new Date();
  return [
    { id: "o1", ticker: "NVDA", expiry: "2024-06-21", strike: 950, type: "call", side: "ask", premium: 4_200_000, size: 2100, openInterest: 8400, impliedVolatility: 0.58, unusual: true, sweep: true, timestamp: new Date(now.getTime() - 42000) },
    { id: "o2", ticker: "SPY",  expiry: "2024-05-31", strike: 520, type: "put", side: "bid", premium: 1_800_000, size: 3600, openInterest: 45000, impliedVolatility: 0.18, unusual: false, sweep: false, timestamp: new Date(now.getTime() - 120000) },
    { id: "o3", ticker: "TLT",  expiry: "2024-07-19", strike: 95, type: "call", side: "ask", premium: 1_800_000, size: 4500, openInterest: 12000, impliedVolatility: 0.22, unusual: true, sweep: true, timestamp: new Date(now.getTime() - 480000) },
    { id: "o4", ticker: "TSLA", expiry: "2024-06-07", strike: 185, type: "call", side: "ask", premium: 920_000, size: 1840, openInterest: 6200, impliedVolatility: 0.72, unusual: true, sweep: false, timestamp: new Date(now.getTime() - 600000) },
    { id: "o5", ticker: "AAPL", expiry: "2024-05-31", strike: 190, type: "put", side: "ask", premium: 340_000, size: 680, openInterest: 22000, impliedVolatility: 0.24, unusual: false, sweep: false, timestamp: new Date(now.getTime() - 720000) },
    { id: "o6", ticker: "PLTR", expiry: "2026-01-16", strike: 30, type: "call", side: "ask", premium: 750_000, size: 1000, openInterest: 3200, impliedVolatility: 0.88, unusual: true, sweep: false, timestamp: new Date(now.getTime() - 3600000) },
  ];
}

// ─── Dark Pool Prints ─────────────────────────────────────────────────────────

export function getMockDarkPoolPrints(): DarkPoolPrint[] {
  return [
    { id: "dp1", ticker: "AAPL", price: 192.40, size: 1_274_000, value: 245_000_000, exchange: "FINRA ADF", timestamp: new Date(Date.now() - 900000) },
    { id: "dp2", ticker: "MSFT", price: 420.80, size: 580_000,   value: 244_000_000, exchange: "FINRA ADF", timestamp: new Date(Date.now() - 1800000) },
    { id: "dp3", ticker: "SPY",  price: 524.10, size: 750_000,   value: 393_000_000, exchange: "IEX",       timestamp: new Date(Date.now() - 2700000) },
    { id: "dp4", ticker: "NVDA", price: 922.00, size: 210_000,   value: 193_620_000, exchange: "FINRA ADF", timestamp: new Date(Date.now() - 3600000) },
  ];
}

// ─── Crypto Quotes ────────────────────────────────────────────────────────────

export function getMockCryptoQuotes(): CryptoQuote[] {
  return [
    { symbol: "BTC",  name: "Bitcoin",  price: 67_420, change24h: 1_240, changePct24h: 1.87,  volume24h: 28_400_000_000, marketCap: 1_320_000_000_000, timestamp: new Date() },
    { symbol: "ETH",  name: "Ethereum", price: 3_680,  change24h: -42,   changePct24h: -1.13, volume24h: 14_200_000_000, marketCap: 441_000_000_000, timestamp: new Date() },
    { symbol: "SOL",  name: "Solana",   price: 172.40, change24h: 8.20,  changePct24h: 5.00,  volume24h: 4_800_000_000,  marketCap: 80_000_000_000,  timestamp: new Date() },
    { symbol: "DOGE", name: "Dogecoin", price: 0.168,  change24h: -0.004, changePct24h: -2.32, volume24h: 1_200_000_000, marketCap: 24_000_000_000,  timestamp: new Date() },
    { symbol: "PEPE", name: "Pepe",     price: 0.0000128, change24h: 0.0000018, changePct24h: 16.36, volume24h: 2_100_000_000, marketCap: 5_400_000_000, timestamp: new Date() },
  ];
}

// ─── Prediction Markets ───────────────────────────────────────────────────────

export function getMockPredictionMarkets(): PredictionMarket[] {
  return [
    { id: "pm1", platform: "kalshi",     question: "Fed rate cut in June 2024?",         category: "Macro",    yesPrice: 41, noPrice: 59, volume24h: 2_100_000, totalVolume: 18_400_000, change24h: 13,  timestamp: new Date() },
    { id: "pm2", platform: "polymarket", question: "BTC above $100K by Dec 31?",          category: "Crypto",   yesPrice: 67, noPrice: 33, volume24h: 5_400_000, totalVolume: 42_000_000, change24h: 15,  timestamp: new Date() },
    { id: "pm3", platform: "polymarket", question: "Trump wins 2024 Presidential Election?", category: "Politics", yesPrice: 54, noPrice: 46, volume24h: 12_000_000, totalVolume: 180_000_000, change24h: 2, timestamp: new Date() },
    { id: "pm4", platform: "kalshi",     question: "US recession in 2024?",               category: "Macro",    yesPrice: 22, noPrice: 78, volume24h: 890_000,   totalVolume: 9_200_000,  change24h: -3,  timestamp: new Date() },
    { id: "pm5", platform: "polymarket", question: "Apple announces AI chip by WWDC?",    category: "Tech",     yesPrice: 78, noPrice: 22, volume24h: 1_400_000, totalVolume: 8_800_000,  change24h: 8,   timestamp: new Date() },
    { id: "pm6", platform: "kalshi",     question: "S&P 500 above 5500 by June 30?",      category: "Markets",  yesPrice: 48, noPrice: 52, volume24h: 3_200_000, totalVolume: 22_000_000, change24h: -4,  timestamp: new Date() },
  ];
}

// ─── Ticker Bar ───────────────────────────────────────────────────────────────

export function getMockTickerItems(): TickerItem[] {
  return [
    { symbol: "SPY",  price: 524.10, changePct: 0.27,   type: "index" },
    { symbol: "QQQ",  price: 448.30, changePct: 0.47,   type: "index" },
    { symbol: "BTC",  price: 67_420, changePct: 1.87,   type: "crypto" },
    { symbol: "ETH",  price: 3_680,  changePct: -1.13,  type: "crypto" },
    { symbol: "NVDA", price: 924.50, changePct: 2.02,   type: "stock" },
    { symbol: "AAPL", price: 192.40, changePct: -0.62,  type: "stock" },
    { symbol: "TSLA", price: 178.20, changePct: 2.77,   type: "stock" },
    { symbol: "SOL",  price: 172.40, changePct: 5.00,   type: "crypto" },
    { symbol: "VIX",  price: 13.42,  changePct: -4.20,  type: "index" },
    { symbol: "DXY",  price: 104.80, changePct: 0.12,   type: "index" },
    { symbol: "META", price: 512.60, changePct: 1.63,   type: "stock" },
    { symbol: "PLTR", price: 22.80,  changePct: 4.11,   type: "stock" },
  ];
}
