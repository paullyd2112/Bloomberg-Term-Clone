"""
Module A — Prediction Market Decoupling Strategy

Scans Polymarket/Kalshi probability feeds against correlated spot assets.
Triggers a signal ONLY when an event probability shifts >=15% within a
rolling 2-hour window while the underlying asset price remains stagnant
(< 1% move in same window).

Thesis: The prediction market is pricing in information that the spot
market hasn't reacted to yet. Trade the spot in the direction implied
by the probability shift.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional

from .base import BaseStrategy, Signal

PROB_SHIFT_THRESHOLD = 0.15  # 15% absolute probability change
PRICE_STAGNATION_THRESHOLD = 0.01  # underlying must move < 1%
ROLLING_WINDOW_HOURS = 2
MIN_VOLUME_USD = 50_000  # minimum market volume to filter noise

# Known correlations: prediction market event slug → underlying ticker
# Extend as new markets emerge
CORRELATION_MAP: dict[str, dict] = {
    "bitcoin-above": {"ticker": "BTC/USD", "asset_class": "crypto", "direction_on_yes_up": "BUY"},
    "btc-above": {"ticker": "BTC/USD", "asset_class": "crypto", "direction_on_yes_up": "BUY"},
    "ethereum-above": {"ticker": "ETH/USD", "asset_class": "crypto", "direction_on_yes_up": "BUY"},
    "eth-above": {"ticker": "ETH/USD", "asset_class": "crypto", "direction_on_yes_up": "BUY"},
    "spy-above": {"ticker": "SPY", "asset_class": "stock", "direction_on_yes_up": "BUY"},
    "sp500-above": {"ticker": "SPY", "asset_class": "stock", "direction_on_yes_up": "BUY"},
    "nasdaq-above": {"ticker": "QQQ", "asset_class": "stock", "direction_on_yes_up": "BUY"},
    "fed-rate-cut": {"ticker": "TLT", "asset_class": "stock", "direction_on_yes_up": "BUY"},
    "fed-rate-hike": {"ticker": "TLT", "asset_class": "stock", "direction_on_yes_up": "SELL"},
    "tesla-above": {"ticker": "TSLA", "asset_class": "stock", "direction_on_yes_up": "BUY"},
    "nvidia-above": {"ticker": "NVDA", "asset_class": "stock", "direction_on_yes_up": "BUY"},
    "apple-above": {"ticker": "AAPL", "asset_class": "stock", "direction_on_yes_up": "BUY"},
    "gold-above": {"ticker": "GLD", "asset_class": "stock", "direction_on_yes_up": "BUY"},
    "oil-above": {"ticker": "USO", "asset_class": "stock", "direction_on_yes_up": "BUY"},
}


class PredictionMarketDecoupling(BaseStrategy):
    @property
    def strategy_id(self) -> str:
        return "pred_market_decoupling"

    def scan(self, data: dict) -> list[Signal]:
        """
        Expected data shape:
        {
            "prediction_markets": [
                {
                    "identifier": str,
                    "event_slug": str,
                    "title": str,
                    "current_yes_price": float,  # 0-1
                    "history": [{"timestamp": iso, "yes_price": float}, ...],
                    "volume": float,
                }
            ],
            "spot_prices": {
                "TICKER": {
                    "current_price": float,
                    "history": [{"timestamp": iso, "price": float}, ...],
                }
            }
        }
        """
        signals: list[Signal] = []
        markets = data.get("prediction_markets", [])
        spot = data.get("spot_prices", {})
        now = datetime.now(timezone.utc)
        window_start = now - timedelta(hours=ROLLING_WINDOW_HOURS)

        for market in markets:
            if (market.get("volume") or 0) < MIN_VOLUME_USD:
                continue

            event_slug = (market.get("event_slug") or "").lower()
            correlation = self._find_correlation(event_slug, market.get("title", ""))
            if not correlation:
                continue

            ticker = correlation["ticker"]
            if ticker not in spot:
                continue

            # Calculate probability shift in window
            prob_shift = self._calc_prob_shift(market, window_start)
            if prob_shift is None or abs(prob_shift) < PROB_SHIFT_THRESHOLD:
                continue

            # Check spot stagnation
            price_change = self._calc_price_change(spot[ticker], window_start)
            if price_change is None or abs(price_change) >= PRICE_STAGNATION_THRESHOLD:
                continue

            # Signal direction: if yes_price went up and correlation says BUY on yes_up
            if prob_shift > 0:
                direction = correlation["direction_on_yes_up"]
            else:
                direction = "SELL" if correlation["direction_on_yes_up"] == "BUY" else "BUY"

            current_price = spot[ticker]["current_price"]
            asset_class = correlation["asset_class"]

            # Symmetric exits: 2:1 R:R for spot
            if direction == "BUY":
                stop_loss = current_price * 0.99  # -1%
                take_profit = current_price * 1.02  # +2%
            else:
                stop_loss = current_price * 1.01  # +1% above
                take_profit = current_price * 0.98  # -2% below

            signals.append(Signal(
                strategy_id=self.strategy_id,
                ticker=ticker,
                asset_class=asset_class,
                direction=direction,
                entry_price=current_price,
                stop_loss=stop_loss,
                take_profit=take_profit,
                confidence=min(abs(prob_shift) / 0.30, 1.0),  # scale 15-30% shift → 0.5-1.0
                metadata={
                    "prob_shift": prob_shift,
                    "price_stagnation": price_change,
                    "market_title": market.get("title", ""),
                    "event_slug": event_slug,
                },
            ))

        return signals

    def _find_correlation(self, event_slug: str, title: str) -> Optional[dict]:
        for key, corr in CORRELATION_MAP.items():
            if key in event_slug or key in title.lower().replace(" ", "-"):
                return corr
        return None

    def _calc_prob_shift(self, market: dict, window_start: datetime) -> Optional[float]:
        history = market.get("history", [])
        if not history:
            return None

        current = market.get("current_yes_price")
        if current is None:
            return None

        oldest_in_window = None
        for point in history:
            ts = self._parse_ts(point.get("timestamp"))
            if ts and ts >= window_start:
                if oldest_in_window is None or ts < oldest_in_window[0]:
                    oldest_in_window = (ts, point.get("yes_price"))

        if oldest_in_window is None or oldest_in_window[1] is None:
            return None

        return current - oldest_in_window[1]

    def _calc_price_change(self, spot_data: dict, window_start: datetime) -> Optional[float]:
        current = spot_data.get("current_price")
        history = spot_data.get("history", [])
        if not current or not history:
            return None

        oldest_in_window = None
        for point in history:
            ts = self._parse_ts(point.get("timestamp"))
            if ts and ts >= window_start:
                if oldest_in_window is None or ts < oldest_in_window[0]:
                    oldest_in_window = (ts, point.get("price"))

        if oldest_in_window is None or oldest_in_window[1] is None or oldest_in_window[1] == 0:
            return None

        return (current - oldest_in_window[1]) / oldest_in_window[1]

    def _parse_ts(self, ts_str) -> Optional[datetime]:
        if not ts_str:
            return None
        try:
            if isinstance(ts_str, datetime):
                return ts_str
            return datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            return None
