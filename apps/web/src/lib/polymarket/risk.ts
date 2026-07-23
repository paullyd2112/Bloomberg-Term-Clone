/**
 * Client-side risk controls for Polymarket order placement.
 * Enforced before any order is submitted to the CLOB API.
 */

const DAILY_LOSS_KEY = "plebs_daily_loss";
const TRADE_COUNT_KEY = "plebs_trade_count";

export const DEFAULT_LIMITS = {
  maxPositionUsd: 500,
  slippageWarningPct: 2,
  dailyLossWarnUsd: 100,
  dailyLossBlockUsd: 500,
  skipConfirmationAfter: 5,
} as const;

export type RiskCheck = {
  allowed: boolean;
  warnings: string[];
  blocked?: string;
};

export function checkOrderRisk(
  amountUsd: number,
  currentPrice: number,
  estimatedFillPrice: number | null,
  limits = DEFAULT_LIMITS,
): RiskCheck {
  const warnings: string[] = [];

  if (amountUsd > limits.maxPositionUsd) {
    return {
      allowed: false,
      warnings,
      blocked: `Order size $${amountUsd.toFixed(0)} exceeds max position $${limits.maxPositionUsd}`,
    };
  }

  if (estimatedFillPrice !== null && currentPrice > 0) {
    const slippagePct = Math.abs(estimatedFillPrice - currentPrice) / currentPrice * 100;
    if (slippagePct > limits.slippageWarningPct) {
      warnings.push(
        `Estimated slippage ${slippagePct.toFixed(1)}% exceeds ${limits.slippageWarningPct}% threshold`,
      );
    }
  }

  const dailyLoss = getDailyLoss();
  if (dailyLoss + amountUsd > limits.dailyLossBlockUsd) {
    return {
      allowed: false,
      warnings,
      blocked: `Daily loss limit reached ($${dailyLoss.toFixed(0)} + $${amountUsd.toFixed(0)} > $${limits.dailyLossBlockUsd})`,
    };
  }
  if (dailyLoss > limits.dailyLossWarnUsd) {
    warnings.push(`Daily loss at $${dailyLoss.toFixed(0)} — approaching $${limits.dailyLossBlockUsd} limit`);
  }

  return { allowed: true, warnings };
}

export function getDailyLoss(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = sessionStorage.getItem(DAILY_LOSS_KEY);
    if (!raw) return 0;
    const { amount, date } = JSON.parse(raw);
    if (date !== new Date().toISOString().slice(0, 10)) return 0;
    return Number(amount) || 0;
  } catch {
    return 0;
  }
}

export function recordLoss(amount: number): void {
  if (typeof window === "undefined") return;
  const current = getDailyLoss();
  sessionStorage.setItem(DAILY_LOSS_KEY, JSON.stringify({
    amount: current + amount,
    date: new Date().toISOString().slice(0, 10),
  }));
}

export function getTradeCount(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = sessionStorage.getItem(TRADE_COUNT_KEY);
    return raw ? Number(raw) : 0;
  } catch {
    return 0;
  }
}

export function incrementTradeCount(): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(TRADE_COUNT_KEY, String(getTradeCount() + 1));
}

export function shouldSkipConfirmation(): boolean {
  return getTradeCount() >= DEFAULT_LIMITS.skipConfirmationAfter;
}
