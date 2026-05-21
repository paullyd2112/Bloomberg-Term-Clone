// ─── Market Verticals ────────────────────────────────────────────────────────

export type MarketVertical = "stocks" | "crypto" | "predictions";

// ─── Signal Feed ─────────────────────────────────────────────────────────────

export type SignalType =
  | "options_sweep"
  | "dark_pool"
  | "unusual_volume"
  | "whale_trade"
  | "prediction_shift"
  | "congressional_trade"
  | "earnings_surprise"
  | "news_catalyst";

export type SignalSentiment = "bullish" | "bearish" | "neutral";
export type SignalUrgency = "high" | "medium" | "low";
export type SignalTier = "free" | "paid";

export interface Signal {
  id: string;
  type: SignalType;
  vertical: MarketVertical;
  ticker: string;
  title: string;
  summary: string;           // plain-language description
  detail?: string;           // drill-down detail (paid tier)
  sentiment: SignalSentiment;
  urgency: SignalUrgency;
  tier: SignalTier;
  value?: number;            // dollar value of the flow
  premium?: number;          // options premium if applicable
  timestamp: Date;
  tags?: string[];
  relatedSignals?: string[]; // ids of correlated signals across verticals
}

// ─── Stocks ──────────────────────────────────────────────────────────────────

export interface StockQuote {
  ticker: string;
  price: number;
  change: number;
  changePct: number;
  volume: number;
  avgVolume: number;
  marketCap?: number;
  high52w?: number;
  low52w?: number;
  timestamp: Date;
}

export interface OptionsFlow {
  id: string;
  ticker: string;
  expiry: string;
  strike: number;
  type: "call" | "put";
  side: "ask" | "bid" | "mid";
  premium: number;
  size: number;
  openInterest: number;
  impliedVolatility: number;
  unusual: boolean;
  sweep: boolean;
  timestamp: Date;
}

export interface DarkPoolPrint {
  id: string;
  ticker: string;
  price: number;
  size: number;
  value: number;
  exchange: string;
  timestamp: Date;
}

// ─── Crypto ──────────────────────────────────────────────────────────────────

export interface CryptoQuote {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  changePct24h: number;
  volume24h: number;
  marketCap: number;
  timestamp: Date;
}

export interface WhtaleTrade {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  value: number;
  exchange: string;
  timestamp: Date;
}

// ─── Prediction Markets ───────────────────────────────────────────────────────

export interface PredictionMarket {
  id: string;
  platform: "polymarket" | "kalshi";
  question: string;
  category: string;
  yesPrice: number;   // 0-100 probability
  noPrice: number;
  volume24h: number;
  totalVolume: number;
  resolveDate?: Date;
  change24h: number;  // probability point change
  timestamp: Date;
}

// ─── User & Subscription ─────────────────────────────────────────────────────

export type SubscriptionTier = "free" | "pro";

export interface UserSubscription {
  tier: SubscriptionTier;
  trialEndsAt?: Date;
  renewsAt?: Date;
}

// ─── Market Overview Ticker ───────────────────────────────────────────────────

export interface TickerItem {
  symbol: string;
  price: number;
  changePct: number;
  type: "stock" | "crypto" | "index";
}
