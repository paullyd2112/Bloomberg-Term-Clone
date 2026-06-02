"""
Earnings ingestion — yfinance earnings calendar.
Pulls upcoming earnings dates, consensus EPS, and last quarter EPS
for the default watchlist. Runs daily at 6:00am ET weekdays.
"""

import time
from datetime import date, datetime, timedelta, timezone

import pandas as pd
import yfinance as yf
import sentry_sdk
from loguru import logger

from supabase_client import supabase
from ingestion.stocks import get_default_watchlist

LOOKAHEAD_DAYS = 30     # only store events within the next 30 days
TICKER_DELAY_S = 0.4


def _parse_report_time(raw: str | None) -> str | None:
    if not raw:
        return None
    low = str(raw).lower()
    if "before" in low or "bmo" in low or "pre" in low:
        return "before_market"
    if "after" in low or "amc" in low or "post" in low:
        return "after_market"
    return None


def _fetch_earnings(ticker: str) -> dict | None:
    try:
        t    = yf.Ticker(ticker)
        info = t.info

        # Try earnings_dates first — most detailed
        try:
            ed = t.earnings_dates
            if ed is not None and not ed.empty:
                # Filter to upcoming dates within lookahead window
                today    = date.today()
                cutoff   = today + timedelta(days=LOOKAHEAD_DAYS)
                upcoming = ed[
                    (ed.index.date >= today) &  # type: ignore[attr-defined]
                    (ed.index.date <= cutoff)   # type: ignore[attr-defined]
                ]
                if not upcoming.empty:
                    row         = upcoming.iloc[0]
                    report_date = upcoming.index[0].date()

                    eps_estimate = row.get("EPS Estimate")
                    reported_eps = row.get("Reported EPS")    # last quarter if already reported nearby
                    surprise_pct = row.get("Surprise(%)")

                    consensus_eps = float(eps_estimate) if pd.notna(eps_estimate) else None
                    last_eps      = float(reported_eps) if pd.notna(reported_eps) else None

                    # Fall back to info for last quarter EPS if not in earnings_dates
                    if last_eps is None:
                        trailing = info.get("trailingEps")
                        last_eps = float(trailing) if trailing else None

                    return {
                        "ticker":                    ticker,
                        "report_date":               report_date.isoformat(),
                        "report_time":               None,   # earnings_dates doesn't include time
                        "consensus_eps":             consensus_eps,
                        "whisper_eps":               None,   # not available from free sources
                        "whisper_vs_consensus_pct":  None,
                        "last_quarter_eps":          last_eps,
                    }
        except Exception:
            pass

        # Fallback: ticker.calendar
        try:
            cal = t.calendar
            if cal is not None and not cal.empty:
                today   = date.today()
                cutoff  = today + timedelta(days=LOOKAHEAD_DAYS)

                # calendar may have multiple rows — find the soonest upcoming date
                date_col = None
                for col in ("Earnings Date", "earningsDate"):
                    if col in cal.columns:
                        date_col = col
                        break

                if date_col:
                    dates = pd.to_datetime(cal[date_col], errors="coerce").dropna()
                    upcoming = dates[dates.dt.date >= today]
                    if not upcoming.empty:
                        report_date   = upcoming.iloc[0].date()
                        if report_date > cutoff:
                            return None

                        eps_avg = cal.get("Earnings Average")
                        consensus = float(eps_avg.iloc[0]) if eps_avg is not None and pd.notna(eps_avg.iloc[0]) else None

                        trailing  = info.get("trailingEps")
                        last_eps  = float(trailing) if trailing else None

                        return {
                            "ticker":                   ticker,
                            "report_date":              report_date.isoformat(),
                            "report_time":              None,
                            "consensus_eps":            consensus,
                            "whisper_eps":              None,
                            "whisper_vs_consensus_pct": None,
                            "last_quarter_eps":         last_eps,
                        }
        except Exception:
            pass

    except Exception as e:
        logger.debug("earnings: {} fetch error — {}", ticker, e)
        sentry_sdk.capture_exception(e)

    return None


def _already_stored(ticker: str, report_date: str) -> bool:
    try:
        result = (
            supabase.table("earnings_events")
            .select("id", count="exact")
            .eq("ticker", ticker)
            .eq("report_date", report_date)
            .limit(1)
            .execute()
        )
        return (result.count or 0) > 0
    except Exception:
        return False


def ingest_earnings() -> str:
    tickers  = get_default_watchlist()
    inserted = 0
    skipped  = 0

    for ticker in tickers:
        data = _fetch_earnings(ticker)

        if data is None:
            skipped += 1
            time.sleep(TICKER_DELAY_S)
            continue

        if _already_stored(ticker, data["report_date"]):
            skipped += 1
            time.sleep(0.05)
            continue

        try:
            supabase.table("earnings_events").insert(data).execute()
            inserted += 1
            logger.debug(
                "earnings: {} — {} (consensus EPS: {})",
                ticker,
                data["report_date"],
                data["consensus_eps"],
            )
        except Exception as e:
            logger.error("earnings: insert failed for {} — {}", ticker, e)
            sentry_sdk.capture_exception(e)

        time.sleep(TICKER_DELAY_S)

    summary = f"{inserted} inserted, {skipped} skipped"
    logger.info("earnings complete — {}", summary)
    return summary
