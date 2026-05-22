"""
Short interest ingestion — yfinance ticker.info.
Pulls short float %, short ratio, and shares short for the default watchlist.
Runs daily at 7:00am ET weekdays via scheduler.
"""

import time
from datetime import datetime, timedelta, timezone

import yfinance as yf
import sentry_sdk
from loguru import logger

from supabase_client import supabase
from ingestion.stocks import get_default_watchlist

HIGH_SHORT_THRESHOLD = 20.0   # short float % above this = high short interest
TICKER_DELAY_S       = 0.4


def _get_previous(ticker: str) -> float | None:
    """Return the most recent short_float_pct for this ticker, or None."""
    try:
        result = (
            supabase.table("short_interest")
            .select("short_float_pct")
            .eq("ticker", ticker)
            .order("captured_at", desc=True)
            .limit(1)
            .execute()
        )
        rows = result.data or []
        return float(rows[0]["short_float_pct"]) if rows and rows[0]["short_float_pct"] is not None else None
    except Exception:
        return None


def _vs_previous(current: float, previous: float | None) -> str | None:
    if previous is None:
        return None
    if current > previous * 1.01:
        return "up"
    if current < previous * 0.99:
        return "down"
    return "same"


def _fetch_short(ticker: str) -> dict | None:
    try:
        info = yf.Ticker(ticker).info

        short_float_raw = info.get("shortPercentOfFloat")
        short_ratio_raw = info.get("shortRatio")
        shares_short_raw = info.get("sharesShort")

        # shortPercentOfFloat comes as a decimal (0.05 = 5%)
        if short_float_raw is None:
            return None

        short_float_pct = round(float(short_float_raw) * 100, 2)
        short_ratio     = round(float(short_ratio_raw), 2) if short_ratio_raw else None
        shares_short    = int(shares_short_raw) if shares_short_raw else None

        return {
            "short_float_pct": short_float_pct,
            "short_ratio":     short_ratio,
            "shares_short":    shares_short,
        }

    except Exception as e:
        logger.debug("short_interest: {} fetch error — {}", ticker, e)
        return None


def ingest_short_interest() -> str:
    tickers   = get_default_watchlist()
    inserted  = 0
    skipped   = 0

    for ticker in tickers:
        data = _fetch_short(ticker)

        if data is None:
            skipped += 1
            time.sleep(TICKER_DELAY_S)
            continue

        short_float_pct = data["short_float_pct"]
        previous        = _get_previous(ticker)

        row = {
            "ticker":          ticker,
            "short_float_pct": short_float_pct,
            "short_ratio":     data["short_ratio"],
            "shares_short":    data["shares_short"],
            "vs_previous":     _vs_previous(short_float_pct, previous),
            "is_high_short":   short_float_pct >= HIGH_SHORT_THRESHOLD,
        }

        try:
            supabase.table("short_interest").insert(row).execute()
            inserted += 1
            logger.debug(
                "short_interest: {} — {:.1f}% short float{}",
                ticker,
                short_float_pct,
                " [HIGH]" if row["is_high_short"] else "",
            )
        except Exception as e:
            logger.error("short_interest: insert failed for {} — {}", ticker, e)
            sentry_sdk.capture_exception(e)

        time.sleep(TICKER_DELAY_S)

    summary = f"{inserted} inserted, {skipped} skipped"
    logger.info("short_interest complete — {}", summary)
    return summary
