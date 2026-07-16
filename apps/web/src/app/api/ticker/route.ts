import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const revalidate = 60;

type TickerItem = {
  identifier: string;
  price:      number;
  change_24h: number | null;
  asset_type: string;
};

// Crypto-only pivot (July 2026): stock rows are hidden from the ticker unless
// this flag is set. Code path kept intact for a future re-enable.
const STOCKS_ENABLED = process.env.ENABLE_STOCK_TICKERS === "true";

const TOP_STOCKS = [
  "AAPL","MSFT","NVDA","AMZN","GOOGL","META","TSLA","JPM","V","UNH",
  "JNJ","WMT","MA","PG","HD","XOM","COST","AVGO","BAC","LLY",
  "MRK","ABBV","CVX","PEP","KO",
];

const TOP_CRYPTO = [
  "BTC","ETH","SOL","BNB","XRP","DOGE","ADA","AVAX","LINK","DOT",
  "MATIC","UNI","LTC","ATOM","SHIB","XLM","ALGO","VET","HBAR","ETC",
  "NEAR","APT","ARB","FIL","ICP",
];

// CoinGecko symbol → id map for the crypto we surface (matches data-service).
const CG_IDS: Record<string, string> = {
  BTC: "bitcoin",      ETH: "ethereum",    SOL: "solana",
  BNB: "binancecoin",  XRP: "ripple",      DOGE: "dogecoin",
  ADA: "cardano",      AVAX: "avalanche-2", LINK: "chainlink",
  DOT: "polkadot",     MATIC: "matic-network", UNI: "uniswap",
  LTC: "litecoin",     ATOM: "cosmos",     SHIB: "shiba-inu",
  XLM: "stellar",      ALGO: "algorand",   VET: "vechain",
  HBAR: "hedera-hashgraph", ETC: "ethereum-classic", NEAR: "near",
  APT: "aptos",        ARB: "arbitrum",    FIL: "filecoin",
  ICP: "internet-computer",
};

// ─── Primary source: freshest rows from raw_prices (populated by scheduler) ────

async function fromRawPrices(marketOpen: boolean): Promise<TickerItem[]> {
  const admin = createAdminClient();

  const stockQuery = admin
    .from("raw_prices")
    .select("identifier, price, change_24h, asset_type")
    .eq("asset_type", "stock")
    .in("identifier", TOP_STOCKS)
    .order("captured_at", { ascending: false });

  const cryptoQuery = admin
    .from("raw_prices")
    .select("identifier, price, change_24h, asset_type")
    .eq("asset_type", "crypto")
    .in("identifier", TOP_CRYPTO)
    .order("captured_at", { ascending: false });

  if (marketOpen) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    stockQuery.gte("captured_at", since);
    cryptoQuery.gte("captured_at", since);
  }

  const [{ data: stocks }, { data: crypto }] = await Promise.all([
    STOCKS_ENABLED ? stockQuery : Promise.resolve({ data: [] as TickerItem[] }),
    cryptoQuery,
  ]);

  const dedup = (rows: TickerItem[] | null) => {
    const seen = new Set<string>();
    return (rows ?? []).filter((r) => {
      if (seen.has(r.identifier)) return false;
      seen.add(r.identifier);
      return true;
    });
  };

  return [
    ...dedup(stocks as TickerItem[] | null).slice(0, 25),
    ...dedup(crypto as TickerItem[] | null).slice(0, 25),
  ];
}

// ─── Live fallback: real quotes on demand when raw_prices has no fresh data ────

// Alpaca snapshot — batch call for all symbols. Primary live source.
async function liveStocksAlpaca(symbols: string[]): Promise<TickerItem[]> {
  const key = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_API_SECRET;
  if (!key || !secret || symbols.length === 0) return [];
  try {
    const res = await fetch(
      `https://data.alpaca.markets/v2/stocks/snapshots?symbols=${symbols.join(",")}&feed=iex`,
      {
        headers: {
          "APCA-API-KEY-ID": key,
          "APCA-API-SECRET-KEY": secret,
        },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as Record<string, {
      latestTrade?: { p: number };
      dailyBar?: { c: number; o: number };
      prevDailyBar?: { c: number };
    }>;
    return Object.entries(data)
      .filter(([, snap]) => snap.latestTrade?.p || snap.dailyBar?.c)
      .map(([symbol, snap]) => {
        const price = snap.latestTrade?.p ?? snap.dailyBar?.c ?? 0;
        const prevClose = snap.prevDailyBar?.c;
        const change = prevClose ? ((price - prevClose) / prevClose) * 100 : null;
        return { identifier: symbol, price, change_24h: change, asset_type: "stock" };
      });
  } catch {
    return [];
  }
}

// Alpaca crypto quotes — batch call for crypto symbols.
async function liveCryptoAlpaca(symbols: string[]): Promise<TickerItem[]> {
  const key = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_API_SECRET;
  if (!key || !secret || symbols.length === 0) return [];
  const pairs = symbols.map((s) => `${s}/USD`);
  try {
    const res = await fetch(
      `https://data.alpaca.markets/v1beta3/crypto/us/latest/quotes?symbols=${pairs.join(",")}`,
      {
        headers: {
          "APCA-API-KEY-ID": key,
          "APCA-API-SECRET-KEY": secret,
        },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { quotes: Record<string, { ap?: number; bp?: number }> };
    return Object.entries(data.quotes ?? {})
      .filter(([, q]) => q.ap || q.bp)
      .map(([pair, q]) => ({
        identifier: pair.replace("/USD", ""),
        price: q.ap ?? q.bp ?? 0,
        change_24h: null,
        asset_type: "crypto",
      }));
  } catch {
    return [];
  }
}

// FMP batch quote — fallback for stocks. One call covers all symbols.
async function liveStocksFmp(symbols: string[]): Promise<TickerItem[]> {
  const key = process.env.FMP_API_KEY;
  if (!key || symbols.length === 0) return [];
  try {
    const res = await fetch(
      `https://financialmodelingprep.com/api/v3/quote/${symbols.join(",")}?apikey=${key}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return [];
    const rows = (await res.json()) as { symbol: string; price: number; changesPercentage: number }[];
    return (Array.isArray(rows) ? rows : [])
      .filter((r) => typeof r.price === "number")
      .map((r) => ({
        identifier: r.symbol,
        price:      r.price,
        change_24h: typeof r.changesPercentage === "number" ? r.changesPercentage : null,
        asset_type: "stock",
      }));
  } catch {
    return [];
  }
}

// Finnhub quote — one symbol per call. Fills gaps FMP didn't cover.
async function liveStocksFinnhub(symbols: string[]): Promise<TickerItem[]> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key || symbols.length === 0) return [];
  const results = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const res = await fetch(
          `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${key}`,
          { signal: AbortSignal.timeout(6000) },
        );
        if (!res.ok) return null;
        // Finnhub quote: c = current price, dp = percent change, pc = prev close
        const q = (await res.json()) as { c?: number; dp?: number; pc?: number };
        if (typeof q.c !== "number" || q.c === 0) return null;
        return {
          identifier: symbol,
          price:      q.c,
          change_24h: typeof q.dp === "number" ? q.dp : null,
          asset_type: "stock",
        } as TickerItem;
      } catch {
        return null;
      }
    }),
  );
  return results.filter((r): r is TickerItem => r !== null);
}

// Multi-source live fallback: Alpaca first, then FMP, then Finnhub fills gaps.
async function liveStocks(): Promise<TickerItem[]> {
  const fromAlpaca = await liveStocksAlpaca(TOP_STOCKS);
  const have = new Set(fromAlpaca.map((i) => i.identifier));
  let missing = TOP_STOCKS.filter((s) => !have.has(s));

  if (missing.length === 0) return fromAlpaca;

  const fromFmp = await liveStocksFmp(missing);
  for (const item of fromFmp) have.add(item.identifier);
  missing = TOP_STOCKS.filter((s) => !have.has(s));

  if (missing.length === 0) return [...fromAlpaca, ...fromFmp];

  const fromFinnhub = await liveStocksFinnhub(missing);
  return [...fromAlpaca, ...fromFmp, ...fromFinnhub];
}

async function liveCryptoCoingecko(symbols: string[]): Promise<TickerItem[]> {
  if (symbols.length === 0) return [];
  const ids = symbols.map((s) => CG_IDS[s]).filter(Boolean);
  const idToSymbol = Object.fromEntries(
    Object.entries(CG_IDS).map(([sym, id]) => [id, sym]),
  );
  const headers: Record<string, string> = {};
  if (process.env.COINGECKO_API_KEY) headers["x-cg-demo-api-key"] = process.env.COINGECKO_API_KEY;
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=usd&include_24hr_change=true`,
      { headers, signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as Record<string, { usd?: number; usd_24h_change?: number }>;
    const items: TickerItem[] = [];
    for (const [id, val] of Object.entries(data)) {
      const symbol = idToSymbol[id];
      if (!symbol || typeof val.usd !== "number") continue;
      items.push({
        identifier: symbol,
        price:      val.usd,
        change_24h: typeof val.usd_24h_change === "number" ? val.usd_24h_change : null,
        asset_type: "crypto",
      });
    }
    return items;
  } catch {
    return [];
  }
}

// Multi-source live fallback: Alpaca first, then CoinGecko fills gaps.
async function liveCrypto(): Promise<TickerItem[]> {
  const fromAlpaca = await liveCryptoAlpaca(TOP_CRYPTO);
  const have = new Set(fromAlpaca.map((i) => i.identifier));
  const missing = TOP_CRYPTO.filter((s) => !have.has(s));

  if (missing.length === 0) return fromAlpaca;

  const fromCG = await liveCryptoCoingecko(missing);
  return [...fromAlpaca, ...fromCG];
}

function isMarketOpen(): boolean {
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = et.getDay();
  if (day === 0 || day === 6) return false;
  const mins = et.getHours() * 60 + et.getMinutes();
  return mins >= 570 && mins < 960;
}

export async function GET() {
  const marketOpen = isMarketOpen();

  const [rawItems, liveStockItems, liveCryptoItems] = await Promise.all([
    fromRawPrices(marketOpen).catch(() => [] as TickerItem[]),
    STOCKS_ENABLED && marketOpen
      ? liveStocks().catch(() => [] as TickerItem[])
      : Promise.resolve([]),
    liveCrypto().catch(() => [] as TickerItem[]),
  ]);

  const merged = new Map<string, TickerItem>();

  for (const item of rawItems) {
    merged.set(item.identifier, item);
  }
  for (const item of [...liveStockItems, ...liveCryptoItems]) {
    merged.set(item.identifier, item);
  }

  const items = Array.from(merged.values()).filter((i) => i.price != null);
  return NextResponse.json({ items });
}
