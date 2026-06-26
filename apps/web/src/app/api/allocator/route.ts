import { NextResponse } from "next/server";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { requireUser, getUserTier } from "@/lib/user";

export const maxDuration = 60;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const Body = z.object({
  goal:              z.enum(["short_term", "medium_term", "long_term"]),
  risk_tolerance:    z.enum(["conservative", "moderate", "aggressive"]),
  investment_amount: z.number().min(100).max(10_000_000),
});

const SYSTEM_PROMPT = `You are Plebs.finance's portfolio analysis engine.

Based on the user's goals, risk tolerance, and current market signals, you suggest a specific portfolio allocation across stocks, crypto, and prediction markets.

ASSET CLASS RULES:

Stocks:
- Always the core of any allocation
- Conservative: 60-70%, Moderate: 45-55%, Aggressive: 35-45%
- Prefer large cap for conservative/medium term, allow growth and small cap for aggressive
- Tickers: real symbols only — NVDA, TSLA, AAPL, SPY, QQQ, etc.

Crypto:
- Included in all profiles, sized by risk tolerance
- Conservative: 15-20% (BTC/ETH only), Moderate: 25-35% (BTC, ETH, select alts), Aggressive: 35-45% (BTC, ETH, higher beta alts)
- For long term, weight toward BTC and ETH — they compound over time
- For short term, crypto momentum signals matter more — follow the signal data

Prediction Markets:
- This is where the fast money lives — breaking news, macro events, defined resolution dates
- SHORT TERM ONLY priority asset: prediction markets are strongest when the resolution date is within 90 days and there's a clear catalyst (Fed decision, earnings, political event)
- MEDIUM TERM: use sparingly — 5-10% max, only on high-confidence macro events with defined timelines
- LONG TERM: minimal to zero — 7+ months out, too much can change. 0-5% max, only if a contract has exceptional signal confidence
- The edge here is speed — our signals reprice faster than the market. Size positions accordingly but don't hold long term
- Identifiers: use contract names like "FED-RATE-CUT-SEP", "BTC>100k", etc.

TIME HORIZON RULES:
- Short term (< 3 months): favor momentum, upcoming catalysts, prediction market contracts resolving soon, higher crypto weight
- Medium term (3-12 months): balance growth and stability, selective prediction markets, mix of crypto and quality stocks
- Long term (1+ years): fundamentally strong assets, BTC/ETH for crypto, quality stocks, almost no prediction markets — time destroys edge in prediction markets

GENERAL:
- Suggest 6-12 positions, allocations must sum to exactly 100%
- Weight toward high-confidence signals from the data provided
- The allocator is the slow money — signals and alerts handle the fast money

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
  if (tier !== "elite") {
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
    let cleaned = raw.trim();
    const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) cleaned = fenceMatch[1].trim();
    parsed_result = JSON.parse(cleaned);
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
  if (tier !== "elite") {
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
