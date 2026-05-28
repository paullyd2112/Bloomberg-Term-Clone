import { NextResponse } from "next/server";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { requireUser, getUserTier } from "@/lib/user";
import { canAccessFeature } from "@/lib/tier";

export const maxDuration = 60;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const Body = z.object({
  goal:              z.enum(["short_term", "medium_term", "long_term"]),
  risk_tolerance:    z.enum(["conservative", "moderate", "aggressive"]),
  investment_amount: z.number().min(100).max(10_000_000),
});

const SYSTEM_PROMPT = `You are Plebs.finance's portfolio analysis engine.

Based on the user's goals, risk tolerance, and current market signals, you suggest a specific portfolio allocation.

RULES:
- Suggest 6-12 positions across stocks, crypto, and prediction markets
- Allocations must sum to exactly 100%
- Be specific — real tickers only (NVDA, BTC, ETH, SPY, etc.)
- Weight allocations toward high-confidence signals from the data provided
- Conservative profiles: 60-70% stocks, 20-30% crypto, 5-10% prediction markets, prefer large caps
- Moderate profiles: 50% stocks, 30% crypto, 10-20% prediction markets
- Aggressive profiles: 40% stocks, 40% crypto, 20% prediction markets, allow smaller caps
- Short term (< 3 months): favor momentum signals and upcoming catalysts
- Medium term (3-12 months): balance growth and stability
- Long term (1+ years): favor fundamentally strong assets, less weight on short signals

FRAMING — always use opinion language, never advice:
- "Our model is bullish on..." not "You should buy..."
- "Based on current signals..." not "This is a safe investment..."
- "We'd think about allocating..." not "Invest X% in..."

Respond with valid JSON only — no markdown, no explanation outside the JSON:
{
  "overall_reasoning": "2-3 sentence summary of the strategy",
  "allocations": [
    {
      "ticker": "NVDA",
      "asset_type": "stock",
      "allocation_pct": 20,
      "reasoning": "1 sentence why"
    }
  ]
}`;

async function fetchSignals(supabase: ReturnType<typeof createClient>) {
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("signals")
    .select("identifier, asset_type, direction, confidence, time_horizon")
    .eq("is_backtest", false)
    .neq("direction", "HOLD")
    .gte("created_at", since)
    .gte("confidence", 60)
    .order("confidence", { ascending: false })
    .limit(20);
  return data ?? [];
}

async function fetchAccuracy(supabase: ReturnType<typeof createClient>) {
  const { data } = await supabase
    .from("asset_accuracy")
    .select("identifier, asset_type, win_rate, total_signals")
    .gte("win_rate", 55)
    .gte("total_signals", 3)
    .order("win_rate", { ascending: false })
    .limit(15);
  return data ?? [];
}

export async function POST(req: Request) {
  let user;
  try { user = await requireUser(); }
  catch { return NextResponse.json({ error: "Unauthenticated" }, { status: 401 }); }

  const tier = await getUserTier();
  if (!canAccessFeature(tier, "elite")) {
    return NextResponse.json({ error: "Elite tier required" }, { status: 403 });
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { goal, risk_tolerance, investment_amount } = parsed.data;
  const supabase = createClient();

  const [signals, accuracy] = await Promise.all([
    fetchSignals(supabase),
    fetchAccuracy(supabase),
  ]);

  const goalLabel = { short_term: "short-term (< 3 months)", medium_term: "medium-term (3-12 months)", long_term: "long-term (1+ years)" }[goal];

  const userPrompt = `
User goal: ${goalLabel}
Risk tolerance: ${risk_tolerance}
Investment amount: $${investment_amount.toLocaleString()}

Recent high-confidence signals (last 48h):
${signals.map(s => `${s.identifier} (${s.asset_type}) — ${s.direction} ${s.confidence}% confidence, ${s.time_horizon}`).join("\n") || "No recent signals"}

Best performing assets by win rate:
${accuracy.map(a => `${a.identifier} (${a.asset_type}) — ${a.win_rate}% win rate over ${a.total_signals} signals`).join("\n") || "No accuracy data yet"}

Generate a portfolio allocation for this user.`.trim();

  let raw: string;
  try {
    const msg = await client.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 1500,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: "user", content: userPrompt }],
    });
    raw = msg.content[0].type === "text" ? msg.content[0].text : "";
  } catch (err) {
    console.error("allocator: Claude call failed", err);
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }

  let parsed_result: { overall_reasoning: string; allocations: unknown[] };
  try {
    parsed_result = JSON.parse(raw);
  } catch {
    console.error("allocator: JSON parse failed", raw);
    return NextResponse.json({ error: "Invalid response from model" }, { status: 500 });
  }

  const { error } = await supabase.from("portfolio_allocations").insert({
    user_id:           user.id,
    goal,
    risk_tolerance,
    investment_amount,
    allocations:       parsed_result.allocations,
    overall_reasoning: parsed_result.overall_reasoning,
  });

  if (error) {
    console.error("allocator: db insert failed", error.message);
    return NextResponse.json({ error: "Failed to save allocation" }, { status: 500 });
  }

  return NextResponse.json(parsed_result);
}

export async function GET() {
  let user;
  try { user = await requireUser(); }
  catch { return NextResponse.json({ error: "Unauthenticated" }, { status: 401 }); }

  const tier = await getUserTier();
  if (!canAccessFeature(tier, "elite")) {
    return NextResponse.json({ error: "Elite tier required" }, { status: 403 });
  }

  const supabase = createClient();
  const { data } = await supabase
    .from("portfolio_allocations")
    .select("*")
    .eq("user_id", user.id)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json(data ?? null);
}
