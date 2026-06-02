import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const revalidate = 60;

const TOP_STOCKS = [
  "AAPL","MSFT","NVDA","AMZN","GOOG","META","TSLA","JPM","V","UNH",
  "JNJ","WMT","MA","PG","HD","XOM","COST","AVGO","BAC","LLY",
  "MRK","ABBV","CVX","PEP","KO",
];

const TOP_CRYPTO = [
  "BTC","ETH","SOL","BNB","XRP","DOGE","ADA","AVAX","LINK","DOT",
  "MATIC","UNI","LTC","ATOM","SHIB","XLM","ALGO","VET","HBAR","ETC",
  "NEAR","APT","ARB","FIL","ICP",
];

export async function GET() {
  try {
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

    const dedup = (rows: typeof stocks) => {
      const seen = new Set<string>();
      return (rows ?? []).filter(r => {
        if (seen.has(r.identifier)) return false;
        seen.add(r.identifier);
        return true;
      });
    };

    const stockItems = dedup(stocks).slice(0, 25);
    const cryptoItems = dedup(crypto).slice(0, 25);
    const items = [...stockItems, ...cryptoItems];

    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ items: [] });
  }
}
