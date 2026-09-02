"""
Challenge Engine — tracks user challenge progress against prop firm rules.

Evaluates each signal against the user's active challenge constraints:
drawdown headroom, daily loss budget, consistency limits, position caps.
Downsizes or suppresses signals that would breach challenge rules.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Any

from loguru import logger


@dataclass
class ChallengeRules:
    """Normalized challenge parameters (all as dollar amounts, not pcts)."""
    challenge_id: int
    account_size: float
    profit_target: float
    max_drawdown: float
    daily_loss_limit: float
    max_risk_per_trade: float | None
    consistency_max_day_pct: float | None
    min_trading_days: int | None
    max_days: int | None
    max_open_positions: int | None
    asset_class: str  # crypto, prediction, both

    @classmethod
    def from_challenge_row(cls, row: dict) -> ChallengeRules:
        acct = float(row["account_size"])
        profit_target_pct = float(row.get("profit_target_pct") or 0)
        max_dd_pct = float(row.get("max_drawdown_pct") or 0)
        daily_loss_pct = float(row.get("daily_loss_pct") or 0)
        risk_per_trade_pct = row.get("max_risk_per_trade_pct")

        return cls(
            challenge_id=row["id"],
            account_size=acct,
            profit_target=acct * profit_target_pct / 100 if profit_target_pct else 0,
            max_drawdown=acct * max_dd_pct / 100 if max_dd_pct else 0,
            daily_loss_limit=acct * daily_loss_pct / 100 if daily_loss_pct else 0,
            max_risk_per_trade=acct * float(risk_per_trade_pct) / 100 if risk_per_trade_pct else None,
            consistency_max_day_pct=float(row["consistency_rule_pct"]) if row.get("consistency_rule_pct") else None,
            min_trading_days=row.get("min_trading_days"),
            max_days=row.get("max_days"),
            max_open_positions=row.get("max_open_positions"),
            asset_class=row.get("asset_class", "crypto"),
        )


@dataclass
class ChallengeState:
    """Current challenge tracking state."""
    current_balance: float
    peak_balance: float
    total_pnl: float
    current_drawdown: float
    max_drawdown_hit: float
    trading_days: int
    total_trades: int
    wins: int
    losses: int
    best_day_pnl: float
    worst_day_pnl: float
    started_at: datetime
    today_pnl: float = 0.0
    today_trades: int = 0
    open_positions: int = 0

    @classmethod
    def from_challenge_row(cls, row: dict, today_snapshot: dict | None = None,
                           open_count: int = 0) -> ChallengeState:
        return cls(
            current_balance=float(row["current_balance"]),
            peak_balance=float(row["peak_balance"]),
            total_pnl=float(row["total_pnl"]),
            current_drawdown=float(row["current_drawdown"]),
            max_drawdown_hit=float(row["max_drawdown_hit"]),
            trading_days=int(row["trading_days"]),
            total_trades=int(row["total_trades"]),
            wins=int(row["wins"]),
            losses=int(row["losses"]),
            best_day_pnl=float(row["best_day_pnl"]),
            worst_day_pnl=float(row["worst_day_pnl"]),
            started_at=row["started_at"] if isinstance(row["started_at"], datetime)
                       else datetime.fromisoformat(str(row["started_at"])),
            today_pnl=float(today_snapshot["day_pnl"]) if today_snapshot else 0.0,
            today_trades=int(today_snapshot["trades_count"]) if today_snapshot else 0,
            open_positions=open_count,
        )


@dataclass
class ChallengeGateResult:
    """Result of checking a signal against challenge rules."""
    allowed: bool
    max_risk_dollars: float | None = None
    warnings: list[str] | None = None
    block_reason: str | None = None


def check_challenge_gates(
    rules: ChallengeRules,
    state: ChallengeState,
    proposed_risk_dollars: float,
    asset_type: str,
) -> ChallengeGateResult:
    """Check whether a proposed trade fits within challenge constraints.

    Returns a ChallengeGateResult with allowed=True and optionally a reduced
    max_risk_dollars, or allowed=False with a block_reason.
    """
    warnings: list[str] = []
    effective_risk = proposed_risk_dollars

    # Asset class check
    if rules.asset_class not in ("both", asset_type):
        return ChallengeGateResult(
            allowed=False,
            block_reason=f"Challenge only allows {rules.asset_class} trades",
        )

    # 1. Drawdown headroom
    if rules.max_drawdown > 0:
        drawdown_remaining = rules.max_drawdown - state.current_drawdown
        if drawdown_remaining <= 0:
            return ChallengeGateResult(
                allowed=False,
                block_reason="Max drawdown limit reached — challenge failed",
            )
        if effective_risk > drawdown_remaining * 0.5:
            effective_risk = min(effective_risk, drawdown_remaining * 0.33)
            warnings.append(
                f"Risk reduced to ${effective_risk:.0f} — only "
                f"${drawdown_remaining:.0f} drawdown headroom left"
            )

    # 2. Daily loss budget
    if rules.daily_loss_limit > 0:
        daily_remaining = rules.daily_loss_limit - abs(min(state.today_pnl, 0))
        if daily_remaining <= 0:
            return ChallengeGateResult(
                allowed=False,
                block_reason="Daily loss limit reached — no more trades today",
            )
        if effective_risk > daily_remaining * 0.5:
            effective_risk = min(effective_risk, daily_remaining * 0.33)
            warnings.append(
                f"Risk reduced to ${effective_risk:.0f} — only "
                f"${daily_remaining:.0f} daily loss budget left"
            )

    # 3. Per-trade risk cap
    if rules.max_risk_per_trade and effective_risk > rules.max_risk_per_trade:
        effective_risk = rules.max_risk_per_trade
        warnings.append(
            f"Risk capped at ${rules.max_risk_per_trade:.0f} per challenge rules"
        )

    # 4. Consistency rule — don't let today become >X% of total profit
    if rules.consistency_max_day_pct and state.total_pnl > 0:
        max_day_profit = state.total_pnl * rules.consistency_max_day_pct / 100
        if state.today_pnl > 0 and state.today_pnl >= max_day_profit * 0.8:
            warnings.append(
                f"Approaching consistency limit — today's P&L "
                f"(${state.today_pnl:.0f}) nearing {rules.consistency_max_day_pct}% "
                f"of total profit (${max_day_profit:.0f} max)"
            )

    # 5. Max open positions
    if rules.max_open_positions and state.open_positions >= rules.max_open_positions:
        return ChallengeGateResult(
            allowed=False,
            block_reason=f"Max {rules.max_open_positions} open positions reached",
        )

    # 6. Time limit
    if rules.max_days:
        days_elapsed = (datetime.now(timezone.utc) - state.started_at).days
        if days_elapsed >= rules.max_days:
            return ChallengeGateResult(
                allowed=False,
                block_reason=f"Challenge time limit ({rules.max_days} days) expired",
            )

    if effective_risk <= 0:
        return ChallengeGateResult(
            allowed=False,
            block_reason="Risk budget exhausted",
        )

    return ChallengeGateResult(
        allowed=True,
        max_risk_dollars=effective_risk if effective_risk != proposed_risk_dollars else None,
        warnings=warnings if warnings else None,
    )


def compute_challenge_progress(rules: ChallengeRules, state: ChallengeState) -> dict:
    """Compute progress metrics for dashboard display."""
    profit_made = state.current_balance - rules.account_size
    profit_pct = (profit_made / rules.profit_target * 100) if rules.profit_target > 0 else 0

    drawdown_used_pct = (state.max_drawdown_hit / rules.max_drawdown * 100) if rules.max_drawdown > 0 else 0
    drawdown_remaining = max(0, rules.max_drawdown - state.current_drawdown)

    days_elapsed = (datetime.now(timezone.utc) - state.started_at).days
    days_remaining = max(0, rules.max_days - days_elapsed) if rules.max_days else None

    win_rate = (state.wins / (state.wins + state.losses) * 100) if (state.wins + state.losses) > 0 else 0

    # Check pass conditions
    passed = profit_made >= rules.profit_target if rules.profit_target > 0 else False
    min_days_met = state.trading_days >= rules.min_trading_days if rules.min_trading_days else True
    can_pass = passed and min_days_met

    # Check fail conditions
    breached_drawdown = state.current_drawdown >= rules.max_drawdown if rules.max_drawdown > 0 else False
    time_expired = days_elapsed >= rules.max_days if rules.max_days else False
    failed = breached_drawdown or (time_expired and not passed)

    # Consistency check
    consistency_ok = True
    consistency_detail = None
    if rules.consistency_max_day_pct and state.total_pnl > 0:
        max_allowed = state.total_pnl * rules.consistency_max_day_pct / 100
        if state.best_day_pnl > max_allowed:
            consistency_ok = False
            consistency_detail = (
                f"Best day ${state.best_day_pnl:.0f} exceeds "
                f"{rules.consistency_max_day_pct}% of total profit "
                f"(${max_allowed:.0f} max)"
            )

    status = "passed" if can_pass else "failed" if failed else "active"

    return {
        "status": status,
        "profit_made": round(profit_made, 2),
        "profit_target": round(rules.profit_target, 2),
        "profit_pct": round(profit_pct, 1),
        "drawdown_used": round(state.current_drawdown, 2),
        "drawdown_max": round(rules.max_drawdown, 2),
        "drawdown_used_pct": round(drawdown_used_pct, 1),
        "drawdown_remaining": round(drawdown_remaining, 2),
        "days_elapsed": days_elapsed,
        "days_remaining": days_remaining,
        "trading_days": state.trading_days,
        "min_trading_days": rules.min_trading_days,
        "min_days_met": min_days_met,
        "total_trades": state.total_trades,
        "wins": state.wins,
        "losses": state.losses,
        "win_rate": round(win_rate, 1),
        "best_day_pnl": round(state.best_day_pnl, 2),
        "worst_day_pnl": round(state.worst_day_pnl, 2),
        "today_pnl": round(state.today_pnl, 2),
        "current_balance": round(state.current_balance, 2),
        "peak_balance": round(state.peak_balance, 2),
        "consistency_ok": consistency_ok,
        "consistency_detail": consistency_detail,
        "can_pass": can_pass,
    }


def record_trade(
    supabase,
    challenge_id: int,
    signal: dict,
    risk_dollars: float,
    size: float,
) -> dict | None:
    """Record a trade entry in the challenge trade log. Returns the inserted row."""
    try:
        trade_data = {
            "challenge_id": challenge_id,
            "signal_id": signal.get("id"),
            "asset_type": signal["asset_type"],
            "identifier": signal["identifier"],
            "direction": signal["direction"],
            "entry_price": signal["price_at_signal"],
            "size": size,
            "risk_dollars": risk_dollars,
            "stop_loss": signal.get("trade_setup", {}).get("stop_loss"),
            "take_profit": signal.get("trade_setup", {}).get("take_profit"),
            "trade_day": date.today().isoformat(),
        }
        result = supabase.table("challenge_trades").insert(trade_data).execute()
        if result.data:
            return result.data[0]
    except Exception as e:
        logger.error(f"Failed to record challenge trade: {e}")
    return None


def close_trade(
    supabase,
    trade_id: int,
    exit_price: float,
    status: str = "closed",
) -> float | None:
    """Close a challenge trade and compute P&L. Returns the P&L amount."""
    try:
        trade = supabase.table("challenge_trades").select("*").eq("id", trade_id).single().execute()
        if not trade.data:
            return None

        row = trade.data
        entry = float(row["entry_price"])
        size = float(row["size"])

        if row["direction"] in ("BUY", "YES"):
            pnl = (exit_price - entry) * size
        else:
            pnl = (entry - exit_price) * size

        supabase.table("challenge_trades").update({
            "exit_price": exit_price,
            "pnl": round(pnl, 2),
            "status": status,
            "closed_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", trade_id).execute()

        _update_challenge_after_trade(supabase, int(row["challenge_id"]), pnl)
        return round(pnl, 2)
    except Exception as e:
        logger.error(f"Failed to close challenge trade {trade_id}: {e}")
    return None


def _update_challenge_after_trade(supabase, challenge_id: int, pnl: float):
    """Update challenge tracking state after a trade closes."""
    try:
        ch = supabase.table("user_challenges").select("*").eq("id", challenge_id).single().execute()
        if not ch.data:
            return

        row = ch.data
        new_balance = float(row["current_balance"]) + pnl
        new_total_pnl = float(row["total_pnl"]) + pnl
        new_peak = max(float(row["peak_balance"]), new_balance)
        new_drawdown = max(0, new_peak - new_balance)
        new_max_dd = max(float(row["max_drawdown_hit"]), new_drawdown)

        wins = int(row["wins"]) + (1 if pnl > 0 else 0)
        losses = int(row["losses"]) + (1 if pnl < 0 else 0)
        total_trades = int(row["total_trades"]) + 1

        update = {
            "current_balance": round(new_balance, 2),
            "peak_balance": round(new_peak, 2),
            "total_pnl": round(new_total_pnl, 2),
            "current_drawdown": round(new_drawdown, 2),
            "max_drawdown_hit": round(new_max_dd, 2),
            "total_trades": total_trades,
            "wins": wins,
            "losses": losses,
        }

        # Check if challenge should auto-fail
        rules_row = row
        max_dd_limit = float(rules_row["account_size"]) * float(rules_row.get("max_drawdown_pct") or 0) / 100
        if max_dd_limit > 0 and new_drawdown >= max_dd_limit:
            update["status"] = "failed"
            update["ended_at"] = datetime.now(timezone.utc).isoformat()
            update["ended_reason"] = "max_drawdown_breached"

        # Check if challenge should auto-pass
        profit_target = float(rules_row["account_size"]) * float(rules_row.get("profit_target_pct") or 0) / 100
        profit_made = new_balance - float(rules_row["account_size"])
        if profit_target > 0 and profit_made >= profit_target:
            min_days = rules_row.get("min_trading_days")
            trading_days = int(row["trading_days"])
            if not min_days or trading_days >= min_days:
                update["status"] = "passed"
                update["ended_at"] = datetime.now(timezone.utc).isoformat()
                update["ended_reason"] = "profit_target_reached"

        supabase.table("user_challenges").update(update).eq("id", challenge_id).execute()

        # Update daily snapshot
        _update_daily_snapshot(supabase, challenge_id, pnl, new_balance)

    except Exception as e:
        logger.error(f"Failed to update challenge {challenge_id} after trade: {e}")


def _update_daily_snapshot(supabase, challenge_id: int, pnl: float, balance: float):
    """Upsert today's daily snapshot."""
    today = date.today().isoformat()
    try:
        existing = (
            supabase.table("challenge_daily_snapshots")
            .select("*")
            .eq("challenge_id", challenge_id)
            .eq("snapshot_date", today)
            .execute()
        )

        if existing.data:
            snap = existing.data[0]
            new_day_pnl = float(snap["day_pnl"]) + pnl
            new_count = int(snap["trades_count"]) + 1
            new_wins = int(snap["wins"]) + (1 if pnl > 0 else 0)
            new_losses = int(snap["losses"]) + (1 if pnl < 0 else 0)

            supabase.table("challenge_daily_snapshots").update({
                "ending_balance": round(balance, 2),
                "day_pnl": round(new_day_pnl, 2),
                "trades_count": new_count,
                "wins": new_wins,
                "losses": new_losses,
            }).eq("id", snap["id"]).execute()
        else:
            supabase.table("challenge_daily_snapshots").insert({
                "challenge_id": challenge_id,
                "snapshot_date": today,
                "starting_balance": round(balance - pnl, 2),
                "ending_balance": round(balance, 2),
                "day_pnl": round(pnl, 2),
                "trades_count": 1,
                "wins": 1 if pnl > 0 else 0,
                "losses": 1 if pnl < 0 else 0,
            }).execute()

    except Exception as e:
        logger.error(f"Failed to update daily snapshot for challenge {challenge_id}: {e}")


def get_active_challenge(supabase, user_id: str) -> dict | None:
    """Get the user's active challenge, if any."""
    try:
        result = (
            supabase.table("user_challenges")
            .select("*")
            .eq("user_id", user_id)
            .eq("status", "active")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        return result.data[0] if result.data else None
    except Exception as e:
        logger.error(f"Failed to get active challenge for {user_id}: {e}")
    return None


def start_challenge(
    supabase,
    user_id: str,
    template_id: int | None = None,
    custom_params: dict | None = None,
) -> dict | None:
    """Start a new challenge from a template or custom parameters.

    Only one active challenge per user. Returns the created challenge row.
    """
    try:
        # Check for existing active challenge
        existing = get_active_challenge(supabase, user_id)
        if existing:
            logger.warning(f"User {user_id} already has active challenge {existing['id']}")
            return None

        if template_id:
            tmpl = (
                supabase.table("challenge_templates")
                .select("*")
                .eq("id", template_id)
                .single()
                .execute()
            )
            if not tmpl.data:
                return None
            t = tmpl.data
            params = {
                "user_id": user_id,
                "template_id": template_id,
                "firm_name": t["firm_name"],
                "plan_name": t["plan_name"],
                "asset_class": t["asset_class"],
                "account_size": t["account_size"],
                "profit_target_pct": t["profit_target_pct"],
                "max_drawdown_pct": t["max_drawdown_pct"],
                "daily_loss_pct": t["daily_loss_pct"],
                "max_risk_per_trade_pct": t.get("max_risk_per_trade_pct"),
                "consistency_rule_pct": t.get("consistency_rule_pct"),
                "min_trading_days": t.get("min_trading_days"),
                "max_days": t.get("max_days"),
                "max_open_positions": t.get("max_open_positions"),
                "current_balance": t["account_size"],
                "peak_balance": t["account_size"],
            }
        elif custom_params:
            acct = custom_params["account_size"]
            params = {
                "user_id": user_id,
                "firm_name": custom_params.get("firm_name", "Custom"),
                "plan_name": custom_params.get("plan_name", "Custom"),
                "asset_class": custom_params.get("asset_class", "crypto"),
                "account_size": acct,
                "profit_target_pct": custom_params["profit_target_pct"],
                "max_drawdown_pct": custom_params.get("max_drawdown_pct"),
                "daily_loss_pct": custom_params.get("daily_loss_pct"),
                "max_risk_per_trade_pct": custom_params.get("max_risk_per_trade_pct"),
                "consistency_rule_pct": custom_params.get("consistency_rule_pct"),
                "min_trading_days": custom_params.get("min_trading_days"),
                "max_days": custom_params.get("max_days"),
                "max_open_positions": custom_params.get("max_open_positions"),
                "current_balance": acct,
                "peak_balance": acct,
            }
        else:
            return None

        result = supabase.table("user_challenges").insert(params).execute()
        if result.data:
            logger.info(
                f"Challenge started: user={user_id} "
                f"firm={params['firm_name']} plan={params['plan_name']} "
                f"size=${params['account_size']}"
            )
            return result.data[0]
    except Exception as e:
        logger.error(f"Failed to start challenge: {e}")
    return None


def abandon_challenge(supabase, challenge_id: int, user_id: str) -> bool:
    """Abandon an active challenge."""
    try:
        supabase.table("user_challenges").update({
            "status": "abandoned",
            "ended_at": datetime.now(timezone.utc).isoformat(),
            "ended_reason": "user_abandoned",
        }).eq("id", challenge_id).eq("user_id", user_id).eq("status", "active").execute()
        return True
    except Exception as e:
        logger.error(f"Failed to abandon challenge {challenge_id}: {e}")
    return False
