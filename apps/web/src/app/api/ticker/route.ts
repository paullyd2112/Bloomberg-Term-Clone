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

const FALLBACK = [
  { identifier: "BTC",   price: 105420,  change_24h:  1.84, asset_type: "crypto" },
  { identifier: "ETH",   price: 3812,    change_24h:  2.31, asset_type: "crypto" },
  { identifier: "SOL",   price: 187.4,   change_24h:  3.12, asset_type: "crypto" },
  { identifier: "NVDA",  price: 1087.20, change_24h:  1.43, asset_type: "stock"  },
  { identifier: "AAPL",  price: 213.50,  change_24h:  0.62, asset_type: "stock"  },
  { identifier: "MSFT",  price: 425.80,  change_24h:  0.88, asset_type: "stock"  },
  { identifier: "TSLA",  price: 248.90,  change_24h: -1.22, asset_type: "stock"  },
  { identifier: "META",  price: 512.30,  change_24h:  1.05, asset_type: "stock"  },
  { identifier: "AMZN",  price: 198.70,  change_24h:  0.74, asset_type: "stock"  },
  { identifier: "GOOG",  price: 178.40,  change_24h:  0.51, asset_type: "stock"  },
  { identifier: "XRP",   price: 2.41,    change_24h:  4.20, asset_type: "crypto" },
  { identifier: "DOGE",  price: 0.1842,  change_24h:  5.31, asset_type: "crypto" },
  { identifier: "JPM",   price: 221.60,  change_24h:  0.38, asset_type: "stock"  },
  { identifier: "SPY",   price: 541.20,  change_24h:  0.42, asset_type: "stock"  },
  { identifier: "QQQ",   price: 463.80,  change_24h:  0.67, asset_type: "stock"  },
  { identifier: "BNB",   price: 642.10,  change_24h:  1.15, asset_type: "crypto" },
  { identifier: "AVAX",  price: 38.72,   change_24h:  2.84, asset_type: "crypto" },
  { identifier: "LINK",  price: 14.83,   change_24h:  1.92, asset_type: "crypto" },
  { identifier: "V",     price: 278.40,  change_24h:  0.29, asset_type: "stock"  },
  { identifier: "MA",    price: 474.20,  change_24h:  0.44, asset_type: "stock"  },
  { identifier: "ADA",   price: 0.4821,  change_24h:  1.67, asset_type: "crypto" },
  { identifier: "AVGO",  price: 1642.30, change_24h:  0.93, asset_type: "stock"  },
  { identifier: "LLY",   price: 812.40,  change_24h: -0.31, asset_type: "stock"  },
  { identifier: "UNH",   price: 512.80,  change_24h: -0.48, asset_type: "stock"  },
  { identifier: "DOT",   price: 7.42,    change_24h:  2.11, asset_type: "crypto" },
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

    return NextResponse.json({ items: items.length > 0 ? items : FALLBACK });
  } catch {
    return NextResponse.json({ items: FALLBACK });
  }
}
