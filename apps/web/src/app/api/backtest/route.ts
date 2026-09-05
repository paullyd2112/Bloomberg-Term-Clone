import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/user";

const BacktestBody = z.object({
  asset_type:     z.enum(["all", "stock", "crypto", "prediction"]),
  direction:      z.enum(["all", "BUY", "SELL", "YES", "NO"]),
  horizon:        z.enum(["all", "intraday", "swing", "longterm"]),
  min_confidence: z.number().int().min(0).max(100),
  start_date:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  trade_size:     z.number().positive().max(1_000_000),
});

export const dynamic = "force-dynamic";

export type BacktestParams = {
  asset_type: "all" | "stock" | "crypto" | "prediction";
  direction:  "all" | "BUY" | "SELL" | "YES" | "NO";
  horizon:    "all" | "intraday" | "swing" | "longterm";
  min_confidence: number;
  start_date: string;
  end_date:   string;
  trade_size: number;
};

export type EquityPoint = { date: string; pnl: number };

export type BreakdownEntry = {
  trades: number;
  wins: number;
  losses: number;
  win_rate: number;
  total_pnl: number;
};

export type TradeEntry = {
  identifier: string;
  asset_type: string;
  direction:  string;
  confidence: number;
  pnl:        number;
  outcome:    string;
  date:       string;
};

export type BacktestResults = {
  total_trades:    number;
  wins:            number;
  losses:          number;
  neutrals:        number;
  win_rate:        number;
  total_pnl:       number;
  avg_pnl_per_trade: number;
  best_trade:      number;
  worst_trade:     number;
  max_drawdown:    number;
  avg_confidence:  number;
  equity_curve:    EquityPoint[];
  by_asset:        Record<string, BreakdownEntry>;
  by_direction:    Record<string, BreakdownEntry>;
  trades:          TradeEntry[];
};

type RawSignal = {
  id:              number;
  identifier:      string;
  asset_type:      string;
  direction:       string;
  confidence:      number;
  time_horizon:    string | null;
  price_at_signal: number | null;
  outcome_price:   number | null;
  outcome:         "WIN" | "LOSS" | "NEUTRAL";
  created_at:      string;
};

function tradePnl(sig: RawSignal, tradeSize: number): number | null {
  if (sig.price_at_signal && sig.outcome_price && sig.price_at_signal > 0) {
    const isBull = sig.direction === "BUY";
    const pct = isBull
      ? (sig.outcome_price - sig.price_at_signal) / sig.price_at_signal
      : (sig.price_at_signal - sig.outcome_price) / sig.price_at_signal;
    return pct * tradeSize;
  }
  // No entry price — skip from return calculations
  return null;
}

function computeResults(signals: RawSignal[], tradeSize: number): BacktestResults {
  const empty: BacktestResults = {
    total_trades: 0, wins: 0, losses: 0, neutrals: 0,
    win_rate: 0, total_pnl: 0, avg_pnl_per_trade: 0,
    best_trade: 0, worst_trade: 0, max_drawdown: 0,
    avg_confidence: 0, equity_curve: [],
    by_asset: {}, by_direction: {}, trades: [],
  };
  if (signals.length === 0) return empty;

  const sorted = [...signals].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  const pricedSignals = sorted.filter(
    (s) => s.price_at_signal && s.outcome_price && s.price_at_signal > 0,
  );

  let wins = 0, losses = 0, neutrals = 0;
  let cumPnl = 0, peak = 0, maxDrawdown = 0;
  let bestTrade = -Infinity, worstTrade = Infinity;
  const equityCurve: EquityPoint[] = [];
  let confSum = 0;
  const trades: TradeEntry[] = [];

  const byAsset: Record<string, { trades: number; wins: number; losses: number; pnl: number }> = {};
  const byDirection: Record<string, { trades: number; wins: number; losses: number; pnl: number }> = {};

  for (const sig of pricedSignals) {
    const pnl = tradePnl(sig, tradeSize) ?? 0;
    if (sig.outcome === "WIN")       wins++;
    else if (sig.outcome === "LOSS") losses++;
    else                             neutrals++;

    cumPnl += pnl;
    if (cumPnl > peak) peak = cumPnl;
    const drawdown = peak > 0 ? ((peak - cumPnl) / peak) * 100 : 0;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;

    if (pnl > bestTrade)  bestTrade  = pnl;
    if (pnl < worstTrade) worstTrade = pnl;
    confSum += sig.confidence ?? 0;

    equityCurve.push({ date: sig.created_at.slice(0, 10), pnl: Math.round(cumPnl * 100) / 100 });

    trades.push({
      identifier: sig.identifier,
      asset_type: sig.asset_type,
      direction:  sig.direction,
      confidence: sig.confidence,
      pnl:        Math.round(pnl * 100) / 100,
      outcome:    sig.outcome,
      date:       sig.created_at.slice(0, 10),
    });

    const at = byAsset[sig.asset_type] ??= { trades: 0, wins: 0, losses: 0, pnl: 0 };
    at.trades++;
    if (sig.outcome === "WIN") at.wins++;
    else if (sig.outcome === "LOSS") at.losses++;
    at.pnl += pnl;

    const dt = byDirection[sig.direction] ??= { trades: 0, wins: 0, losses: 0, pnl: 0 };
    dt.trades++;
    if (sig.outcome === "WIN") dt.wins++;
    else if (sig.outcome === "LOSS") dt.losses++;
    dt.pnl += pnl;
  }

  const totalPriced = pricedSignals.length;

  const toBreakdown = (b: Record<string, { trades: number; wins: number; losses: number; pnl: number }>): Record<string, BreakdownEntry> => {
    const out: Record<string, BreakdownEntry> = {};
    for (const [k, v] of Object.entries(b)) {
      const decided = v.wins + v.losses;
      out[k] = {
        trades: v.trades,
        wins: v.wins,
        losses: v.losses,
        win_rate: decided > 0 ? Math.round((v.wins / decided) * 1000) / 10 : 0,
        total_pnl: Math.round(v.pnl * 100) / 100,
      };
    }
    return out;
  };

  return {
    total_trades:      totalPriced,
    wins,
    losses,
    neutrals,
    win_rate:          totalPriced > 0 ? Math.round((wins / totalPriced) * 1000) / 10 : 0,
    total_pnl:         Math.round(cumPnl * 100) / 100,
    avg_pnl_per_trade: totalPriced > 0 ? Math.round((cumPnl / totalPriced) * 100) / 100 : 0,
    best_trade:        bestTrade === -Infinity ? 0 : Math.round(bestTrade * 100) / 100,
    worst_trade:       worstTrade === Infinity ? 0 : Math.round(worstTrade * 100) / 100,
    max_drawdown:      Math.round(maxDrawdown * 10) / 10,
    avg_confidence:    totalPriced > 0 ? Math.round((confSum / totalPriced) * 10) / 10 : 0,
    equity_curve:      equityCurve,
    by_asset:          toBreakdown(byAsset),
    by_direction:      toBreakdown(byDirection),
    trades,
  };
}

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = BacktestBody.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  }
  const params: BacktestParams = parsed.data;

  const supabase = createClient();
  let query = supabase
    .from("signals")
    .select("id, identifier, asset_type, direction, confidence, time_horizon, price_at_signal, outcome_price, outcome, created_at")
    .neq("outcome", "PENDING")
    .eq("is_backtest", false)
    .gte("created_at", params.start_date)
    .lte("created_at", params.end_date + "T23:59:59Z")
    .gte("confidence", params.min_confidence);

  if (params.asset_type !== "all") query = query.eq("asset_type", params.asset_type) as typeof query;
  if (params.direction  !== "all") query = query.eq("direction",  params.direction)  as typeof query;
  if (params.horizon    !== "all") query = query.eq("time_horizon", params.horizon)  as typeof query;

  const { data: signals, error } = await query.order("created_at").limit(2000);
  if (error) return NextResponse.json({ error: "Internal server error" }, { status: 500 });

  const results = computeResults((signals ?? []) as RawSignal[], params.trade_size);

  const { data: run } = await supabase
    .from("backtest_runs")
    .insert({ user_id: user.id, parameters: params, results })
    .select("id")
    .single();

  return NextResponse.json({ id: run?.id, params, results });
}

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createClient();
  const { data } = await supabase
    .from("backtest_runs")
    .select("id, parameters, results, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  return NextResponse.json(data ?? []);
}
