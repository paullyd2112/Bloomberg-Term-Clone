"use client";

import { useState, useEffect, useCallback } from "react";
import { Trophy, Plus, X } from "lucide-react";
import { clsx } from "clsx";
import ChallengeProgress from "@/components/prop/ChallengeProgress";
import RulesPanel from "@/components/prop/RulesPanel";
import RiskGauge from "@/components/prop/RiskGauge";

type Template = {
  id: number;
  slug: string;
  firm_name: string;
  plan_name: string;
  asset_class: string;
  account_size: number;
  profit_target_pct: number | null;
  max_drawdown_pct: number | null;
  daily_loss_pct: number | null;
  max_risk_per_trade_pct: number | null;
  consistency_rule_pct: number | null;
  min_trading_days: number | null;
  max_days: number | null;
  max_open_positions: number | null;
  leverage: number | null;
  profit_split_pct: number | null;
  challenge_fee: number | null;
  notes: string | null;
};

type Challenge = {
  id: number;
  firm_name: string;
  plan_name: string;
  asset_class: string;
  account_size: number;
  profit_target_pct: number | null;
  max_drawdown_pct: number | null;
  daily_loss_pct: number | null;
  consistency_rule_pct: number | null;
  min_trading_days: number | null;
  max_days: number | null;
  max_open_positions: number | null;
  status: string;
  current_balance: number;
  total_pnl: number;
  trading_days: number;
  total_trades: number;
  wins: number;
  losses: number;
  started_at: string;
  ended_at: string | null;
  ended_reason: string | null;
};

type Progress = {
  status: string;
  profitMade: number;
  profitTarget: number;
  profitPct: number;
  drawdownUsed: number;
  drawdownMax: number;
  drawdownRemainingPct: number;
  daysElapsed: number;
  daysRemaining: number | null;
  tradingDays: number;
  minTradingDays: number | null;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  bestDayPnl: number;
  worstDayPnl: number;
  todayPnl: number;
  currentBalance: number;
  peakBalance: number;
  openPositions: number;
};

type Trade = {
  id: number;
  identifier: string;
  asset_type: string;
  direction: string;
  entry_price: number;
  exit_price: number | null;
  pnl: number | null;
  status: string;
  created_at: string;
};

type AssetFilter = "all" | "crypto" | "prediction" | "both";

function TradeRow({ trade: t, onClose }: { trade: Trade; onClose: () => void }) {
  const [closing, setClosing] = useState(false);
  const [exitPrice, setExitPrice] = useState("");
  const [showClose, setShowClose] = useState(false);

  async function closeTrade() {
    if (!exitPrice) return;
    setClosing(true);
    try {
      const res = await fetch("/api/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "close_trade", trade_id: t.id, exit_price: Number(exitPrice) }),
      });
      if (res.ok) {
        onClose();
        setShowClose(false);
      }
    } finally {
      setClosing(false);
    }
  }

  return (
    <div className="px-5 py-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={clsx(
            "text-[10px] font-bold font-mono px-1.5 py-0.5 rounded",
            t.direction === "BUY" || t.direction === "YES"
              ? "text-[#00d4aa] bg-[#00d4aa]/10"
              : "text-red-400 bg-red-500/10",
          )}>
            {t.direction}
          </span>
          <span className="text-xs text-white font-mono">{t.identifier}</span>
          <span className="text-[10px] text-zinc-600 font-mono">${Number(t.entry_price).toFixed(2)}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className={clsx(
            "text-xs font-mono tabular-nums font-semibold",
            t.status === "open" ? "text-zinc-400" :
            (t.pnl ?? 0) >= 0 ? "text-[#00d4aa]" : "text-red-400",
          )}>
            {t.status === "open" ? "OPEN" : `${(t.pnl ?? 0) >= 0 ? "+" : ""}$${(t.pnl ?? 0).toFixed(2)}`}
          </span>
          {t.status === "open" && (
            <button
              onClick={() => setShowClose(!showClose)}
              className="text-[10px] font-semibold text-amber-400 hover:text-amber-300 transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>
      {showClose && (
        <div className="flex items-center gap-2 pl-8">
          <input
            type="number"
            step="any"
            placeholder="Exit price"
            value={exitPrice}
            onChange={(e) => setExitPrice(e.target.value)}
            className="w-28 px-2 py-1 text-xs font-mono bg-white/[0.04] border border-white/[0.1] rounded text-white focus:outline-none focus:border-[#00d4aa]/50"
          />
          <button
            onClick={closeTrade}
            disabled={closing || !exitPrice}
            className="px-3 py-1 text-[10px] font-bold bg-[#00d4aa] text-black rounded hover:bg-[#00d4aa]/90 disabled:opacity-50 transition-all"
          >
            {closing ? "..." : "Confirm"}
          </button>
        </div>
      )}
    </div>
  );
}

export default function ChallengePage() {
  const [active, setActive] = useState<Challenge | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [recentTrades, setRecentTrades] = useState<Trade[]>([]);
  const [history, setHistory] = useState<Challenge[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [assetFilter, setAssetFilter] = useState<AssetFilter>("all");
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/challenges");
      if (!res.ok) return;
      const data = await res.json();
      setActive(data.active);
      setProgress(data.progress);
      setRecentTrades(data.recentTrades ?? []);
      setHistory(data.history ?? []);
      setTemplates(data.templates ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function startChallenge(templateId?: number, customParams?: Record<string, unknown>) {
    setStarting(true);
    setError("");
    try {
      const res = await fetch("/api/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start",
          template_id: templateId,
          custom_params: customParams,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to start challenge");
        return;
      }
      setShowPicker(false);
      setShowCustom(false);
      await fetchData();
    } catch {
      setError("Something went wrong");
    } finally {
      setStarting(false);
    }
  }

  async function abandonChallenge() {
    if (!confirm("Are you sure you want to abandon this challenge? This cannot be undone.")) return;
    try {
      await fetch("/api/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "abandon" }),
      });
      await fetchData();
    } catch {
      /* ignore */
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="h-6 w-6 border-2 border-[#00d4aa]/30 border-t-[#00d4aa] rounded-full animate-spin" />
      </div>
    );
  }

  const firms = Array.from(new Set(templates.map((t) => t.firm_name)));
  const filteredTemplates = templates.filter(
    (t) => assetFilter === "all" || t.asset_class === assetFilter,
  );
  const groupedByFirm = firms
    .map((f) => ({ firm: f, plans: filteredTemplates.filter((t) => t.firm_name === f) }))
    .filter((g) => g.plans.length > 0);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 md:py-8">
      {/* Header */}
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#00d4aa]/30 bg-[#00d4aa]/10 text-[#00d4aa]">
            <Trophy className="h-4 w-4" />
          </span>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-white">
              Funded Challenge
            </h1>
            <p className="text-[11px] text-zinc-500 font-mono">
              Track your prop firm challenge progress
            </p>
          </div>
        </div>
        {!active && (
          <button
            onClick={() => setShowPicker(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-[#00d4aa] hover:bg-[#00d4aa]/90 text-black transition-all"
          >
            <Plus className="h-3.5 w-3.5" />
            Start Challenge
          </button>
        )}
      </header>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl border border-red-500/20 bg-red-500/5 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Active challenge dashboard */}
      {active && progress && (
        <div className="space-y-5">
          {/* Status header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div>
                <h2 className="text-white font-semibold">{active.firm_name}</h2>
                <p className="text-xs text-zinc-500 font-mono">{active.plan_name} &middot; ${Number(active.account_size).toLocaleString()}</p>
              </div>
              <span className={clsx(
                "px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border",
                active.asset_class === "crypto" && "text-amber-400 bg-amber-500/10 border-amber-500/20",
                active.asset_class === "prediction" && "text-blue-400 bg-blue-500/10 border-blue-500/20",
                active.asset_class === "both" && "text-purple-400 bg-purple-500/10 border-purple-500/20",
              )}>
                {active.asset_class}
              </span>
            </div>
            <button
              onClick={abandonChallenge}
              className="text-[10px] text-zinc-600 hover:text-red-400 transition-colors uppercase tracking-wider font-mono"
            >
              Abandon
            </button>
          </div>

          {/* Gauges */}
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <RiskGauge
                label="Profit"
                value={Math.round(progress.profitPct)}
                max={100}
                unit=""
                inverse
              />
              <RiskGauge
                label="DD Used"
                value={Math.round(100 - progress.drawdownRemainingPct)}
                max={100}
              />
              <RiskGauge
                label="Win Rate"
                value={Math.round(progress.winRate)}
                max={100}
                unit=""
                inverse
              />
              <RiskGauge
                label="Trades"
                value={progress.totalTrades}
                max={Math.max(progress.totalTrades, 50)}
                unit=""
                inverse
              />
            </div>
          </div>

          {/* Progress + Rules */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <ChallengeProgress
              accountSize={Number(active.account_size)}
              currentBalance={progress.currentBalance}
              profitTarget={progress.profitTarget}
              maxDrawdown={progress.drawdownMax}
              daysElapsed={progress.daysElapsed}
              maxDays={active.max_days ?? 0}
              worstDrawdown={progress.drawdownUsed}
            />
            <RulesPanel
              profileLabel={`${active.firm_name} ${active.plan_name}`}
              rules={[
                {
                  label: "Max Drawdown",
                  status: progress.drawdownRemainingPct < 20 ? "breach" : progress.drawdownRemainingPct < 50 ? "warning" : "ok",
                  current: `$${Math.round(progress.drawdownUsed).toLocaleString()}`,
                  limit: `$${Math.round(progress.drawdownMax).toLocaleString()}`,
                },
                ...(active.daily_loss_pct ? [{
                  label: "Daily Loss Limit",
                  status: (progress.todayPnl < 0 && Math.abs(progress.todayPnl) > Number(active.account_size) * Number(active.daily_loss_pct) / 100 * 0.8 ? "warning" : "ok") as "ok" | "warning" | "breach",
                  current: `$${Math.abs(Math.min(progress.todayPnl, 0)).toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
                  limit: `$${Math.round(Number(active.account_size) * Number(active.daily_loss_pct) / 100).toLocaleString()}`,
                }] : []),
                ...(active.consistency_rule_pct ? [{
                  label: "Consistency Rule",
                  status: (progress.bestDayPnl > 0 && progress.profitMade > 0 && progress.bestDayPnl / progress.profitMade * 100 > Number(active.consistency_rule_pct) ? "breach" : "ok") as "ok" | "warning" | "breach",
                  current: progress.profitMade > 0 ? `${Math.round(progress.bestDayPnl / progress.profitMade * 100)}%` : "0%",
                  limit: `${active.consistency_rule_pct}%`,
                }] : []),
                ...(active.max_open_positions ? [{
                  label: "Open Positions",
                  status: (progress.openPositions >= Number(active.max_open_positions) ? "breach" : "ok") as "ok" | "warning" | "breach",
                  current: `${progress.openPositions}`,
                  limit: `${active.max_open_positions}`,
                }] : []),
                ...(active.min_trading_days ? [{
                  label: "Min Trading Days",
                  status: (progress.tradingDays >= Number(active.min_trading_days) ? "ok" : "warning") as "ok" | "warning" | "breach",
                  current: `${progress.tradingDays}`,
                  limit: `${active.min_trading_days}`,
                }] : []),
              ]}
            />
          </div>

          {/* Today's stats */}
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-[#4f8cff] text-[10px] leading-none">&#9679;</span>
              <h3 className="text-[11px] font-mono font-semibold uppercase tracking-[0.15em] text-zinc-500">
                Performance
              </h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatTile
                label="Today P&L"
                value={`${progress.todayPnl >= 0 ? "+" : ""}$${progress.todayPnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                color={progress.todayPnl >= 0 ? "green" : "red"}
              />
              <StatTile
                label="Total P&L"
                value={`${progress.profitMade >= 0 ? "+" : ""}$${progress.profitMade.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                color={progress.profitMade >= 0 ? "green" : "red"}
              />
              <StatTile
                label="Best Day"
                value={`+$${progress.bestDayPnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                color="green"
              />
              <StatTile
                label="Worst Day"
                value={`-$${Math.abs(progress.worstDayPnl).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                color="red"
              />
            </div>
          </div>

          {/* Recent trades */}
          {recentTrades.length > 0 && (
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-white/[0.06]">
                <h3 className="text-[11px] font-mono font-semibold uppercase tracking-[0.15em] text-zinc-500">
                  Recent Trades
                </h3>
              </div>
              <div className="divide-y divide-white/[0.04]">
                {recentTrades.slice(0, 10).map((t) => (
                  <TradeRow key={t.id} trade={t} onClose={fetchData} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty state — no active challenge */}
      {!active && !showPicker && (
        <div className="space-y-8">
          <div className="text-center py-16 flex flex-col items-center gap-4">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl border border-[#00d4aa]/20 bg-[#00d4aa]/5 text-[#00d4aa]">
              <Trophy className="h-7 w-7" />
            </div>
            <div>
              <p className="text-sm text-zinc-300 font-medium mb-1">
                No active challenge
              </p>
              <p className="text-xs text-zinc-600 max-w-sm mx-auto leading-relaxed">
                Pick a prop firm challenge and Plebs will calibrate signals, position sizing,
                and risk management to those exact rules. Track your progress live.
              </p>
            </div>
            <button
              onClick={() => setShowPicker(true)}
              className="mt-2 px-6 py-3 rounded-xl text-sm font-bold bg-[#00d4aa] hover:bg-[#00d4aa]/90 text-black transition-all"
            >
              Start a Challenge
            </button>
          </div>

          {/* Past challenges */}
          {history.length > 0 && (
            <div>
              <h3 className="text-[11px] font-mono font-semibold uppercase tracking-[0.15em] text-zinc-500 mb-3">
                Past Challenges
              </h3>
              <div className="space-y-2">
                {history.map((ch) => (
                  <div
                    key={ch.id}
                    className="flex items-center justify-between px-4 py-3 bg-white/[0.02] border border-white/[0.06] rounded-xl"
                  >
                    <div className="flex items-center gap-3">
                      <span className={clsx(
                        "h-2 w-2 rounded-full",
                        ch.status === "passed" && "bg-[#00d4aa]",
                        ch.status === "failed" && "bg-red-400",
                        ch.status === "abandoned" && "bg-zinc-500",
                      )} />
                      <div>
                        <span className="text-sm text-white">{ch.firm_name} {ch.plan_name}</span>
                        <p className="text-[10px] text-zinc-600 font-mono">
                          ${Number(ch.account_size).toLocaleString()} &middot; {ch.total_trades} trades &middot; {ch.status}
                        </p>
                      </div>
                    </div>
                    <span className={clsx(
                      "text-xs font-mono font-semibold tabular-nums",
                      Number(ch.total_pnl) >= 0 ? "text-[#00d4aa]" : "text-red-400",
                    )}>
                      {Number(ch.total_pnl) >= 0 ? "+" : ""}${Number(ch.total_pnl).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Challenge picker modal */}
      {showPicker && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-white font-semibold">Choose a Challenge</h2>
            <button
              onClick={() => { setShowPicker(false); setShowCustom(false); }}
              className="text-zinc-500 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Asset class filter */}
          <div className="flex items-center gap-2">
            {(["all", "crypto", "prediction", "both"] as AssetFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setAssetFilter(f)}
                className={clsx(
                  "px-3 py-1.5 rounded-full text-xs font-semibold border transition-all",
                  assetFilter === f
                    ? "border-[#00d4aa]/40 bg-[#00d4aa]/10 text-white"
                    : "border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:text-white hover:border-white/[0.15]",
                )}
              >
                {f === "all" ? "All" : f === "crypto" ? "Crypto" : f === "prediction" ? "Predictions" : "Both"}
              </button>
            ))}
            <button
              onClick={() => setShowCustom(!showCustom)}
              className={clsx(
                "ml-auto px-3 py-1.5 rounded-full text-xs font-semibold border transition-all",
                showCustom
                  ? "border-purple-500/40 bg-purple-500/10 text-purple-300"
                  : "border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:text-white",
              )}
            >
              Custom
            </button>
          </div>

          {/* Custom challenge form */}
          {showCustom && <CustomChallengeForm onStart={startChallenge} starting={starting} />}

          {/* Firm templates */}
          {!showCustom && (
            <div className="space-y-4">
              {groupedByFirm.map(({ firm, plans }) => (
                <div key={firm} className="bg-white/[0.02] border border-white/[0.06] rounded-xl overflow-hidden">
                  <div className="px-5 py-3 border-b border-white/[0.06]">
                    <h3 className="text-sm font-semibold text-white">{firm}</h3>
                  </div>
                  <div className="divide-y divide-white/[0.04]">
                    {plans.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center justify-between px-5 py-3 hover:bg-white/[0.02] transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-white font-medium">{t.plan_name}</span>
                            <span className={clsx(
                              "text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider",
                              t.asset_class === "crypto" && "text-amber-400 bg-amber-500/10",
                              t.asset_class === "prediction" && "text-blue-400 bg-blue-500/10",
                              t.asset_class === "both" && "text-purple-400 bg-purple-500/10",
                            )}>
                              {t.asset_class}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-[10px] text-zinc-500 font-mono">
                            <span>Target: {t.profit_target_pct ?? "—"}%</span>
                            <span>DD: {t.max_drawdown_pct ?? "—"}%</span>
                            <span>Daily: {t.daily_loss_pct ?? "—"}%</span>
                            {t.consistency_rule_pct && <span>Consistency: {t.consistency_rule_pct}%</span>}
                            {t.profit_split_pct && <span>Split: {t.profit_split_pct}%</span>}
                          </div>
                          {t.notes && <p className="text-[10px] text-zinc-600 mt-0.5">{t.notes}</p>}
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                          {t.challenge_fee && (
                            <span className="text-[10px] text-zinc-500 font-mono">${t.challenge_fee}</span>
                          )}
                          <button
                            onClick={() => startChallenge(t.id)}
                            disabled={starting}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#00d4aa]/10 text-[#00d4aa] border border-[#00d4aa]/20 hover:bg-[#00d4aa]/20 transition-all disabled:opacity-40"
                          >
                            Start
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CustomChallengeForm({
  onStart,
  starting,
}: {
  onStart: (templateId?: number, customParams?: Record<string, unknown>) => void;
  starting: boolean;
}) {
  const [params, setParams] = useState({
    firm_name: "",
    plan_name: "",
    asset_class: "crypto",
    account_size: 25000,
    profit_target_pct: 10,
    max_drawdown_pct: 10,
    daily_loss_pct: 5,
    max_risk_per_trade_pct: "",
    consistency_rule_pct: "",
    min_trading_days: "",
    max_days: "",
    max_open_positions: "",
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleaned: Record<string, unknown> = {
      firm_name: params.firm_name || "Custom",
      plan_name: params.plan_name || "Custom",
      asset_class: params.asset_class,
      account_size: params.account_size,
      profit_target_pct: params.profit_target_pct,
      max_drawdown_pct: params.max_drawdown_pct || null,
      daily_loss_pct: params.daily_loss_pct || null,
    };
    if (params.max_risk_per_trade_pct) cleaned.max_risk_per_trade_pct = Number(params.max_risk_per_trade_pct);
    if (params.consistency_rule_pct) cleaned.consistency_rule_pct = Number(params.consistency_rule_pct);
    if (params.min_trading_days) cleaned.min_trading_days = Number(params.min_trading_days);
    if (params.max_days) cleaned.max_days = Number(params.max_days);
    if (params.max_open_positions) cleaned.max_open_positions = Number(params.max_open_positions);
    onStart(undefined, cleaned);
  }

  const inputCls = "w-full bg-white/[0.04] border border-white/[0.1] rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-[#00d4aa]/50 transition-colors";

  return (
    <form onSubmit={handleSubmit} className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-5 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono mb-1 block">Firm Name</label>
          <input className={inputCls} placeholder="e.g. MyFirm" value={params.firm_name} onChange={(e) => setParams({ ...params, firm_name: e.target.value })} />
        </div>
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono mb-1 block">Plan Name</label>
          <input className={inputCls} placeholder="e.g. Phase 1" value={params.plan_name} onChange={(e) => setParams({ ...params, plan_name: e.target.value })} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono mb-1 block">Asset Class</label>
          <select className={inputCls} value={params.asset_class} onChange={(e) => setParams({ ...params, asset_class: e.target.value })}>
            <option value="crypto">Crypto</option>
            <option value="prediction">Predictions</option>
            <option value="both">Both</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono mb-1 block">Account Size ($)</label>
          <input className={inputCls} type="number" min={1000} step={1000} value={params.account_size} onChange={(e) => setParams({ ...params, account_size: Number(e.target.value) })} />
        </div>
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono mb-1 block">Profit Target (%)</label>
          <input className={inputCls} type="number" min={1} max={100} step={0.5} value={params.profit_target_pct} onChange={(e) => setParams({ ...params, profit_target_pct: Number(e.target.value) })} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono mb-1 block">Max Drawdown (%)</label>
          <input className={inputCls} type="number" min={1} max={50} step={0.5} value={params.max_drawdown_pct} onChange={(e) => setParams({ ...params, max_drawdown_pct: Number(e.target.value) })} />
        </div>
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono mb-1 block">Daily Loss (%)</label>
          <input className={inputCls} type="number" min={1} max={20} step={0.5} value={params.daily_loss_pct} onChange={(e) => setParams({ ...params, daily_loss_pct: Number(e.target.value) })} />
        </div>
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono mb-1 block">Consistency Rule (%)</label>
          <input className={inputCls} type="number" min={10} max={100} step={5} placeholder="Optional" value={params.consistency_rule_pct} onChange={(e) => setParams({ ...params, consistency_rule_pct: e.target.value })} />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-4">
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono mb-1 block">Max Risk/Trade (%)</label>
          <input className={inputCls} type="number" min={0.5} max={10} step={0.5} placeholder="Optional" value={params.max_risk_per_trade_pct} onChange={(e) => setParams({ ...params, max_risk_per_trade_pct: e.target.value })} />
        </div>
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono mb-1 block">Min Trading Days</label>
          <input className={inputCls} type="number" min={1} max={60} placeholder="Optional" value={params.min_trading_days} onChange={(e) => setParams({ ...params, min_trading_days: e.target.value })} />
        </div>
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono mb-1 block">Max Days</label>
          <input className={inputCls} type="number" min={1} max={365} placeholder="Optional" value={params.max_days} onChange={(e) => setParams({ ...params, max_days: e.target.value })} />
        </div>
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono mb-1 block">Max Positions</label>
          <input className={inputCls} type="number" min={1} max={50} placeholder="Optional" value={params.max_open_positions} onChange={(e) => setParams({ ...params, max_open_positions: e.target.value })} />
        </div>
      </div>
      <button
        type="submit"
        disabled={starting || params.account_size < 1000}
        className="w-full py-3 rounded-xl text-sm font-bold bg-[#00d4aa] hover:bg-[#00d4aa]/90 text-black transition-all disabled:opacity-40"
      >
        {starting ? "Starting..." : "Start Custom Challenge"}
      </button>
    </form>
  );
}

function StatTile({ label, value, color = "default" }: { label: string; value: string; color?: "default" | "green" | "red" }) {
  const colors = { default: "text-white", green: "text-[#00d4aa]", red: "text-red-400" };
  return (
    <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
      <div className="text-[9px] text-zinc-600 uppercase tracking-wider font-mono mb-1">{label}</div>
      <div className={clsx("text-base font-bold tabular-nums font-mono", colors[color])}>{value}</div>
    </div>
  );
}
