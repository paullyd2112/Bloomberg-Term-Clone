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

Based on the user's goals, risk tolerance, and current market signals, you suggest a specific portfolio allocation across stocks and crypto.

ASSET CLASS RULES:

Stocks:
- Always the core of any allocation
- Conservative: 60-80%, Moderate: 50-65%, Aggressive: 35-50%
- Prefer large cap for conservative/medium term, allow growth and small cap for aggressive
- Tickers: real symbols only — NVDA, TSLA, AAPL, SPY, QQQ, etc.

Crypto:
- Included in all profiles, sized by risk tolerance
- Conservative: 15-25% (BTC/ETH only), Moderate: 25-35% (BTC, ETH, select alts), Aggressive: 40-55% (BTC, ETH, higher beta alts)
- For long term, weight toward BTC and ETH — they compound over time
- For short term, crypto momentum signals matter more — follow the signal data

TIME HORIZON RULES:
- Short term (< 3 months): favor momentum, upcoming catalysts, higher crypto weight
- Medium term (3-12 months): balance growth and stability, mix of crypto and quality stocks
- Long term (1+ years): fundamentally strong assets, BTC/ETH for crypto, quality stocks

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

type Allocation = { ticker: string; asset_type: string; allocation_pct: number; reasoning: string };

// The system prompt describes allocation ranges in plain text (e.g. "conservative:
// 60-80% stocks"), but nothing stops the model from ignoring them — the same
// prompt-only-gate gap that used to let stock/crypto signals ignore their own
// "HARD GATE" text until deterministic gates were added to scoring/engine.py.
// This is the one live, user-facing feature that outputs money-allocation-shaped
// numbers, so clamp and renormalize its output instead of trusting it as-is.
const MAX_SINGLE_POSITION_PCT = 35;

function renormalizeTo100(items: Allocation[]): void {
  const total = items.reduce((sum, a) => sum + a.allocation_pct, 0);
  if (total <= 0) return;
  const scale = 100 / total;
  for (const a of items) a.allocation_pct = Math.round(a.allocation_pct * scale * 10) / 10;
}

function sanitizeAllocations(raw: unknown[]): Allocation[] {
  const items: Allocation[] = raw
    .filter((a): a is Record<string, unknown> => typeof a === "object" && a !== null)
    .map((a) => ({
      ticker:         String(a.ticker ?? "").toUpperCase().trim(),
      asset_type:     String(a.asset_type ?? "").trim(),
      allocation_pct: Number(a.allocation_pct),
      reasoning:      String(a.reasoning ?? ""),
    }))
    .filter((a) => a.ticker && a.asset_type && Number.isFinite(a.allocation_pct) && a.allocation_pct > 0);

  if (items.length === 0) return items;

  // Normalize to exactly 100% first — the redistribution below conserves the
  // total, so doing this up front means it stays at ~100% throughout.
  renormalizeTo100(items);

  // Clamp anything over the cap and hand the excess to items still under the
  // cap. Bounded loop because redistributing can itself push a previously-fine
  // item over the cap (rare with a handful of positions, but handle it rather
  // than assume one pass is enough).
  for (let i = 0; i < 5; i++) {
    const overCap = items.filter((a) => a.allocation_pct > MAX_SINGLE_POSITION_PCT);
    if (overCap.length === 0) break;

    let excess = 0;
    for (const a of overCap) {
      excess += a.allocation_pct - MAX_SINGLE_POSITION_PCT;
      a.allocation_pct = MAX_SINGLE_POSITION_PCT;
    }

    const underCap = items.filter((a) => a.allocation_pct < MAX_SINGLE_POSITION_PCT);
    if (underCap.length === 0) break; // everything's already at the cap — nowhere left to put the excess
    const share = excess / underCap.length;
    for (const a of underCap) a.allocation_pct += share;
  }

  return items;
}

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

  if (!Array.isArray(parsed_result.allocations)) {
    console.error("allocator: allocations was not an array", parsed_result);
    return NextResponse.json({ error: "Invalid response from model" }, { status: 500 });
  }

  const allocations = sanitizeAllocations(parsed_result.allocations);
  if (allocations.length === 0) {
    console.error("allocator: no valid allocations survived sanitization", parsed_result.allocations);
    return NextResponse.json({ error: "Invalid response from model" }, { status: 500 });
  }

  const result = { overall_reasoning: parsed_result.overall_reasoning, allocations };

  const { error } = await supabase.from("portfolio_allocations").insert({
    user_id:           user.id,
    goal,
    risk_tolerance,
    investment_amount,
    allocations,
    overall_reasoning: parsed_result.overall_reasoning,
  });

  if (error) {
    console.error("allocator: db insert failed", error.message);
    return NextResponse.json({ error: "Failed to save allocation" }, { status: 500 });
  }

  return NextResponse.json(result);
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
