import { NextResponse } from "next/server";

const DATA_SERVICE_URL =
  process.env.DATA_SERVICE_URL ||
  "https://bloomberg-term-clone-production.up.railway.app";

export const revalidate = 120;

export async function GET() {
  try {
    const resp = await fetch(`${DATA_SERVICE_URL}/legislative-catalysts?limit=30`, {
      next: { revalidate: 120 },
    });
    if (!resp.ok) {
      return NextResponse.json([], { status: resp.status });
    }
    const data = await resp.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json([], { status: 500 });
  }
}
