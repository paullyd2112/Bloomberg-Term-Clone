"""
Options flow ingestion — Alpaca options snapshots (indicative feed).
Pulls calls + puts for the default watchlist, flags unusual activity,
and upserts to options_flow.
Runs every 60 minutes weekdays 9am-5pm ET via scheduler.
"""

import time
from datetime import datetime, timedelta, timezone

import sentry_sdk
from loguru import logger

from supabase_client import supabase
from ingestion.alpaca_client import fetch_options_snapshots, parse_occ_symbol
from ingestion.stocks import get_default_watchlist

# Thresholds for flagging unusual activity
MIN_VOLUME          = 500       # ignore low-liquidity contracts
VOL_OI_RATIO_THRESH = 2.0       # volume is 2× open interest
BIG_PREMIUM_USD     = 500_000   # $500k+ notional regardless of ratio
CONTRACT_SIZE       = 100       # standard options contract = 100 shares
TICKER_DELAY_S      = 0.3
MAX_EXPIRIES        = 3         # only pull nearest N expiry dates per ticker


def _fetch_chain(ticker: str) -> list[dict]:
    """Return a flat list of option rows for the nearest MAX_EXPIRIES dates."""
    rows: list[dict] = []
    try:
        snapshots = fetch_options_snapshots(ticker, max_expiries=MAX_EXPIRIES)
        if not snapshots:
            return []

        parsed_by_symbol = {}
        for contract_symbol, snap in snapshots.items():
            parsed = parse_occ_symbol(contract_symbol)
            if parsed:
                parsed_by_symbol[contract_symbol] = parsed

        nearest_expiries = sorted({p["expiry"] for p in parsed_by_symbol.values()})[:MAX_EXPIRIES]
        allowed_expiries = set(nearest_expiries)

        for contract_symbol, parsed in parsed_by_symbol.items():
            if parsed["expiry"] not in allowed_expiries:
                continue

            snap         = snapshots[contract_symbol]
            daily_bar    = snap.get("dailyBar") or {}
            latest_trade = snap.get("latestTrade") or {}

            volume = int(daily_bar.get("v") or 0)
            oi     = int(snap.get("openInterest") or snap.get("open_interest") or 0)
            strike = parsed["strike"]

            if volume < MIN_VOLUME or strike <= 0:
                continue

            last_price   = float(latest_trade.get("p") or daily_bar.get("c") or 0)
            vol_oi_ratio = round(volume / oi, 4) if oi > 0 else None
            premium_usd  = round(volume * last_price * CONTRACT_SIZE, 2)

            is_unusual = (
                (vol_oi_ratio is not None and vol_oi_ratio >= VOL_OI_RATIO_THRESH)
                or premium_usd >= BIG_PREMIUM_USD
            )

            rows.append({
                "ticker":          ticker,
                "contract_type":   parsed["contract_type"],
                "strike":          strike,
                "expiry":          parsed["expiry"],
                "volume":          volume,
                "open_interest":   oi if oi > 0 else None,
                "volume_oi_ratio": vol_oi_ratio,
                "premium_usd":     premium_usd if premium_usd > 0 else None,
                "is_unusual":      is_unusual,
            })

    except Exception as e:
        logger.warning("options_flow: {} fetch error — {}", ticker, e)
        sentry_sdk.capture_exception(e)

    return rows


def _already_captured_today(ticker: str) -> bool:
    """True if we have options rows for this ticker captured in the last 90 min."""
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=90)).isoformat()
    try:
        result = (
            supabase.table("options_flow")
            .select("id", count="exact")
            .eq("ticker", ticker)
            .gte("captured_at", cutoff)
            .limit(1)
            .execute()
        )
        return (result.count or 0) > 0
    except Exception:
        return False


def ingest_options_flow() -> str:
    tickers      = get_default_watchlist()
    total_rows   = 0
    unusual_rows = 0
    skipped      = 0

    for ticker in tickers:
        if _already_captured_today(ticker):
            skipped += 1
            time.sleep(0.05)
            continue

        rows = _fetch_chain(ticker)

        if rows:
            try:
                supabase.table("options_flow").insert(rows).execute()
                ticker_unusual = sum(1 for r in rows if r["is_unusual"])
                total_rows   += len(rows)
                unusual_rows += ticker_unusual
                logger.debug(
                    "options_flow: {} — {} rows ({} unusual)",
                    ticker, len(rows), ticker_unusual,
                )
            except Exception as e:
                logger.error("options_flow: insert failed for {} — {}", ticker, e)
                sentry_sdk.capture_exception(e)

        time.sleep(TICKER_DELAY_S)

    summary = f"{total_rows} rows ({unusual_rows} unusual), {skipped} tickers skipped"
    logger.info("options_flow complete — {}", summary)
    return summary
