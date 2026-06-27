import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/user";

export const maxDuration = 30;

const Body = z.object({
  asset_type: z.enum(["stock", "crypto"]),
  identifier: z.string().min(1).max(10),
});

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || "https://bloomberg-term-clone-production.up.railway.app";

export async function POST(request: Request) {
  const user = await requireUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!DATA_SERVICE_URL) {
    return NextResponse.json({ error: "Data service not configured" }, { status: 503 });
  }

  const { asset_type, identifier } = parsed.data;

  try {
    const resp = await fetch(`${DATA_SERVICE_URL}/ingest-asset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset_type, identifier: identifier.toUpperCase() }),
    });

    const result = await resp.json();

    if (!resp.ok) {
      return NextResponse.json(
        { error: result.reason || "Could not fetch data for this ticker" },
        { status: resp.status },
      );
    }

    return NextResponse.json({ status: "ok", identifier: result.identifier });
  } catch {
    return NextResponse.json({ error: "Data service unavailable" }, { status: 503 });
  }
}
