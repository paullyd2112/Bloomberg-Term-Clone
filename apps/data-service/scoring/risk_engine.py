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
from datetime import datetime
from enum import Enum
from typing import Literal

from loguru import logger


class AssetClass(str, Enum):
    STOCK = "stock"
    CRYPTO = "crypto"
    OPTIONS = "options"
    FUTURES = "futures"
    PREDICTION_MARKET = "prediction"


PROP_EXCLUDED_ASSETS = frozenset({AssetClass.PREDICTION_MARKET})


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

ETF_TO_CME_PROXY: dict[str, dict] = {
    "SPY": {"full": "ES", "micro": "MES", "full_pv": 50, "micro_pv": 5},
    "QQQ": {"full": "NQ", "micro": "MNQ", "full_pv": 20, "micro_pv": 2},
}

def translate_etf_to_futures(
    identifier: str,
    entry_price: float,
    stop_loss: float,
    take_profit: float,
    direction: str,
    risk_dollars: float,
) -> dict | None:
    """Translate an ETF breakout signal into equivalent CME futures contracts.

    Returns a dict with full and micro contract sizing, or None if the
    identifier has no CME proxy.
    """
    mapping = ETF_TO_CME_PROXY.get(identifier.upper())
    if mapping is None:
        return None

    stop_points = abs(entry_price - stop_loss)
    target_points = abs(entry_price - take_profit)
    if stop_points <= 0:
        return None

    result = {}
    for variant in ("full", "micro"):
        symbol = mapping[variant]
        pv = mapping[f"{variant}_pv"]
        contracts = math.floor(risk_dollars / (stop_points * pv))
        result[variant] = {
            "symbol": symbol,
            "point_value": pv,
            "contracts": contracts,
            "risk_per_contract": round(stop_points * pv, 2),
            "reward_per_contract": round(target_points * pv, 2),
            "total_risk": round(contracts * stop_points * pv, 2),
            "total_reward": round(contracts * target_points * pv, 2),
            "rejected": contracts <= 0,
        }

    return result

# ─── Slippage friction buffer (10% haircut on nominal risk) ──────────────────
# Production guardrail: assume 10% slippage/fees on every entry so position
# sizing never relies on perfect fills. Each profile's effective risk per trade
# is 90% of the nominal value.
SLIPPAGE_FRICTION_PCT = 0.10
EFFECTIVE_RISK: dict[str, float] = {
    name: round(p["risk_per_trade_dollar"] * (1 - SLIPPAGE_FRICTION_PCT), 2)
    for name, p in PROP_RISK_MATRIX.items()
}


# ─── Subscription tier gating ────────────────────────────────────────────────

class SubscriptionTier(str, Enum):
    PRO = "pro"
    LIFETIME_PRO = "lifetime_pro"
    ELITE = "elite"
    LIFETIME_ELITE = "lifetime_elite"


PRO_TIERS = frozenset({SubscriptionTier.PRO, SubscriptionTier.LIFETIME_PRO})
ELITE_TIERS = frozenset({SubscriptionTier.ELITE, SubscriptionTier.LIFETIME_ELITE})

PRO_ALLOWED_ASSETS = frozenset({AssetClass.STOCK, AssetClass.CRYPTO})
ELITE_ALLOWED_ASSETS = frozenset({
    AssetClass.STOCK, AssetClass.CRYPTO, AssetClass.OPTIONS,
    AssetClass.FUTURES, AssetClass.PREDICTION_MARKET,
})


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
    AssetClass.PREDICTION_MARKET: RiskRewardConfig(
        min_rr=2.0, max_rr=5.0,
        min_stop_pct=10.0, max_stop_pct=100.0,
        is_premium_based=True,
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
    futures_proxy: dict | None = None

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


def compute_prediction_contracts(
    risk_dollars: float,
    entry_price: float,
    stop_loss: float,
) -> int:
    """Binary event contracts: premium between $0.00 and $1.00, each worth $1.

    If stop_loss is $0.00 (hold-to-settlement), the entire entry premium is at
    risk: contracts = floor(risk_dollars / entry_price).
    Otherwise: contracts = floor(risk_dollars / (entry_price - stop_loss)).
    """
    if stop_loss <= 0:
        if entry_price <= 0:
            return 0
        return math.floor(risk_dollars / entry_price)
    premium_risk = abs(entry_price - stop_loss)
    if premium_risk <= 0:
        return 0
    return math.floor(risk_dollars / premium_risk)


# ─── Production guardrails ─────────────────────────────────────────────────

def is_after_market_cutoff() -> bool:
    """Block signals after 3:30 PM EST (19:30 UTC during EDT, 20:30 during EST).
    Returns True if current time is past cutoff."""
    from zoneinfo import ZoneInfo
    now_et = datetime.now(ZoneInfo("America/New_York"))
    cutoff = now_et.replace(hour=15, minute=30, second=0, microsecond=0)
    return now_et >= cutoff


def check_zero_unit_rejection(units: float, contracts: int | None, asset_class: AssetClass) -> str | None:
    """Returns rejection reason if position resolves to zero, else None."""
    if asset_class in (AssetClass.OPTIONS, AssetClass.FUTURES, AssetClass.PREDICTION_MARKET):
        if contracts is not None and contracts <= 0:
            return f"Zero contracts after sizing — risk too small for {asset_class.value}"
    else:
        if units <= 0:
            return f"Zero units after sizing — risk too small for {asset_class.value}"
    return None


CONFIDENCE_MINIMUM = 75


def check_confidence_gate(confidence_score: int) -> str | None:
    """Returns rejection reason if confidence below threshold, else None."""
    if confidence_score < CONFIDENCE_MINIMUM:
        return f"Confidence {confidence_score} below minimum {CONFIDENCE_MINIMUM}"
    return None


def get_effective_risk(profile_name: str) -> float:
    """Return the slippage-buffered risk dollar amount for a profile."""
    return EFFECTIVE_RISK[profile_name]


def filter_by_subscription(
    asset_class: AssetClass,
    subscription: SubscriptionTier | str,
) -> str | None:
    """Returns rejection reason if the asset is not available for this subscription tier.
    Returns None if allowed."""
    if isinstance(subscription, str):
        subscription = SubscriptionTier(subscription)

    if subscription in PRO_TIERS:
        if asset_class not in PRO_ALLOWED_ASSETS:
            return (
                f"{asset_class.value} not available on Pro tier — "
                f"upgrade to Elite for options, futures, and event contracts"
            )
    return None


# ─── XML payload builder ──────────────────────────────────────────────────────

def build_batch_xml_payload(
    asset_class: AssetClass,
    identifier: str,
    entry_price: float,
    direction: str,
    profile_name: str,
    macro_context: dict | None = None,
    asset_health: dict | None = None,
) -> str:
    """Build structured XML payload for LLM batch scoring context."""
    mc = macro_context or {}
    ah = asset_health or {}
    eff_risk = get_effective_risk(profile_name)
    profile = PROP_RISK_MATRIX[profile_name]

    vix = mc.get("vix", "N/A")
    sp500 = mc.get("sp500_price", "N/A")
    sp500_trend = mc.get("sp500_trend", "neutral")
    crypto_funding = mc.get("crypto_funding_rate", "N/A")
    high_impact = mc.get("high_impact_news_day", False)

    rvol = ah.get("rvol", "N/A")
    pe_ratio = ah.get("pe_ratio", "N/A")
    days_to_earnings = ah.get("days_to_earnings", "N/A")
    uoa_multiplier = ah.get("uoa_vol_oi_multiplier", "N/A")

    xml = f"""<batch_signal>
  <asset_class>{asset_class.value}</asset_class>
  <identifier>{identifier}</identifier>
  <entry_price>{entry_price}</entry_price>
  <direction>{direction}</direction>
  <macro_framework>
    <vix_status>{vix}</vix_status>
    <sp500_price>{sp500}</sp500_price>
    <sp500_trend_structure>{sp500_trend}</sp500_trend_structure>
    <crypto_funding_rates>{crypto_funding}</crypto_funding_rates>
    <high_impact_news_day>{str(high_impact).lower()}</high_impact_news_day>
  </macro_framework>
  <asset_health>
    <rvol>{rvol}</rvol>
    <pe_ratio>{pe_ratio}</pe_ratio>
    <days_until_earnings>{days_to_earnings}</days_until_earnings>
    <uoa_vol_oi_multiplier>{uoa_multiplier}</uoa_vol_oi_multiplier>
  </asset_health>
  <tier_safety_bounds>
    <profile>{profile_name}</profile>
    <nominal_risk>${profile['risk_per_trade_dollar']}</nominal_risk>
    <effective_risk_after_slippage>${eff_risk}</effective_risk_after_slippage>
    <max_daily_loss>${profile['max_daily_loss']}</max_daily_loss>
    <max_drawdown>${profile['max_overall_drawdown']}</max_drawdown>
    <symmetric_reward_target>${eff_risk * RR_CONFIGS[asset_class].min_rr}</symmetric_reward_target>
  </tier_safety_bounds>
</batch_signal>"""
    return xml


# ─── Static examples for system prompt ────────────────────────────────────────

STATIC_EXAMPLES_XML = """<examples>
  <winning_momentum_trades>
    <trade id="1">
      <ticker>NVDA</ticker>
      <direction>BUY</direction>
      <entry>$131.42</entry>
      <stop>$128.50</stop>
      <target>$137.26</target>
      <context>RSI 58 rising, MACD hist expanding positive, RVOL 2.1x, above SMA-50 by 4.2%</context>
      <outcome>HIT TARGET +4.4% in 2 days — momentum continuation after AI earnings beat</outcome>
    </trade>
    <trade id="2">
      <ticker>META</ticker>
      <direction>BUY</direction>
      <entry>$512.80</entry>
      <stop>$502.50</stop>
      <target>$533.40</target>
      <context>RSI 62, BB %B 0.78, earnings whisper +3.2% above consensus, UOA call sweep 4.1x OI</context>
      <outcome>HIT TARGET +4.0% in 3 days — pre-earnings momentum with institutional flow confirmation</outcome>
    </trade>
    <trade id="3">
      <ticker>SOL</ticker>
      <direction>BUY</direction>
      <entry>$178.50</entry>
      <stop>$170.00</stop>
      <target>$195.50</target>
      <context>RSI 55 from oversold bounce, BTC regime bullish, funding rates neutral, RVOL 1.8x</context>
      <outcome>HIT TARGET +9.5% in 5 days — altcoin rotation following BTC breakout above 70k</outcome>
    </trade>
  </winning_momentum_trades>
  <failed_chop_trades>
    <trade id="4">
      <ticker>TSLA</ticker>
      <direction>BUY</direction>
      <entry>$248.90</entry>
      <stop>$243.10</stop>
      <target>$260.50</target>
      <context>RSI 52, MACD hist flat near zero, BB %B 0.51, no catalyst, RVOL 0.7x</context>
      <outcome>STOPPED OUT -2.3% — no directional conviction in range-bound chop, low volume confirmed no follow-through</outcome>
    </trade>
    <trade id="5">
      <ticker>AAPL</ticker>
      <direction>SELL</direction>
      <entry>$189.20</entry>
      <stop>$193.40</stop>
      <target>$180.80</target>
      <context>RSI 47, SPY +2.1% above SMA-50, MACD hist contracting but still positive, earnings in 8 days</context>
      <outcome>STOPPED OUT +2.2% — faded a stock in neutral territory during a broad uptrend, earnings bid lifted it</outcome>
    </trade>
    <trade id="6">
      <ticker>ETH</ticker>
      <direction>SELL</direction>
      <entry>$3,420</entry>
      <stop>$3,520</stop>
      <target>$3,220</target>
      <context>RSI 44, BTC regime neutral-bullish, funding rates slightly positive, RVOL 0.9x</context>
      <outcome>STOPPED OUT +2.9% — sold into support during BTC accumulation phase, alt rotation squeezed shorts</outcome>
    </trade>
  </failed_chop_trades>
</examples>"""


# ─── Tier-filtered output ──────────────────────────────────────────────────

class Tier(str, Enum):
    STANDARD = "standard"
    ELITE = "elite"


def format_trade_setup_tiered(setup: "TradeSetup", tier: Tier = Tier.ELITE) -> dict:
    """Format trade setup filtered by membership tier.

    Standard: raw entry/stop/target only (Layer 1).
    Elite: full dual-layer output with all profile allocations.
    """
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
    }

    if tier == Tier.STANDARD:
        return base

    base["position_size"] = setup.position_size
    base["position_value"] = setup.position_value
    base["risk_dollars"] = setup.risk_dollars
    base["reward_dollars"] = setup.reward_dollars
    if setup.max_contracts is not None:
        base["max_contracts"] = setup.max_contracts
    if setup.allocations:
        base["profile_allocations"] = setup.allocations
    return base


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
    identifier: str | None = None,
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

    is_prop_excluded = asset_class in PROP_EXCLUDED_ASSETS
    if is_prop_excluded:
        eligible_profiles = {"retail_standard": PROP_RISK_MATRIX["retail_standard"]}
    else:
        eligible_profiles = PROP_RISK_MATRIX

    allocations: dict[str, ProfileAllocation] = {}

    if is_prop_excluded:
        for name in PROP_RISK_MATRIX:
            if name != "retail_standard":
                allocations[name] = ProfileAllocation(
                    profile_name=name, units=0, position_value=0,
                    risk_dollars=0, reward_dollars=0,
                    suppressed=True,
                    suppression_reason=(
                        f"Prop firms do not support {asset_class.value} contracts"
                    ),
                )

    for name, profile in eligible_profiles.items():
        risk_dollars = EFFECTIVE_RISK[name]

        if asset_class == AssetClass.PREDICTION_MARKET:
            contracts = compute_prediction_contracts(
                risk_dollars, entry_price, stop_loss,
            )
            position_value = round(contracts * entry_price, 2)
            reward_dollars = round(contracts * abs(entry_price - take_profit), 2)
            allocations[name] = ProfileAllocation(
                profile_name=name,
                units=float(contracts),
                position_value=position_value,
                risk_dollars=round(risk_dollars, 2),
                reward_dollars=reward_dollars,
                contracts=contracts,
            )
            continue

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

        zero_reason = check_zero_unit_rejection(units, contracts, asset_class)
        if zero_reason:
            allocations[name] = ProfileAllocation(
                profile_name=name, units=0, position_value=0,
                risk_dollars=round(risk_dollars, 2), reward_dollars=0,
                suppressed=True,
                suppression_reason=zero_reason,
            )
            continue

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

    futures_proxy = None
    if identifier and asset_class == AssetClass.STOCK:
        elite_risk = EFFECTIVE_RISK.get("150k_prop_boss", 0)
        futures_proxy = translate_etf_to_futures(
            identifier, entry_price, stop_loss, take_profit,
            direction, elite_risk,
        )

    return DualLayerSetup(alpha=alpha, allocations=allocations, futures_proxy=futures_proxy)


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
    futures_proxy: dict | None = None

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
    identifier: str | None = None,
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
        identifier=identifier,
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
        futures_proxy=dual.futures_proxy,
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
    if setup.futures_proxy:
        base["futures_proxy"] = setup.futures_proxy
    return base
