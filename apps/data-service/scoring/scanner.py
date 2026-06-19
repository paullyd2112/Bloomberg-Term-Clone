"""
Market Scanner — pre-screens stocks for technical setups before Claude scoring.

Instead of scoring every ticker in the watchlist (66 × $0.01 = $0.66/hour),
this filters down to only stocks showing actionable technical patterns.
Typical output: 5-15 stocks per scan, cutting Claude API costs 75-80%.

Runs on raw OHLCV + indicators already in Supabase — zero additional API cost.

Filters (must pass 2+ to qualify):
  - RSI extreme: < 30 (oversold) or > 70 (overbought)
  - MACD crossover: signal line cross within last 2 bars
  - Volume surge: > 2x 20-day average
  - Bollinger breakout: price outside upper or lower band
  - Gap move: > 3% open vs prior close
"""

from __future__ import annotations

from loguru import logger
from supabase_client import supabase


MIN_FILTERS_TO_QUALIFY = 2


def _check_rsi_extreme(meta: dict) -> str | None:
    rsi = meta.get("rsi_14")
    if rsi is None:
        return None
    if rsi < 30:
        return f"RSI oversold ({rsi:.1f})"
    if rsi > 70:
        return f"RSI overbought ({rsi:.1f})"
    return None


def _check_macd_crossover(meta: dict) -> str | None:
    hist = meta.get("macd_hist")
    prev_hist = meta.get("prev_macd_hist")
    if hist is None or prev_hist is None:
        return None
    if (hist > 0 and prev_hist <= 0):
        return "MACD bullish crossover"
    if (hist < 0 and prev_hist >= 0):
        return "MACD bearish crossover"
    return None


def _check_volume_surge(meta: dict) -> str | None:
    ratio = meta.get("volume_ratio")
    if ratio is None:
        return None
    if ratio > 2.0:
        return f"Volume surge ({ratio:.1f}x avg)"
    return None


def _check_bollinger_breakout(meta: dict) -> str | None:
    price = meta.get("price")
    bb_upper = meta.get("bb_upper")
    bb_lower = meta.get("bb_lower")
    if price is None or bb_upper is None or bb_lower is None:
        return None
    if price > bb_upper:
        return f"Above upper Bollinger ({price:.2f} > {bb_upper:.2f})"
    if price < bb_lower:
        return f"Below lower Bollinger ({price:.2f} < {bb_lower:.2f})"
    return None


def _check_gap_move(meta: dict) -> str | None:
    change = meta.get("change_24h")
    if change is None:
        return None
    if abs(change) > 3.0:
        direction = "up" if change > 0 else "down"
        return f"Gap {direction} ({change:+.1f}%)"
    return None


ALL_FILTERS = [
    _check_rsi_extreme,
    _check_macd_crossover,
    _check_volume_surge,
    _check_bollinger_breakout,
    _check_gap_move,
]


def scan_stocks(tickers: list[str] | None = None) -> list[dict]:
    """
    Pre-screen stocks from raw_prices for technical setups.
    Returns list of {ticker, triggers: [...], trigger_count} for stocks
    that pass MIN_FILTERS_TO_QUALIFY or more filters.
    """
    if tickers is None:
        from ingestion.stocks import get_default_watchlist
        tickers = get_default_watchlist()

    qualified: list[dict] = []

    for ticker in tickers:
        try:
            result = (
                supabase.table("raw_prices")
                .select("*")
                .eq("asset_type", "stock")
                .eq("identifier", ticker)
                .order("captured_at", desc=True)
                .limit(1)
                .execute()
            )
            if not result.data:
                continue

            row = result.data[0]
            meta = row.get("metadata") or {}
            meta["price"] = row.get("price")
            meta["change_24h"] = row.get("change_24h")

            triggers: list[str] = []
            for check in ALL_FILTERS:
                result_str = check(meta)
                if result_str:
                    triggers.append(result_str)

            if len(triggers) >= MIN_FILTERS_TO_QUALIFY:
                qualified.append({
                    "ticker": ticker,
                    "triggers": triggers,
                    "trigger_count": len(triggers),
                    "price": meta.get("price"),
                    "rsi": meta.get("rsi_14"),
                    "volume_ratio": meta.get("volume_ratio"),
                    "change_24h": meta.get("change_24h"),
                })

        except Exception as e:
            logger.debug("Scanner error for {}: {}", ticker, e)

    qualified.sort(key=lambda x: x["trigger_count"], reverse=True)
    logger.info(
        "Scanner: {}/{} stocks qualified with {}+ triggers",
        len(qualified), len(tickers), MIN_FILTERS_TO_QUALIFY,
    )
    return qualified


def get_scan_tickers(tickers: list[str] | None = None) -> list[str]:
    """
    Returns just the ticker list from a scan — drop-in replacement
    for get_default_watchlist() in score_stocks().
    """
    results = scan_stocks(tickers)
    return [r["ticker"] for r in results]
