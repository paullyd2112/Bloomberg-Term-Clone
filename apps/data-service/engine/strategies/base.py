"""
Base strategy interface and shared position-sizing logic.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional

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


@dataclass
class Signal:
    strategy_id: str
    ticker: str
    asset_class: str
    direction: str  # "BUY" or "SELL"
    entry_price: float
    stop_loss: float
    take_profit: float
    confidence: float = 0.0
    metadata: Optional[dict] = None


def compute_position_sizes(signal: Signal) -> dict[str, float]:
    """Compute position size (shares/contracts) for each profile tier
    such that max loss equals risk_per_trade_dollar."""
    risk_per_unit = abs(signal.entry_price - signal.stop_loss)
    if risk_per_unit <= 0:
        return {name: 0 for name in PROP_RISK_MATRIX}

    sizes = {}
    for name, profile in PROP_RISK_MATRIX.items():
        max_risk = profile["risk_per_trade_dollar"]

        if signal.asset_class == "options":
            # Options: risk is premium paid, cap at risk_per_trade_dollar
            # size = number of contracts where total premium risk <= max_risk
            premium_risk_per_contract = signal.entry_price * 100  # standard 100 multiplier
            if premium_risk_per_contract <= 0:
                sizes[name] = 0
            else:
                sizes[name] = int(max_risk / premium_risk_per_contract)
        else:
            # Spot/crypto/futures: size = risk_dollars / risk_per_unit
            sizes[name] = round(max_risk / risk_per_unit, 4)

    return sizes


class BaseStrategy(ABC):
    @abstractmethod
    def scan(self, data: dict) -> list[Signal]:
        """Scan input data and return validated signals."""
        ...

    @property
    @abstractmethod
    def strategy_id(self) -> str:
        ...
