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

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
