import { NextResponse } from "next/server";

const DATA_SERVICE_URL =
  process.env.DATA_SERVICE_URL ||
  "https://bloomberg-term-clone-production.up.railway.app";

export const revalidate = 60;

export async function GET() {
  try {
    const resp = await fetch(`${DATA_SERVICE_URL}/whale-alerts?limit=50`, {
      next: { revalidate: 60 },
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
