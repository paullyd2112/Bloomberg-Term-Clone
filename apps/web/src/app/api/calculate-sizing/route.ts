import { NextRequest, NextResponse } from "next/server";

const PROP_RISK_MATRIX: Record<string, ProfileConfig> = {
  retail_standard: {
    label: "Retail Standard",
    account_size: 10_000,
    max_overall_drawdown: 1_000,
    max_daily_loss: 500,
    risk_per_trade_dollar: 25,
    daily_kill_switch_threshold: 400,
  },
  "25k_prop_conservative": {
    label: "25K Prop Conservative",
    account_size: 25_000,
    max_overall_drawdown: 1_000,
    max_daily_loss: 500,
    risk_per_trade_dollar: 75,
    daily_kill_switch_threshold: 375,
  },
  "50k_prop_moderate": {
    label: "50K Prop Moderate",
    account_size: 50_000,
    max_overall_drawdown: 2_000,
    max_daily_loss: 1_000,
    risk_per_trade_dollar: 125,
    daily_kill_switch_threshold: 750,
  },
  "150k_prop_boss": {
    label: "150K Prop Boss",
    account_size: 150_000,
    max_overall_drawdown: 4_500,
    max_daily_loss: 2_700,
    risk_per_trade_dollar: 225,
    daily_kill_switch_threshold: 2_025,
  },
};

type ProfileConfig = {
  label: string;
  account_size: number;
  max_overall_drawdown: number;
  max_daily_loss: number;
  risk_per_trade_dollar: number;
  daily_kill_switch_threshold: number;
};

type SimResult = {
  survived: boolean;
  final_balance: number;
  max_drawdown_dollar: number;
  breach_reason: string;
};

const WIN_PROB: Record<string, number> = {
  crypto: 1 / 3,
};

const ASSET_CONFIG = {
  crypto: { win_multiplier: 2.0, loss_multiplier: 1.0 },
};

const NUM_SIGNALS = 500;
const TRADES_PER_DAY = 3;
const NUM_RUNS = 200;

function simulateRun(profile: ProfileConfig): SimResult {
  const accountSize = profile.account_size;
  let balance = accountSize;
  let maxDD = 0;
  let dailyPnl = 0;
  let tradesToday = 0;
  let survived = true;
  let breachReason = "";

  for (let i = 0; i < NUM_SIGNALS; i++) {
    if (tradesToday >= TRADES_PER_DAY) {
      tradesToday = 0;
      dailyPnl = 0;
    }

    if (dailyPnl <= -profile.daily_kill_switch_threshold) {
      survived = false;
      breachReason = "daily_kill_switch";
      break;
    }
    if (dailyPnl <= -profile.max_daily_loss) {
      survived = false;
      breachReason = "max_daily_loss";
      break;
    }

    const wp = WIN_PROB.crypto;
    const cfg = ASSET_CONFIG.crypto;
    const pnl = Math.random() < wp
      ? profile.risk_per_trade_dollar * cfg.win_multiplier
      : -profile.risk_per_trade_dollar * cfg.loss_multiplier;

    balance += pnl;
    dailyPnl += pnl;
    tradesToday++;

    const currentDD = accountSize - balance;
    if (currentDD > maxDD) maxDD = currentDD;

    if (currentDD >= profile.max_overall_drawdown) {
      survived = false;
      breachReason = "max_overall_drawdown";
      break;
    }
  }

  return {
    survived,
    final_balance: balance,
    max_drawdown_dollar: maxDD,
    breach_reason: breachReason,
  };
}

function runMonteCarlo(profile: ProfileConfig) {
  const results: SimResult[] = [];
  for (let i = 0; i < NUM_RUNS; i++) {
    results.push(simulateRun(profile));
  }

  const survived = results.filter((r) => r.survived);
  const survivalRate = survived.length / results.length;
  const avgFinal = results.reduce((s, r) => s + r.final_balance, 0) / results.length;
  const avgMaxDD = results.reduce((s, r) => s + r.max_drawdown_dollar, 0) / results.length;
  const worstDD = Math.max(...results.map((r) => r.max_drawdown_dollar));

  const breachCounts: Record<string, number> = {};
  for (const r of results) {
    if (!r.survived) {
      breachCounts[r.breach_reason] = (breachCounts[r.breach_reason] ?? 0) + 1;
    }
  }

  return {
    survival_rate: survivalRate,
    avg_final_balance: avgFinal,
    avg_max_drawdown: avgMaxDD,
    worst_drawdown: worstDD,
    num_runs: NUM_RUNS,
    breach_breakdown: breachCounts,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { account_size, risk_profile } = body;

    if (!account_size || account_size < 5000 || account_size > 500000) {
      return NextResponse.json(
        { error: "account_size must be between $5,000 and $500,000" },
        { status: 400 },
      );
    }

    let profileKey = risk_profile ?? "50k_prop_moderate";
    if (!PROP_RISK_MATRIX[profileKey]) {
      profileKey = "50k_prop_moderate";
    }

    const baseProfile = PROP_RISK_MATRIX[profileKey];
    const scale = account_size / baseProfile.account_size;

    const scaledProfile: ProfileConfig = {
      label: baseProfile.label,
      account_size,
      max_overall_drawdown: Math.round(baseProfile.max_overall_drawdown * scale),
      max_daily_loss: Math.round(baseProfile.max_daily_loss * scale),
      risk_per_trade_dollar: Math.round(baseProfile.risk_per_trade_dollar * scale * 100) / 100,
      daily_kill_switch_threshold: Math.round(baseProfile.daily_kill_switch_threshold * scale),
    };

    const simulation = runMonteCarlo(scaledProfile);

    const signalsPerDay = TRADES_PER_DAY;
    const avgDaysToTarget = simulation.survival_rate > 0
      ? Math.round(NUM_SIGNALS / signalsPerDay / simulation.survival_rate)
      : null;

    return NextResponse.json({
      profile: {
        id: profileKey,
        label: baseProfile.label,
        account_size: scaledProfile.account_size,
        max_overall_drawdown: scaledProfile.max_overall_drawdown,
        max_overall_drawdown_pct: (scaledProfile.max_overall_drawdown / scaledProfile.account_size * 100).toFixed(1),
        max_daily_loss: scaledProfile.max_daily_loss,
        risk_per_trade: scaledProfile.risk_per_trade_dollar,
        daily_kill_switch: scaledProfile.daily_kill_switch_threshold,
      },
      sizing: {
        risk_per_trade: scaledProfile.risk_per_trade_dollar,
        max_position_risk_pct: (scaledProfile.risk_per_trade_dollar / scaledProfile.account_size * 100).toFixed(2),
        max_concurrent_positions: 2,
        max_signals_per_day: 3,
        stop_method: "1.5x ATR_14 (clamped 1-5%)",
      },
      simulation,
      estimated_days_to_pass: avgDaysToTarget,
      available_profiles: Object.entries(PROP_RISK_MATRIX).map(([id, p]) => ({
        id,
        label: p.label,
        account_size: p.account_size,
      })),
    });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
