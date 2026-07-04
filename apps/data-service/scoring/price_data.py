"""
Shared raw_prices access for scoring paths.

streaming/alpaca_ws.py flushes live prices to raw_prices every 60 seconds
with metadata = {source, updated_at} ONLY. Naively taking the newest row
per ticker therefore returns a row with no technical indicators and a None
change_24h whenever a ticker is being streamed — which silently blinded
the scoring prompt's technicals and every deterministic gate built on them
(gap circuit breaker, SPY/BTC regime gates, breadth cap, evidence gate),
while backtests — which compute indicators directly from OHLCV — never saw
the problem. This module merges the freshest price with the newest
indicator-bearing metadata so scoring sees both.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from loguru import logger

from supabase_client import supabase

# Indicators older than this are treated as missing rather than silently
# used — long enough to span a holiday long-weekend, short enough that we
# never score August prices against May's MACD.
INDICATOR_MAX_AGE_DAYS = 5


def get_scoring_price_row(asset_type: str, identifier: str) -> dict | None:
    """Latest raw_prices row for scoring, with indicator-bearing metadata.

    For stocks/crypto: if the newest row is a thin live-stream row (no
    rsi_14 in metadata), pull the newest row that HAS indicators (within
    INDICATOR_MAX_AGE_DAYS) and merge — price/volume/change_24h from the
    fresher row where present, indicators from the indicator row. If no
    indicator row exists in the window, the thin row is returned as-is and
    the caller's data-quality gate decides what to do.
    """
    try:
        result = (
            supabase.table("raw_prices")
            .select("*")
            .eq("asset_type", asset_type)
            .eq("identifier", identifier)
            .order("captured_at", desc=True)
            .limit(1)
            .execute()
        )
    except Exception as e:
        logger.warning("price_data: latest-row fetch failed for {}/{}: {}", asset_type, identifier, e)
        return None
    if not result.data:
        return None
    latest = result.data[0]

    if asset_type not in ("stock", "crypto"):
        return latest

    meta = latest.get("metadata") or {}
    if meta.get("rsi_14") is not None:
        return latest

    cutoff = (datetime.now(timezone.utc) - timedelta(days=INDICATOR_MAX_AGE_DAYS)).isoformat()
    try:
        ind_result = (
            supabase.table("raw_prices")
            .select("*")
            .eq("asset_type", asset_type)
            .eq("identifier", identifier)
            .filter("metadata->rsi_14", "not.is", "null")
            .gte("captured_at", cutoff)
            .order("captured_at", desc=True)
            .limit(1)
            .execute()
        )
    except Exception as e:
        logger.warning("price_data: indicator-row fetch failed for {}/{}: {}", asset_type, identifier, e)
        return latest
    if not ind_result.data:
        logger.debug("price_data: {}/{} has no indicator row within {}d — returning thin row",
                     asset_type, identifier, INDICATOR_MAX_AGE_DAYS)
        return latest

    merged = dict(ind_result.data[0])
    if latest.get("price") is not None:
        merged["price"] = latest["price"]
    if latest.get("volume") is not None:
        merged["volume"] = latest["volume"]
    if latest.get("change_24h") is not None:
        merged["change_24h"] = latest["change_24h"]
    return merged
