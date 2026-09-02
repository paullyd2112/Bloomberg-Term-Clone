import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/user";

export async function GET() {
  const user = await requireUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();

  const [activeRes, historyRes, templatesRes] = await Promise.all([
    supabase
      .from("user_challenges")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("user_challenges")
      .select("*")
      .eq("user_id", user.id)
      .neq("status", "active")
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("challenge_templates")
      .select("*")
      .eq("is_active", true)
      .order("firm_name"),
  ]);

  const active = activeRes.data?.[0] ?? null;

  let progress = null;
  let todaySnapshot = null;
  let recentTrades: Record<string, unknown>[] = [];

  if (active) {
    const today = new Date().toISOString().split("T")[0];

    const [snapRes, tradesRes, openRes] = await Promise.all([
      supabase
        .from("challenge_daily_snapshots")
        .select("*")
        .eq("challenge_id", active.id)
        .eq("snapshot_date", today)
        .limit(1),
      supabase
        .from("challenge_trades")
        .select("*")
        .eq("challenge_id", active.id)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("challenge_trades")
        .select("id", { count: "exact" })
        .eq("challenge_id", active.id)
        .eq("status", "open"),
    ]);

    todaySnapshot = snapRes.data?.[0] ?? null;
    recentTrades = tradesRes.data ?? [];
    const openCount = openRes.count ?? 0;

    const acct = Number(active.account_size);
    const profitTarget = acct * Number(active.profit_target_pct ?? 0) / 100;
    const maxDrawdown = acct * Number(active.max_drawdown_pct ?? 0) / 100;
    const profitMade = Number(active.current_balance) - acct;
    const currentDrawdown = Number(active.current_drawdown);
    const startedAt = new Date(active.started_at);
    const daysElapsed = Math.floor(
      (Date.now() - startedAt.getTime()) / (1000 * 60 * 60 * 24),
    );
    const winRate =
      active.wins + active.losses > 0
        ? (active.wins / (active.wins + active.losses)) * 100
        : 0;

    const passed = profitTarget > 0 && profitMade >= profitTarget;
    const minDaysMet = !active.min_trading_days || active.trading_days >= active.min_trading_days;
    const breached = maxDrawdown > 0 && currentDrawdown >= maxDrawdown;
    const timeExpired = active.max_days ? daysElapsed >= active.max_days : false;

    progress = {
      status: passed && minDaysMet ? "passed" : breached || (timeExpired && !passed) ? "failed" : "active",
      profitMade: Math.round(profitMade * 100) / 100,
      profitTarget: Math.round(profitTarget * 100) / 100,
      profitPct: profitTarget > 0 ? Math.round((profitMade / profitTarget) * 1000) / 10 : 0,
      drawdownUsed: Math.round(currentDrawdown * 100) / 100,
      drawdownMax: Math.round(maxDrawdown * 100) / 100,
      drawdownRemainingPct: maxDrawdown > 0 ? Math.round(((maxDrawdown - currentDrawdown) / maxDrawdown) * 1000) / 10 : 100,
      daysElapsed,
      daysRemaining: active.max_days ? Math.max(0, active.max_days - daysElapsed) : null,
      tradingDays: active.trading_days,
      minTradingDays: active.min_trading_days,
      totalTrades: active.total_trades,
      wins: active.wins,
      losses: active.losses,
      winRate: Math.round(winRate * 10) / 10,
      bestDayPnl: Number(active.best_day_pnl),
      worstDayPnl: Number(active.worst_day_pnl),
      todayPnl: todaySnapshot ? Number(todaySnapshot.day_pnl) : 0,
      currentBalance: Number(active.current_balance),
      peakBalance: Number(active.peak_balance),
      openPositions: openCount,
    };
  }

  return NextResponse.json({
    active,
    progress,
    todaySnapshot,
    recentTrades,
    history: historyRes.data ?? [],
    templates: templatesRes.data ?? [],
  });
}

export async function POST(request: Request) {
  const user = await requireUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { action } = body;

  const supabase = await createClient();

  if (action === "start") {
    const existingRes = await supabase
      .from("user_challenges")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1);

    if (existingRes.data?.length) {
      return NextResponse.json(
        { error: "You already have an active challenge. Abandon it first to start a new one." },
        { status: 400 },
      );
    }

    const templateId = body.template_id;
    const customParams = body.custom_params;

    let challengeData: Record<string, unknown>;

    if (templateId) {
      const tmplRes = await supabase
        .from("challenge_templates")
        .select("*")
        .eq("id", templateId)
        .single();
      if (!tmplRes.data) {
        return NextResponse.json({ error: "Template not found" }, { status: 404 });
      }
      const t = tmplRes.data;
      challengeData = {
        user_id: user.id,
        template_id: templateId,
        firm_name: t.firm_name,
        plan_name: t.plan_name,
        asset_class: t.asset_class,
        account_size: t.account_size,
        profit_target_pct: t.profit_target_pct,
        max_drawdown_pct: t.max_drawdown_pct,
        daily_loss_pct: t.daily_loss_pct,
        max_risk_per_trade_pct: t.max_risk_per_trade_pct,
        consistency_rule_pct: t.consistency_rule_pct,
        min_trading_days: t.min_trading_days,
        max_days: t.max_days,
        max_open_positions: t.max_open_positions,
        current_balance: t.account_size,
        peak_balance: t.account_size,
      };
    } else if (customParams) {
      const acct = Number(customParams.account_size);
      if (!acct || acct < 1000) {
        return NextResponse.json({ error: "Account size must be at least $1,000" }, { status: 400 });
      }
      challengeData = {
        user_id: user.id,
        firm_name: customParams.firm_name || "Custom",
        plan_name: customParams.plan_name || "Custom",
        asset_class: customParams.asset_class || "crypto",
        account_size: acct,
        profit_target_pct: Number(customParams.profit_target_pct) || 10,
        max_drawdown_pct: customParams.max_drawdown_pct ? Number(customParams.max_drawdown_pct) : null,
        daily_loss_pct: customParams.daily_loss_pct ? Number(customParams.daily_loss_pct) : null,
        max_risk_per_trade_pct: customParams.max_risk_per_trade_pct ? Number(customParams.max_risk_per_trade_pct) : null,
        consistency_rule_pct: customParams.consistency_rule_pct ? Number(customParams.consistency_rule_pct) : null,
        min_trading_days: customParams.min_trading_days ? Number(customParams.min_trading_days) : null,
        max_days: customParams.max_days ? Number(customParams.max_days) : null,
        max_open_positions: customParams.max_open_positions ? Number(customParams.max_open_positions) : null,
        current_balance: acct,
        peak_balance: acct,
      };
    } else {
      return NextResponse.json({ error: "template_id or custom_params required" }, { status: 400 });
    }

    const insertRes = await supabase.from("user_challenges").insert(challengeData).select().single();
    if (insertRes.error) {
      return NextResponse.json({ error: insertRes.error.message }, { status: 500 });
    }

    return NextResponse.json({ challenge: insertRes.data });
  }

  if (action === "abandon") {
    await supabase
      .from("user_challenges")
      .update({
        status: "abandoned",
        ended_at: new Date().toISOString(),
        ended_reason: "user_abandoned",
      })
      .eq("user_id", user.id)
      .eq("status", "active");
    return NextResponse.json({ status: "abandoned" });
  }

  if (action === "record_trade") {
    const activeRes = await supabase
      .from("user_challenges")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1);

    const challenge = activeRes.data?.[0];
    if (!challenge) {
      return NextResponse.json({ error: "No active challenge" }, { status: 400 });
    }

    const { signal_id, asset_type, identifier, direction, entry_price, size, risk_dollars, stop_loss, take_profit } = body;

    if (!asset_type || !identifier || !direction || !entry_price || !size || risk_dollars == null) {
      return NextResponse.json({ error: "Missing required trade fields" }, { status: 400 });
    }

    const maxRisk = challenge.max_risk_per_trade_pct
      ? Number(challenge.current_balance) * Number(challenge.max_risk_per_trade_pct) / 100
      : null;
    if (maxRisk && Number(risk_dollars) > maxRisk) {
      return NextResponse.json(
        { error: `Risk $${risk_dollars} exceeds per-trade limit of $${maxRisk.toFixed(2)}` },
        { status: 400 },
      );
    }

    if (challenge.max_open_positions) {
      const openRes = await supabase
        .from("challenge_trades")
        .select("id", { count: "exact" })
        .eq("challenge_id", challenge.id)
        .eq("status", "open");
      if ((openRes.count ?? 0) >= challenge.max_open_positions) {
        return NextResponse.json(
          { error: `Max ${challenge.max_open_positions} open positions reached` },
          { status: 400 },
        );
      }
    }

    const tradeRes = await supabase.from("challenge_trades").insert({
      challenge_id: challenge.id,
      signal_id: signal_id || null,
      asset_type,
      identifier,
      direction,
      entry_price: Number(entry_price),
      size: Number(size),
      risk_dollars: Number(risk_dollars),
      stop_loss: stop_loss ? Number(stop_loss) : null,
      take_profit: take_profit ? Number(take_profit) : null,
    }).select().single();

    if (tradeRes.error) {
      return NextResponse.json({ error: tradeRes.error.message }, { status: 500 });
    }

    await supabase
      .from("user_challenges")
      .update({ total_trades: challenge.total_trades + 1 })
      .eq("id", challenge.id);

    return NextResponse.json({ trade: tradeRes.data });
  }

  if (action === "close_trade") {
    const { trade_id, exit_price, close_status } = body;
    if (!trade_id || !exit_price) {
      return NextResponse.json({ error: "trade_id and exit_price required" }, { status: 400 });
    }

    const tradeRes = await supabase
      .from("challenge_trades")
      .select("*, user_challenges!inner(user_id, id, current_balance, peak_balance, total_pnl, current_drawdown, max_drawdown_hit, wins, losses, best_day_pnl, worst_day_pnl, trading_days)")
      .eq("id", trade_id)
      .eq("status", "open")
      .single();

    if (!tradeRes.data) {
      return NextResponse.json({ error: "Trade not found or already closed" }, { status: 404 });
    }

    const trade = tradeRes.data;
    const challenge = trade.user_challenges;

    if (challenge.user_id !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const exitP = Number(exit_price);
    const entryP = Number(trade.entry_price);
    const sz = Number(trade.size);
    const pnl = trade.direction === "BUY" || trade.direction === "YES"
      ? (exitP - entryP) * sz
      : (entryP - exitP) * sz;

    await supabase
      .from("challenge_trades")
      .update({
        exit_price: exitP,
        pnl: Math.round(pnl * 100) / 100,
        status: close_status || "closed",
        closed_at: new Date().toISOString(),
      })
      .eq("id", trade_id);

    const newBalance = Number(challenge.current_balance) + pnl;
    const newPeak = Math.max(Number(challenge.peak_balance), newBalance);
    const newDrawdown = newPeak - newBalance;
    const isWin = pnl > 0;

    await supabase
      .from("user_challenges")
      .update({
        current_balance: Math.round(newBalance * 100) / 100,
        peak_balance: Math.round(newPeak * 100) / 100,
        total_pnl: Math.round((Number(challenge.total_pnl) + pnl) * 100) / 100,
        current_drawdown: Math.round(newDrawdown * 100) / 100,
        max_drawdown_hit: Math.round(Math.max(Number(challenge.max_drawdown_hit), newDrawdown) * 100) / 100,
        wins: isWin ? challenge.wins + 1 : challenge.wins,
        losses: !isWin ? challenge.losses + 1 : challenge.losses,
        best_day_pnl: Math.round(Math.max(Number(challenge.best_day_pnl), pnl) * 100) / 100,
        worst_day_pnl: Math.round(Math.min(Number(challenge.worst_day_pnl), pnl) * 100) / 100,
      })
      .eq("id", challenge.id);

    return NextResponse.json({ pnl: Math.round(pnl * 100) / 100, new_balance: Math.round(newBalance * 100) / 100 });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
