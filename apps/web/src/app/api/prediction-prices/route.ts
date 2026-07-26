import { NextResponse } from "next/server";

export const revalidate = 0;
export const dynamic = "force-dynamic";

const DATA_SERVICE_URL =
  process.env.DATA_SERVICE_URL ||
  "https://bloomberg-term-clone-production.up.railway.app";

export async function GET() {
  try {
    const res = await fetch(`${DATA_SERVICE_URL}/prediction-prices`, {
      next: { revalidate: 0 },
    });
    if (!res.ok) {
      return NextResponse.json({ prices: {}, count: 0 });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ prices: {}, count: 0 });
  }
}
