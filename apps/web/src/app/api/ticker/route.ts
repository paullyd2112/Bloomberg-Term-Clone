import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const revalidate = 60;

type TickerItem = {
  identifier: string;
  price:      number;
  change_24h: number | null;
  asset_type: string;
};

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

async function fromRawPrices(): Promise<TickerItem[]> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [{ data: stocks }, { data: crypto }] = await Promise.all([
    admin
      .from("raw_prices")
      .select("identifier, price, change_24h, asset_type")
      .eq("asset_type", "stock")
      .in("identifier", TOP_STOCKS)
      .gte("captured_at", since)
      .order("captured_at", { ascending: false }),
    admin
      .from("raw_prices")
      .select("identifier, price, change_24h, asset_type")
      .eq("asset_type", "crypto")
      .in("identifier", TOP_CRYPTO)
      .gte("captured_at", since)
      .order("captured_at", { ascending: false }),
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

// FMP batch quote — one call covers all symbols. Primary live source.
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

// Multi-source live fallback: FMP batch first, then Finnhub fills any gaps.
// Never depends on a single provider — if FMP is down/rate-limited, Finnhub covers.
async function liveStocks(): Promise<TickerItem[]> {
  const fromFmp = await liveStocksFmp(TOP_STOCKS);
  const have = new Set(fromFmp.map((i) => i.identifier));
  const missing = TOP_STOCKS.filter((s) => !have.has(s));

  if (missing.length === 0) return fromFmp;

  const fromFinnhub = await liveStocksFinnhub(missing);
  return [...fromFmp, ...fromFinnhub];
}

async function liveCrypto(): Promise<TickerItem[]> {
  const ids = TOP_CRYPTO.map((s) => CG_IDS[s]).filter(Boolean);
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

export async function GET() {
  const [rawItems, liveStockItems, liveCryptoItems] = await Promise.all([
    fromRawPrices().catch(() => [] as TickerItem[]),
    liveStocks().catch(() => [] as TickerItem[]),
    liveCrypto().catch(() => [] as TickerItem[]),
  ]);

  const merged = new Map<string, TickerItem>();

  for (const item of rawItems) {
    merged.set(item.identifier, item);
  }
  for (const item of [...liveStockItems, ...liveCryptoItems]) {
    merged.set(item.identifier, item);
  }

  return NextResponse.json({ items: Array.from(merged.values()) });
}
