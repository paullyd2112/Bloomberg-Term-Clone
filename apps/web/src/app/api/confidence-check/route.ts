import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, getUserTier } from "@/lib/user";
import { canAccessFeature } from "@/lib/tier";

export const maxDuration = 45;

const Body = z.object({
  question: z.string().min(5).max(500),
  condition_id: z.string().optional(),
});

const DATA_SERVICE_URL =
  process.env.DATA_SERVICE_URL ||
  "https://bloomberg-term-clone-production.up.railway.app";

export async function POST(request: Request) {
  const user = await requireUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tier = await getUserTier();
  if (!canAccessFeature(tier, "on_demand_scoring")) {
    return NextResponse.json(
      { error: "Confidence check is an Elite feature" },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please enter a question (at least 5 characters)" },
      { status: 400 },
    );
  }

  const { question, condition_id } = parsed.data;

  try {
    const payload: Record<string, string> = {
      question,
      subscription: tier,
    };
    if (condition_id) {
      payload.condition_id = condition_id;
    }

    const resp = await fetch(`${DATA_SERVICE_URL}/confidence-check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await resp.json();

    if (!resp.ok) {
      return NextResponse.json(
        { error: data.error || "Scoring failed" },
        { status: resp.status },
      );
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Scoring service unavailable" },
      { status: 503 },
    );
  }
}
