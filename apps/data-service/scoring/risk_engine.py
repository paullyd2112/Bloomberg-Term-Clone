"""
Prop Risk Engine — enforces strict position sizing and symmetric R:R
boundaries for prop firm funded accounts.

Every signal must pass through this engine before being surfaced to users.
It calculates exact position size, stop loss, and take profit targets based
on the account profile, and suppresses trades whose invalidation point
would violate the daily loss limit.

Core rules:
  - Risk per trade: 0.25% to 0.5% of account (configurable)
  - Minimum reward-to-risk: 2:1 (stocks/crypto), premium-based for options
  - If a trade's required stop would exceed the daily loss budget, score = 0 (SUPPRESSED)
  - All thresholds are symmetric: the resolver uses the same stop/target
    that this engine computed at signal time
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Literal

from loguru import logger


class AssetClass(str, Enum):
    STOCK = "stock"
    CRYPTO = "crypto"
    OPTIONS = "options"


@dataclass(frozen=True)
class AccountProfile:
    """Prop firm funded account constraints.

    Default values model a typical $50k funded account:
      - 4% max EOD drawdown ($2,000)
      - 10% max trailing drawdown ($5,000)
      - Risk per trade: 0.25-0.5% of account ($125-$250)
    """
    account_size: float = 50_000.0
    max_daily_loss_pct: float = 4.0
    max_drawdown_pct: float = 10.0
    risk_per_trade_pct: float = 0.5
    min_risk_per_trade_pct: float = 0.25
    max_open_risk_pct: float = 3.0

    @property
    def max_daily_loss(self) -> float:
        return self.account_size * (self.max_daily_loss_pct / 100)

    @property
    def max_drawdown(self) -> float:
        return self.account_size * (self.max_drawdown_pct / 100)

    @property
    def max_risk_per_trade(self) -> float:
        return self.account_size * (self.risk_per_trade_pct / 100)

    @property
    def min_risk_per_trade(self) -> float:
        return self.account_size * (self.min_risk_per_trade_pct / 100)

    @property
    def max_open_risk(self) -> float:
        return self.account_size * (self.max_open_risk_pct / 100)


# ─── R:R Configuration ──────────────────────────────────────────────────────

@dataclass(frozen=True)
class RiskRewardConfig:
    """Symmetric risk-to-reward boundaries per asset class."""
    min_rr: float
    max_rr: float
    # Stop loss bounds as percentage of entry price
    min_stop_pct: float
    max_stop_pct: float
    # Options use premium-based stops instead of price-based
    is_premium_based: bool = False


RR_CONFIGS: dict[AssetClass, RiskRewardConfig] = {
    AssetClass.STOCK: RiskRewardConfig(
        min_rr=2.0,
        max_rr=3.0,
        min_stop_pct=0.5,
        max_stop_pct=3.0,
    ),
    AssetClass.CRYPTO: RiskRewardConfig(
        min_rr=2.0,
        max_rr=3.0,
        min_stop_pct=1.0,
        max_stop_pct=5.0,
    ),
    AssetClass.OPTIONS: RiskRewardConfig(
        min_rr=2.5,
        max_rr=3.0,
        min_stop_pct=20.0,
        max_stop_pct=30.0,
        is_premium_based=True,
    ),
}


# ─── Trade Setup ─────────────────────────────────────────────────────────────

@dataclass
class TradeSetup:
    """A scored trade setup with risk parameters.

    Computed by `score_setup()` — contains everything a user needs to
    execute the trade within prop firm rules.
    """
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

    @property
    def is_valid(self) -> bool:
        return not self.suppressed and self.position_size > 0


@dataclass
class RiskBudget:
    """Tracks intra-day risk consumption across all open trades."""
    account: AccountProfile
    realized_loss_today: float = 0.0
    open_risk: float = 0.0

    @property
    def daily_budget_remaining(self) -> float:
        return self.account.max_daily_loss - self.realized_loss_today - self.open_risk

    @property
    def can_take_trade(self) -> bool:
        return self.daily_budget_remaining > self.account.min_risk_per_trade

    def reserve(self, risk_dollars: float) -> bool:
        if risk_dollars > self.daily_budget_remaining:
            return False
        self.open_risk += risk_dollars
        return True

    def release(self, risk_dollars: float):
        self.open_risk = max(0.0, self.open_risk - risk_dollars)

    def record_loss(self, loss_dollars: float):
        self.realized_loss_today += abs(loss_dollars)


# ─── Core scoring algorithm ─────────────────────────────────────────────────

def compute_stop_and_target(
    entry_price: float,
    direction: str,
    asset_class: AssetClass,
    atr: float | None = None,
    invalidation_level: float | None = None,
) -> tuple[float, float, float, float]:
    """Compute stop loss and take profit for a trade setup.

    Uses ATR-based stops when available, otherwise falls back to
    percentage-based stops within the config bounds.

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


def compute_position_size(
    account: AccountProfile,
    entry_price: float,
    stop_loss: float,
    confidence: int,
) -> tuple[float, float, float]:
    """Calculate position size in shares/units and dollar risk.

    Scales risk between min_risk_per_trade_pct and risk_per_trade_pct
    based on confidence: 70 confidence = min risk, 95+ = max risk.

    Returns: (shares, position_value, risk_dollars)
    """
    risk_per_share = abs(entry_price - stop_loss)
    if risk_per_share <= 0:
        return 0.0, 0.0, 0.0

    conf_scale = max(0.0, min(1.0, (confidence - 70) / 25))
    risk_pct = (
        account.min_risk_per_trade_pct
        + conf_scale * (account.risk_per_trade_pct - account.min_risk_per_trade_pct)
    )
    risk_dollars = account.account_size * (risk_pct / 100)

    shares = risk_dollars / risk_per_share
    position_value = shares * entry_price

    return round(shares, 4), round(position_value, 2), round(risk_dollars, 2)


def score_setup(
    direction: str,
    asset_class: AssetClass | str,
    entry_price: float,
    confidence: int,
    account: AccountProfile | None = None,
    budget: RiskBudget | None = None,
    atr: float | None = None,
    invalidation_level: float | None = None,
) -> TradeSetup:
    """Score a potential trade setup against prop firm risk rules.

    This is the main entry point. It:
    1. Computes stop/target with symmetric R:R
    2. Sizes the position to risk 0.25-0.5% of the account
    3. Checks if the trade fits within the daily loss budget
    4. Returns SUPPRESSED if any rule is violated
    """
    if account is None:
        account = DEFAULT_ACCOUNT
    if isinstance(asset_class, str):
        asset_class = AssetClass(asset_class)

    if direction not in ("BUY", "SELL"):
        return TradeSetup(
            direction=direction,
            asset_class=asset_class,
            entry_price=entry_price,
            stop_loss=0, take_profit=0,
            position_size=0, position_value=0,
            risk_dollars=0, reward_dollars=0,
            risk_reward_ratio=0, stop_pct=0, target_pct=0,
            suppressed=True,
            suppression_reason="HOLD signals have no trade setup",
        )

    stop_loss, take_profit, stop_pct, target_pct = compute_stop_and_target(
        entry_price, direction, asset_class, atr=atr,
        invalidation_level=invalidation_level,
    )

    rr_ratio = target_pct / stop_pct if stop_pct > 0 else 0
    config = RR_CONFIGS[asset_class]

    if rr_ratio < config.min_rr:
        return TradeSetup(
            direction=direction, asset_class=asset_class,
            entry_price=entry_price, stop_loss=stop_loss,
            take_profit=take_profit, position_size=0,
            position_value=0, risk_dollars=0, reward_dollars=0,
            risk_reward_ratio=rr_ratio, stop_pct=stop_pct,
            target_pct=target_pct, suppressed=True,
            suppression_reason=(
                f"R:R {rr_ratio:.1f}:1 below minimum {config.min_rr}:1"
            ),
        )

    shares, position_value, risk_dollars = compute_position_size(
        account, entry_price, stop_loss, confidence,
    )

    reward_dollars = shares * abs(entry_price - take_profit) if shares > 0 else 0

    # Check daily loss budget
    if risk_dollars > account.max_daily_loss:
        return TradeSetup(
            direction=direction, asset_class=asset_class,
            entry_price=entry_price, stop_loss=stop_loss,
            take_profit=take_profit, position_size=0,
            position_value=0, risk_dollars=risk_dollars,
            reward_dollars=0, risk_reward_ratio=rr_ratio,
            stop_pct=stop_pct, target_pct=target_pct,
            suppressed=True,
            suppression_reason=(
                f"Risk ${risk_dollars:.0f} exceeds daily loss limit "
                f"${account.max_daily_loss:.0f}"
            ),
        )

    if budget is not None and not budget.can_take_trade:
        return TradeSetup(
            direction=direction, asset_class=asset_class,
            entry_price=entry_price, stop_loss=stop_loss,
            take_profit=take_profit, position_size=0,
            position_value=0, risk_dollars=risk_dollars,
            reward_dollars=reward_dollars,
            risk_reward_ratio=rr_ratio, stop_pct=stop_pct,
            target_pct=target_pct, suppressed=True,
            suppression_reason=(
                f"Daily risk budget exhausted — "
                f"${budget.daily_budget_remaining:.0f} remaining, "
                f"need ${risk_dollars:.0f}"
            ),
        )

    if budget is not None:
        if not budget.reserve(risk_dollars):
            return TradeSetup(
                direction=direction, asset_class=asset_class,
                entry_price=entry_price, stop_loss=stop_loss,
                take_profit=take_profit, position_size=0,
                position_value=0, risk_dollars=risk_dollars,
                reward_dollars=reward_dollars,
                risk_reward_ratio=rr_ratio, stop_pct=stop_pct,
                target_pct=target_pct, suppressed=True,
                suppression_reason=(
                    f"Would exceed open risk cap — "
                    f"${budget.daily_budget_remaining:.0f} budget remaining"
                ),
            )

    max_contracts = None
    if asset_class == AssetClass.OPTIONS:
        contract_risk = entry_price * 100 * (stop_pct)
        max_contracts = max(1, int(risk_dollars / contract_risk)) if contract_risk > 0 else 0

    setup = TradeSetup(
        direction=direction,
        asset_class=asset_class,
        entry_price=entry_price,
        stop_loss=stop_loss,
        take_profit=take_profit,
        position_size=round(shares, 4),
        position_value=round(position_value, 2),
        risk_dollars=round(risk_dollars, 2),
        reward_dollars=round(reward_dollars, 2),
        risk_reward_ratio=round(rr_ratio, 2),
        stop_pct=round(stop_pct * 100, 2),
        target_pct=round(target_pct * 100, 2),
        max_contracts=max_contracts,
    )

    logger.debug(
        "risk_engine: {} {} @ ${:.2f} → SL ${:.2f} ({:.1f}%) / "
        "TP ${:.2f} ({:.1f}%) / {:.1f} shares / risk ${:.0f} / "
        "R:R {:.1f}:1",
        direction, asset_class.value, entry_price,
        stop_loss, stop_pct * 100, take_profit, target_pct * 100,
        shares, risk_dollars, rr_ratio,
    )

    return setup


# ─── Resolution thresholds derived from trade setups ─────────────────────────

def get_symmetric_resolution_thresholds(
    asset_class: AssetClass | str,
) -> tuple[float, float]:
    """Return (win_threshold, loss_threshold) as decimals for the resolver.

    These are SYMMETRIC — same magnitude in both directions — derived from
    the R:R config's stop range midpoint. This replaces the old asymmetric
    thresholds that inflated win rates.
    """
    if isinstance(asset_class, str):
        asset_class = AssetClass(asset_class)

    config = RR_CONFIGS[asset_class]

    if config.is_premium_based:
        mid_stop = config.min_stop_pct / 100
    else:
        mid_stop = (config.min_stop_pct + config.max_stop_pct) / 2 / 100

    return mid_stop, mid_stop


# ─── Default account (used when no user profile is configured) ───────────────

DEFAULT_ACCOUNT = AccountProfile()


# ─── Formatting helpers (for signal output / newsletter) ─────────────────────

def format_trade_setup(setup: TradeSetup) -> dict:
    """Serialize a TradeSetup into the dict stored alongside a signal."""
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
    return base
