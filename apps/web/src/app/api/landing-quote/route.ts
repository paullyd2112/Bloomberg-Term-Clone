import { NextResponse } from "next/server";

/**
 * Public single-quote endpoint for the landing "Asset intelligence" demo.
 * Primary source is Yahoo Finance's keyless chart API, which returns a real
 * intraday price series + previous close (works even when the market is
 * closed). Falls back to FMP / Finnhub when those keys are configured.
 */

export const revalidate = 60;

type QuoteResult = {
  identifier: string;
  price: number;
  change: number;
  series: number[];
};

// ─── Primary: Yahoo Finance chart API (keyless, includes intraday series) ──────

// Crypto symbols we surface — Yahoo wants "BTC-USD", FMP wants "BTCUSD".
const CRYPTO_SYMBOLS = new Set([
  "BTC", "ETH", "SOL", "XRP", "ADA", "DOGE", "AVAX", "LINK", "DOT", "LTC",
]);

async function fromYahoo(symbol: string): Promise<QuoteResult | null> {
  const yahooSymbol = CRYPTO_SYMBOLS.has(symbol) ? `${symbol}-USD` : symbol;
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?range=1d&interval=15m`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      chart?: {
        result?: {
          meta?: { regularMarketPrice?: number; chartPreviousClose?: number };
          indicators?: { quote?: { close?: (number | null)[] }[] };
        }[];
      };
    };
    const result = json.chart?.result?.[0];
    const meta = result?.meta;
    if (!meta || typeof meta.regularMarketPrice !== "number") return null;

    const prevClose = meta.chartPreviousClose ?? meta.regularMarketPrice;
    const price = meta.regularMarketPrice;
    const change = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;

    const rawSeries = (result?.indicators?.quote?.[0]?.close ?? []).filter(
      (v): v is number => typeof v === "number",
    );
    // Ensure the series starts at prev close and ends at the latest price.
    const series = [prevClose, ...rawSeries];
    if (series[series.length - 1] !== price) series.push(price);

    return { identifier: symbol, price, change, series };
  } catch {
    return null;
  }
}

// ─── Fallbacks: FMP then Finnhub (production, key-gated; no intraday series) ────

async function fromFmp(symbol: string): Promise<QuoteResult | null> {
  const key = process.env.FMP_API_KEY;
  if (!key) return null;
  const fmpSymbol = CRYPTO_SYMBOLS.has(symbol) ? `${symbol}USD` : symbol;
  try {
    const res = await fetch(
      `https://financialmodelingprep.com/api/v3/quote/${fmpSymbol}?apikey=${key}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as {
      symbol: string;
      price: number;
      changesPercentage: number;
    }[];
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row || typeof row.price !== "number") return null;
    return {
      identifier: row.symbol,
      price: row.price,
      change: typeof row.changesPercentage === "number" ? row.changesPercentage : 0,
      series: [],
    };
  } catch {
    return null;
  }
}

async function fromFinnhub(symbol: string): Promise<QuoteResult | null> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${key}`,
      { signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return null;
    const q = (await res.json()) as { c?: number; dp?: number };
    if (typeof q.c !== "number" || q.c === 0) return null;
    return {
      identifier: symbol,
      price: q.c,
      change: typeof q.dp === "number" ? q.dp : 0,
      series: [],
    };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = (searchParams.get("symbol") ?? "BTC").toUpperCase();
  // Guard against abuse: only allow simple ticker symbols.
  const symbol = /^[A-Z.]{1,6}$/.test(raw) ? raw : "BTC";

  const quote =
    (await fromYahoo(symbol)) ??
    (await fromFmp(symbol)) ??
    (await fromFinnhub(symbol));

  if (!quote) {
    return NextResponse.json(
      { error: "Live quote unavailable" },
      { status: 503 },
    );
  }

  return NextResponse.json(quote);
}
