"""
Module B — Institutional Consolidation Breakout Strategy

Identifies assets trapped in a tight 8-10% price consolidation channel for
15+ consecutive trading days with declining volume, then triggers a signal
ONLY when a candle closes outside the range on institutional Relative Volume
(RVOL) ratio >= 1.5x the 20-day average.

Stop-loss is placed strictly inside the broken range boundary to enforce
a clean 1:3 R:R profile.
"""

from dataclasses import dataclass
from typing import Optional

from .base import BaseStrategy, Signal

MIN_CONSOLIDATION_DAYS = 15
MIN_RANGE_PCT = 0.08  # 8% channel width minimum
MAX_RANGE_PCT = 0.10  # 10% channel width maximum
RVOL_THRESHOLD = 1.5  # 50% above 20-day average volume
VOLUME_LOOKBACK = 20
RR_RATIO = 3.0  # 1:3 risk-to-reward


@dataclass
class ConsolidationRange:
    high: float
    low: float
    days: int
    avg_volume_20d: float
    volume_declining: bool


class InstitutionalConsolidationBreakout(BaseStrategy):
    @property
    def strategy_id(self) -> str:
        return "institutional_consolidation_breakout"

    def scan(self, data: dict) -> list[Signal]:
        """
        Expected data shape:
        {
            "candles": {
                "TICKER": {
                    "asset_class": str,
                    "bars": [
                        {"date": str, "open": float, "high": float,
                         "low": float, "close": float, "volume": float},
                        ...  # oldest first, most recent last
                    ]
                }
            }
        }
        """
        signals: list[Signal] = []
        candles = data.get("candles", {})

        for ticker, ticker_data in candles.items():
            bars = ticker_data.get("bars", [])
            asset_class = ticker_data.get("asset_class", "stock")

            if len(bars) < MIN_CONSOLIDATION_DAYS + VOLUME_LOOKBACK:
                continue

            consolidation = self._detect_consolidation(bars[:-1])  # exclude breakout candle
            if not consolidation:
                continue

            breakout_bar = bars[-1]
            signal = self._check_breakout(
                ticker, asset_class, consolidation, breakout_bar
            )
            if signal:
                signals.append(signal)

        return signals

    def _detect_consolidation(self, bars: list[dict]) -> Optional[ConsolidationRange]:
        if len(bars) < MIN_CONSOLIDATION_DAYS + VOLUME_LOOKBACK:
            return None

        recent_bars = bars[-(MIN_CONSOLIDATION_DAYS + VOLUME_LOOKBACK):]
        consolidation_bars = recent_bars[VOLUME_LOOKBACK:]  # last 15+ days

        highs = [b["high"] for b in consolidation_bars]
        lows = [b["low"] for b in consolidation_bars]
        range_high = max(highs)
        range_low = min(lows)

        if range_low <= 0:
            return None

        range_pct = (range_high - range_low) / range_low
        if range_pct < MIN_RANGE_PCT or range_pct > MAX_RANGE_PCT:
            return None

        # All closes must stay within the range
        for bar in consolidation_bars:
            if bar["close"] > range_high or bar["close"] < range_low:
                return None

        # Volume must be declining: compare first half avg to second half avg
        volumes = [b["volume"] for b in consolidation_bars]
        mid = len(volumes) // 2
        first_half_avg = sum(volumes[:mid]) / max(mid, 1)
        second_half_avg = sum(volumes[mid:]) / max(len(volumes) - mid, 1)
        volume_declining = second_half_avg < first_half_avg

        if not volume_declining:
            return None

        # 20-day average volume for RVOL calculation
        vol_bars = recent_bars[:VOLUME_LOOKBACK]
        avg_volume_20d = sum(b["volume"] for b in vol_bars) / VOLUME_LOOKBACK

        return ConsolidationRange(
            high=range_high,
            low=range_low,
            days=len(consolidation_bars),
            avg_volume_20d=avg_volume_20d,
            volume_declining=True,
        )

    def _check_breakout(
        self,
        ticker: str,
        asset_class: str,
        consolidation: ConsolidationRange,
        breakout_bar: dict,
    ) -> Optional[Signal]:
        close = breakout_bar["close"]
        volume = breakout_bar["volume"]

        # RVOL check: breakout volume must be >= 1.5x the 20-day average
        if consolidation.avg_volume_20d <= 0:
            return None
        rvol = volume / consolidation.avg_volume_20d
        if rvol < RVOL_THRESHOLD:
            return None

        # Determine breakout direction
        if close > consolidation.high:
            direction = "BUY"
            entry = close
            # Stop inside the broken range boundary (just below the high)
            stop_loss = consolidation.high * 0.995  # 0.5% inside the range top
            risk = entry - stop_loss
            take_profit = entry + (risk * RR_RATIO)
        elif close < consolidation.low:
            direction = "SELL"
            entry = close
            # Stop inside the broken range boundary (just above the low)
            stop_loss = consolidation.low * 1.005  # 0.5% inside the range bottom
            risk = stop_loss - entry
            take_profit = entry - (risk * RR_RATIO)
        else:
            return None

        if risk <= 0:
            return None

        return Signal(
            strategy_id=self.strategy_id,
            ticker=ticker,
            asset_class=asset_class,
            direction=direction,
            entry_price=entry,
            stop_loss=stop_loss,
            take_profit=take_profit,
            confidence=min(rvol / 3.0, 1.0),  # scale 1.5-3.0 RVOL → 0.5-1.0
            metadata={
                "rvol": round(rvol, 2),
                "consolidation_days": consolidation.days,
                "range_high": consolidation.high,
                "range_low": consolidation.low,
                "range_pct": round((consolidation.high - consolidation.low) / consolidation.low, 4),
                "breakout_volume": volume,
                "avg_volume_20d": consolidation.avg_volume_20d,
            },
        )
