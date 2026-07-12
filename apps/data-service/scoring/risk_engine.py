"""
Universal Prop Risk Engine — multi-profile position sizing with
per-profile kill switches and dual-layer signal output.

Every signal passes through this engine. It produces:
  Layer 1 (Core Alpha): entry, stop, target — identical for all users
  Layer 2 (Risk Allocation): per-profile position sizing, suppression state

Profiles are hardcoded non-linear dollar constraints modeled on real
prop firms (Tradeify/Lucid) to prevent micro-tick noise on small accounts.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from enum import Enum
from typing import Literal

from loguru import logger


class AssetClass(str, Enum):
    STOCK = "stock"
    CRYPTO = "crypto"
    OPTIONS = "options"
    FUTURES = "futures"


# ─── Non-linear account profiles ──────────────────────────────────────────────

PROP_RISK_MATRIX: dict[str, dict] = {
    "retail_standard": {
        "account_size": 10_000,
        "max_overall_drawdown": 1_000,
        "max_daily_loss": 500,
        "risk_per_trade_dollar": 25,
        "daily_kill_switch_threshold": 400,
    },
    "25k_prop_conservative": {
        "account_size": 25_000,
        "max_overall_drawdown": 1_000,
        "max_daily_loss": 500,
        "risk_per_trade_dollar": 75,
        "daily_kill_switch_threshold": 375,
    },
    "50k_prop_moderate": {
        "account_size": 50_000,
        "max_overall_drawdown": 2_000,
        "max_daily_loss": 1_000,
        "risk_per_trade_dollar": 125,
        "daily_kill_switch_threshold": 750,
    },
    "150k_prop_boss": {
        "account_size": 150_000,
        "max_overall_drawdown": 4_500,
        "max_daily_loss": 2_700,
        "risk_per_trade_dollar": 225,
        "daily_kill_switch_threshold": 2_025,
    },
}

DEFAULT_PROFILE = "50k_prop_moderate"

FUTURES_POINT_VALUES: dict[str, float] = {
    "ES": 50, "NQ": 20, "MES": 5, "MNQ": 2,
}


# ─── R:R Configuration ──────────────────────────────────────────────────────

@dataclass(frozen=True)
class RiskRewardConfig:
    min_rr: float
    max_rr: float
    min_stop_pct: float
    max_stop_pct: float
    is_premium_based: bool = False


RR_CONFIGS: dict[AssetClass, RiskRewardConfig] = {
    AssetClass.STOCK: RiskRewardConfig(
        min_rr=2.0, max_rr=3.0,
        min_stop_pct=0.5, max_stop_pct=3.0,
    ),
    AssetClass.CRYPTO: RiskRewardConfig(
        min_rr=2.0, max_rr=3.0,
        min_stop_pct=1.0, max_stop_pct=5.0,
    ),
    AssetClass.OPTIONS: RiskRewardConfig(
        min_rr=2.5, max_rr=3.0,
        min_stop_pct=20.0, max_stop_pct=30.0,
        is_premium_based=True,
    ),
    AssetClass.FUTURES: RiskRewardConfig(
        min_rr=2.0, max_rr=3.0,
        min_stop_pct=0.3, max_stop_pct=2.0,
    ),
}


# ─── Layer 1: Core Alpha (same for all users) ───────────────────────────────

@dataclass
class CoreAlpha:
    direction: Literal["BUY", "SELL"]
    asset_class: AssetClass
    entry_price: float
    stop_loss: float
    take_profit: float
    risk_reward_ratio: float
    stop_pct: float
    target_pct: float
    suppressed: bool = False
    suppression_reason: str = ""


# ─── Layer 2: Per-Profile Risk Allocation ────────────────────────────────────

@dataclass
class ProfileAllocation:
    profile_name: str
    units: float
    position_value: float
    risk_dollars: float
    reward_dollars: float
    contracts: int | None = None
    suppressed: bool = False
    suppression_reason: str = ""


@dataclass
class DualLayerSetup:
    alpha: CoreAlpha
    allocations: dict[str, ProfileAllocation] = field(default_factory=dict)

    @property
    def is_valid(self) -> bool:
        return not self.alpha.suppressed and any(
            not a.suppressed for a in self.allocations.values()
        )


# ─── Per-Profile Session Kill Switch ────────────────────────────────────────

@dataclass
class SessionTracker:
    realized_loss: dict[str, float] = field(default_factory=dict)
    unrealized_loss: dict[str, float] = field(default_factory=dict)

    def record_loss(self, profile: str, amount: float):
        self.realized_loss[profile] = self.realized_loss.get(profile, 0.0) + abs(amount)

    def update_unrealized(self, profile: str, amount: float):
        self.unrealized_loss[profile] = abs(amount)

    def total_loss(self, profile: str) -> float:
        return self.realized_loss.get(profile, 0.0) + self.unrealized_loss.get(profile, 0.0)

    def is_killed(self, profile: str) -> bool:
        threshold = PROP_RISK_MATRIX[profile]["daily_kill_switch_threshold"]
        return self.total_loss(profile) >= threshold

    def reset_day(self):
        self.realized_loss.clear()
        self.unrealized_loss.clear()


# ─── Backward-compat adapter ────────────────────────────────────────────────

class AccountProfile:
    """Thin adapter so existing callers (engine.py, resolver.py) keep working."""
    def __init__(self, profile_name: str = DEFAULT_PROFILE):
        p = PROP_RISK_MATRIX[profile_name]
        self.account_size = p["account_size"]
        self.max_daily_loss_pct = (p["max_daily_loss"] / p["account_size"]) * 100
        self.max_drawdown_pct = (p["max_overall_drawdown"] / p["account_size"]) * 100
        self.risk_per_trade_pct = (p["risk_per_trade_dollar"] / p["account_size"]) * 100
        self.min_risk_per_trade_pct = self.risk_per_trade_pct
        self.max_open_risk_pct = 3.0
        self._profile = p

    @property
    def max_daily_loss(self) -> float:
        return self._profile["max_daily_loss"]

    @property
    def max_drawdown(self) -> float:
        return self._profile["max_overall_drawdown"]

    @property
    def max_risk_per_trade(self) -> float:
        return self._profile["risk_per_trade_dollar"]

    @property
    def min_risk_per_trade(self) -> float:
        return self._profile["risk_per_trade_dollar"] * 0.5

    @property
    def max_open_risk(self) -> float:
        return self.account_size * (self.max_open_risk_pct / 100)


DEFAULT_ACCOUNT = AccountProfile()


# ─── RiskBudget (per-profile daily tracker) ─────────────────────────────────

@dataclass
class RiskBudget:
    profile_name: str = DEFAULT_PROFILE
    realized_loss_today: float = 0.0
    open_risk: float = 0.0

    @property
    def _profile(self) -> dict:
        return PROP_RISK_MATRIX[self.profile_name]

    @property
    def daily_budget_remaining(self) -> float:
        return self._profile["max_daily_loss"] - self.realized_loss_today - self.open_risk

    @property
    def can_take_trade(self) -> bool:
        return self.daily_budget_remaining > (self._profile["risk_per_trade_dollar"] * 0.5)

    def reserve(self, risk_dollars: float) -> bool:
        if risk_dollars > self.daily_budget_remaining:
            return False
        self.open_risk += risk_dollars
        return True

    def release(self, risk_dollars: float):
        self.open_risk = max(0.0, self.open_risk - risk_dollars)

    def record_loss(self, loss_dollars: float):
        self.realized_loss_today += abs(loss_dollars)


# ─── Stop/Target computation (Layer 1) ─────────────────────────────────────

def compute_stop_and_target(
    entry_price: float,
    direction: str,
    asset_class: AssetClass,
    atr: float | None = None,
    invalidation_level: float | None = None,
) -> tuple[float, float, float, float]:
    """Compute stop loss and take profit for a trade setup.

    Returns: (stop_loss, take_profit, stop_pct, target_pct)
    """
    config = RR_CONFIGS[asset_class]

    if config.is_premium_based:
        stop_pct = config.min_stop_pct / 100
        target_pct = (config.min_stop_pct * config.min_rr) / 100
    elif invalidation_level is not None and invalidation_level > 0:
        raw_stop_pct = abs(entry_price - invalidation_level) / entry_price
        stop_pct = max(config.min_stop_pct / 100,
                       min(config.max_stop_pct / 100, raw_stop_pct))
        target_pct = stop_pct * config.min_rr
    elif atr is not None and atr > 0:
        atr_stop_pct = (atr * 1.5) / entry_price
        stop_pct = max(config.min_stop_pct / 100,
                       min(config.max_stop_pct / 100, atr_stop_pct))
        target_pct = stop_pct * config.min_rr
    else:
        stop_pct = (config.min_stop_pct + config.max_stop_pct) / 2 / 100
        target_pct = stop_pct * config.min_rr

    if direction == "BUY":
        stop_loss = round(entry_price * (1 - stop_pct), 4)
        take_profit = round(entry_price * (1 + target_pct), 4)
    else:
        stop_loss = round(entry_price * (1 + stop_pct), 4)
        take_profit = round(entry_price * (1 - target_pct), 4)

    return stop_loss, take_profit, stop_pct, target_pct


# ─── Polymorphic position sizing (Layer 2) ─────────────────────────────────

def compute_units(
    asset_class: AssetClass,
    risk_dollars: float,
    entry_price: float,
    stop_loss: float,
    futures_symbol: str | None = None,
) -> tuple[float, int | None]:
    """Returns (units, contracts_or_none).

    Stocks/Crypto: fractional units (8 decimals for crypto).
    Options: contracts = floor(risk / ((premium_entry - premium_stop) * 100)).
    Futures: contracts = floor(risk / (stop_points * point_value)).
    """
    risk_per_unit = abs(entry_price - stop_loss)
    if risk_per_unit <= 0:
        return 0.0, None

    if asset_class == AssetClass.OPTIONS:
        contracts = math.floor(risk_dollars / (risk_per_unit * 100))
        return float(contracts), max(contracts, 0)

    if asset_class == AssetClass.FUTURES:
        pv = FUTURES_POINT_VALUES.get((futures_symbol or "").upper(), 50)
        contracts = math.floor(risk_dollars / (risk_per_unit * pv))
        return float(contracts), max(contracts, 0)

    units = risk_dollars / risk_per_unit
    if asset_class == AssetClass.CRYPTO:
        return round(units, 8), None
    return round(units, 4), None


# ─── Multi-profile scoring (the main entry point) ──────────────────────────

def score_all_profiles(
    direction: str,
    asset_class: AssetClass | str,
    entry_price: float,
    confidence: int,
    session: SessionTracker | None = None,
    atr: float | None = None,
    invalidation_level: float | None = None,
    futures_symbol: str | None = None,
) -> DualLayerSetup:
    if isinstance(asset_class, str):
        asset_class = AssetClass(asset_class)

    if direction not in ("BUY", "SELL"):
        return DualLayerSetup(
            alpha=CoreAlpha(
                direction=direction, asset_class=asset_class,
                entry_price=entry_price, stop_loss=0, take_profit=0,
                risk_reward_ratio=0, stop_pct=0, target_pct=0,
                suppressed=True,
                suppression_reason="HOLD signals have no trade setup",
            )
        )

    stop_loss, take_profit, stop_pct, target_pct = compute_stop_and_target(
        entry_price, direction, asset_class,
        atr=atr, invalidation_level=invalidation_level,
    )
    rr_ratio = target_pct / stop_pct if stop_pct > 0 else 0
    config = RR_CONFIGS[asset_class]

    if rr_ratio < config.min_rr:
        return DualLayerSetup(
            alpha=CoreAlpha(
                direction=direction, asset_class=asset_class,
                entry_price=entry_price, stop_loss=stop_loss,
                take_profit=take_profit, risk_reward_ratio=rr_ratio,
                stop_pct=round(stop_pct * 100, 2),
                target_pct=round(target_pct * 100, 2),
                suppressed=True,
                suppression_reason=f"R:R {rr_ratio:.1f}:1 below minimum {config.min_rr}:1",
            )
        )

    alpha = CoreAlpha(
        direction=direction,
        asset_class=asset_class,
        entry_price=entry_price,
        stop_loss=stop_loss,
        take_profit=take_profit,
        risk_reward_ratio=round(rr_ratio, 2),
        stop_pct=round(stop_pct * 100, 2),
        target_pct=round(target_pct * 100, 2),
    )

    allocations: dict[str, ProfileAllocation] = {}
    for name, profile in PROP_RISK_MATRIX.items():
        risk_dollars = profile["risk_per_trade_dollar"]

        if session is not None and session.is_killed(name):
            allocations[name] = ProfileAllocation(
                profile_name=name, units=0, position_value=0,
                risk_dollars=risk_dollars, reward_dollars=0,
                suppressed=True,
                suppression_reason=(
                    f"Kill switch: ${session.total_loss(name):.0f} losses "
                    f">= ${profile['daily_kill_switch_threshold']} threshold"
                ),
            )
            continue

        if risk_dollars > profile["max_daily_loss"]:
            allocations[name] = ProfileAllocation(
                profile_name=name, units=0, position_value=0,
                risk_dollars=risk_dollars, reward_dollars=0,
                suppressed=True,
                suppression_reason=(
                    f"Risk ${risk_dollars} exceeds daily loss limit ${profile['max_daily_loss']}"
                ),
            )
            continue

        units, contracts = compute_units(
            asset_class, risk_dollars, entry_price, stop_loss,
            futures_symbol=futures_symbol,
        )
        position_value = round(units * entry_price, 2)
        reward_dollars = round(units * abs(entry_price - take_profit), 2)

        allocations[name] = ProfileAllocation(
            profile_name=name,
            units=units,
            position_value=position_value,
            risk_dollars=round(risk_dollars, 2),
            reward_dollars=reward_dollars,
            contracts=contracts,
        )

    logger.debug(
        "risk_engine: {} {} @ ${:.2f} → SL ${:.2f} ({:.1f}%) / "
        "TP ${:.2f} ({:.1f}%) / R:R {:.1f}:1 / {} profiles scored",
        direction, asset_class.value, entry_price,
        stop_loss, stop_pct * 100, take_profit, target_pct * 100,
        rr_ratio, len(allocations),
    )

    return DualLayerSetup(alpha=alpha, allocations=allocations)


# ─── Single-profile scoring (backward compat for engine.py) ────────────────

@dataclass
class TradeSetup:
    direction: Literal["BUY", "SELL"]
    asset_class: AssetClass
    entry_price: float
    stop_loss: float
    take_profit: float
    position_size: float
    position_value: float
    risk_dollars: float
    reward_dollars: float
    risk_reward_ratio: float
    stop_pct: float
    target_pct: float
    max_contracts: int | None = None
    suppressed: bool = False
    suppression_reason: str = ""
    allocations: dict[str, dict] | None = None

    @property
    def is_valid(self) -> bool:
        return not self.suppressed and self.position_size > 0


def score_setup(
    direction: str,
    asset_class: AssetClass | str,
    entry_price: float,
    confidence: int,
    account: "AccountProfile | None" = None,
    budget: RiskBudget | None = None,
    atr: float | None = None,
    invalidation_level: float | None = None,
) -> TradeSetup:
    """Backward-compatible single-profile entry point.

    Calls score_all_profiles() internally, returns a TradeSetup using
    the default profile for position sizing, with all profile allocations
    attached.
    """
    if isinstance(asset_class, str):
        asset_class = AssetClass(asset_class)

    dual = score_all_profiles(
        direction=direction,
        asset_class=asset_class,
        entry_price=entry_price,
        confidence=confidence,
        atr=atr,
        invalidation_level=invalidation_level,
    )

    if dual.alpha.suppressed:
        return TradeSetup(
            direction=direction, asset_class=asset_class,
            entry_price=entry_price,
            stop_loss=dual.alpha.stop_loss,
            take_profit=dual.alpha.take_profit,
            position_size=0, position_value=0,
            risk_dollars=0, reward_dollars=0,
            risk_reward_ratio=dual.alpha.risk_reward_ratio,
            stop_pct=dual.alpha.stop_pct,
            target_pct=dual.alpha.target_pct,
            suppressed=True,
            suppression_reason=dual.alpha.suppression_reason,
        )

    default_alloc = dual.allocations.get(DEFAULT_PROFILE)
    if default_alloc is None or default_alloc.suppressed:
        reason = default_alloc.suppression_reason if default_alloc else "no default profile"
        return TradeSetup(
            direction=direction, asset_class=asset_class,
            entry_price=entry_price,
            stop_loss=dual.alpha.stop_loss,
            take_profit=dual.alpha.take_profit,
            position_size=0, position_value=0,
            risk_dollars=0, reward_dollars=0,
            risk_reward_ratio=dual.alpha.risk_reward_ratio,
            stop_pct=dual.alpha.stop_pct,
            target_pct=dual.alpha.target_pct,
            suppressed=True,
            suppression_reason=reason,
        )

    if budget is not None and not budget.can_take_trade:
        return TradeSetup(
            direction=direction, asset_class=asset_class,
            entry_price=entry_price,
            stop_loss=dual.alpha.stop_loss,
            take_profit=dual.alpha.take_profit,
            position_size=0, position_value=0,
            risk_dollars=default_alloc.risk_dollars,
            reward_dollars=default_alloc.reward_dollars,
            risk_reward_ratio=dual.alpha.risk_reward_ratio,
            stop_pct=dual.alpha.stop_pct,
            target_pct=dual.alpha.target_pct,
            suppressed=True,
            suppression_reason=(
                f"Daily risk budget exhausted — "
                f"${budget.daily_budget_remaining:.0f} remaining"
            ),
        )

    if budget is not None:
        if not budget.reserve(default_alloc.risk_dollars):
            return TradeSetup(
                direction=direction, asset_class=asset_class,
                entry_price=entry_price,
                stop_loss=dual.alpha.stop_loss,
                take_profit=dual.alpha.take_profit,
                position_size=0, position_value=0,
                risk_dollars=default_alloc.risk_dollars,
                reward_dollars=default_alloc.reward_dollars,
                risk_reward_ratio=dual.alpha.risk_reward_ratio,
                stop_pct=dual.alpha.stop_pct,
                target_pct=dual.alpha.target_pct,
                suppressed=True,
                suppression_reason=(
                    f"Would exceed open risk cap — "
                    f"${budget.daily_budget_remaining:.0f} budget remaining"
                ),
            )

    all_allocs = {
        name: {
            "units": a.units,
            "position_value": a.position_value,
            "risk_dollars": a.risk_dollars,
            "reward_dollars": a.reward_dollars,
            "contracts": a.contracts,
            "suppressed": a.suppressed,
            "suppression_reason": a.suppression_reason,
        }
        for name, a in dual.allocations.items()
    }

    return TradeSetup(
        direction=direction,
        asset_class=asset_class,
        entry_price=entry_price,
        stop_loss=dual.alpha.stop_loss,
        take_profit=dual.alpha.take_profit,
        position_size=default_alloc.units,
        position_value=default_alloc.position_value,
        risk_dollars=default_alloc.risk_dollars,
        reward_dollars=default_alloc.reward_dollars,
        risk_reward_ratio=dual.alpha.risk_reward_ratio,
        stop_pct=dual.alpha.stop_pct,
        target_pct=dual.alpha.target_pct,
        max_contracts=default_alloc.contracts,
        allocations=all_allocs,
    )


# ─── Resolution thresholds ─────────────────────────────────────────────────

def get_symmetric_resolution_thresholds(
    asset_class: AssetClass | str,
) -> tuple[float, float]:
    if isinstance(asset_class, str):
        asset_class = AssetClass(asset_class)
    config = RR_CONFIGS[asset_class]
    if config.is_premium_based:
        mid_stop = config.min_stop_pct / 100
    else:
        mid_stop = (config.min_stop_pct + config.max_stop_pct) / 2 / 100
    return mid_stop, mid_stop


# ─── Formatting helpers ───────────────────────────────────────────────────

def format_trade_setup(setup: TradeSetup) -> dict:
    if setup.suppressed:
        return {
            "suppressed": True,
            "suppression_reason": setup.suppression_reason,
        }

    base = {
        "stop_loss": setup.stop_loss,
        "take_profit": setup.take_profit,
        "stop_pct": setup.stop_pct,
        "target_pct": setup.target_pct,
        "risk_reward_ratio": setup.risk_reward_ratio,
        "position_size": setup.position_size,
        "position_value": setup.position_value,
        "risk_dollars": setup.risk_dollars,
        "reward_dollars": setup.reward_dollars,
    }
    if setup.max_contracts is not None:
        base["max_contracts"] = setup.max_contracts
    if setup.allocations:
        base["profile_allocations"] = setup.allocations
    return base
