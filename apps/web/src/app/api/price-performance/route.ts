import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const revalidate = 300; // 5 min cache

type Period = {
  label: string;
  daysBack: number;
};

const PERIODS: Period[] = [
  { label: "1D",  daysBack: 1 },
  { label: "1W",  daysBack: 7 },
  { label: "1M",  daysBack: 30 },
  { label: "60D", daysBack: 60 },
  { label: "90D", daysBack: 90 },
  { label: "1Y",  daysBack: 365 },
  { label: "ALL", daysBack: 9999 },
];

export type PricePerformanceItem = {
  label: string;
  price: number | null;
  change: number | null;
  date: string | null;
};

export type PricePerformanceResponse = {
  identifier: string;
  assetType: string;
  currentPrice: number | null;
  periods: PricePerformanceItem[];
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const identifier = searchParams.get("identifier");
  const assetType = searchParams.get("assetType") || "crypto";

  if (!identifier) {
    return NextResponse.json({ error: "identifier required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Get current price
  const { data: currentRow } = await supabase
    .from("raw_prices")
    .select("price, captured_at")
    .eq("asset_type", assetType)
    .eq("identifier", identifier)
    .order("captured_at", { ascending: false })
    .limit(1)
    .single();

  const currentPrice = currentRow?.price != null ? Number(currentRow.price) : null;

  // Query historical prices for each period in parallel
  const periodQueries = PERIODS.map(async (period): Promise<PricePerformanceItem> => {
    if (currentPrice == null) {
      return { label: period.label, price: null, change: null, date: null };
    }

    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - period.daysBack);

    if (period.label === "ALL") {
      // Get the oldest row
      const { data } = await supabase
        .from("raw_prices")
        .select("price, captured_at")
        .eq("asset_type", assetType)
        .eq("identifier", identifier)
        .order("captured_at", { ascending: true })
        .limit(1)
        .single();

      if (!data?.price) {
        return { label: period.label, price: null, change: null, date: null };
      }

      const pastPrice = Number(data.price);
      const change = ((currentPrice - pastPrice) / pastPrice) * 100;
      return {
        label: period.label,
        price: pastPrice,
        change: Math.round(change * 100) / 100,
        date: data.captured_at,
      };
    }

    // Find the closest row to the target date
    // Query a small window around the target and pick the nearest
    const windowStart = new Date(targetDate);
    windowStart.setHours(windowStart.getHours() - 12);
    const windowEnd = new Date(targetDate);
    windowEnd.setHours(windowEnd.getHours() + 12);

    const { data } = await supabase
      .from("raw_prices")
      .select("price, captured_at")
      .eq("asset_type", assetType)
      .eq("identifier", identifier)
      .gte("captured_at", windowStart.toISOString())
      .lte("captured_at", windowEnd.toISOString())
      .order("captured_at", { ascending: true })
      .limit(1)
      .single();

    if (data?.price) {
      const pastPrice = Number(data.price);
      const change = ((currentPrice - pastPrice) / pastPrice) * 100;
      return {
        label: period.label,
        price: pastPrice,
        change: Math.round(change * 100) / 100,
        date: data.captured_at,
      };
    }

    // Widen the window if no result in the tight range
    const { data: widerData } = await supabase
      .from("raw_prices")
      .select("price, captured_at")
      .eq("asset_type", assetType)
      .eq("identifier", identifier)
      .lte("captured_at", windowEnd.toISOString())
      .order("captured_at", { ascending: false })
      .limit(1)
      .single();

    if (widerData?.price) {
      const pastPrice = Number(widerData.price);
      const change = ((currentPrice - pastPrice) / pastPrice) * 100;
      return {
        label: period.label,
        price: pastPrice,
        change: Math.round(change * 100) / 100,
        date: widerData.captured_at,
      };
    }

    return { label: period.label, price: null, change: null, date: null };
  });

  const periods = await Promise.all(periodQueries);

  const response: PricePerformanceResponse = {
    identifier,
    assetType,
    currentPrice,
    periods,
  };

  return NextResponse.json(response);
}
