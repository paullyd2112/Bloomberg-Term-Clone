"""
Corporate actions ingestion — Alpaca Corporate Actions API.
Pulls upcoming/recent splits, dividends, spinoffs, and mergers for the
default watchlist. Runs daily via scheduler.

NOTE: field extraction below is based on Alpaca's documented Corporate
Actions API response shape. The full raw item is always stored in the
`raw` column, so if Alpaca's actual field names differ slightly for a
given action type, the data isn't lost — just re-derive the flat
columns from `raw` once verified against a live response.
"""

from datetime import date

from loguru import logger
import sentry_sdk

from supabase_client import supabase
from ingestion.alpaca_client import fetch_corporate_actions
from ingestion.stocks import get_default_watchlist


def _first(item: dict, *keys: str):
    for k in keys:
        if item.get(k) is not None:
            return item[k]
    return None


def _parse_date(value) -> str | None:
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10]).isoformat()
    except (ValueError, TypeError):
        return None


def _normalize(item: dict) -> dict | None:
    ticker = _first(item, "symbol", "ticker")
    if not ticker:
        return None

    return {
        "ticker":           str(ticker).upper(),
        "ca_type":          item.get("ca_type", "unknown"),
        "ex_date":          _parse_date(_first(item, "ex_date")),
        "record_date":      _parse_date(_first(item, "record_date")),
        "payable_date":     _parse_date(_first(item, "payable_date", "pay_date")),
        "declaration_date": _parse_date(_first(item, "declaration_date", "announced_date")),
        "cash_amount":      _first(item, "cash", "rate", "cash_amount"),
        "old_rate":         _first(item, "old_rate"),
        "new_rate":         _first(item, "new_rate"),
        "raw":              item,
    }


def _get_existing_keys(tickers: list[str]) -> set[tuple]:
    try:
        result = (
            supabase.table("corporate_actions")
            .select("ticker, ca_type, ex_date")
            .in_("ticker", tickers)
            .execute()
        )
        return {(r["ticker"], r["ca_type"], r["ex_date"]) for r in (result.data or [])}
    except Exception as e:
        logger.warning("corporate_actions: failed to fetch existing keys — {}", e)
        return set()


def ingest_corporate_actions() -> str:
    tickers = get_default_watchlist()
    if not tickers:
        return "no tracked tickers"

    raw_items = fetch_corporate_actions(tickers)
    if not raw_items:
        msg = "0 inserted — Alpaca returned no corporate actions"
        logger.info("corporate_actions: {}", msg)
        return msg

    rows = [r for r in (_normalize(item) for item in raw_items) if r]
    existing = _get_existing_keys(tickers)
    new_rows = [r for r in rows if (r["ticker"], r["ca_type"], r["ex_date"]) not in existing]

    if not new_rows:
        return f"0 inserted (all duplicates) [{len(rows)} fetched]"

    try:
        supabase.table("corporate_actions").insert(new_rows).execute()
        logger.info("corporate_actions: inserted {} new ({} fetched)", len(new_rows), len(rows))
        return f"{len(new_rows)} inserted ({len(rows)} fetched)"
    except Exception as e:
        logger.error("corporate_actions: insert failed — {}", e)
        sentry_sdk.capture_exception(e)
        return f"insert error: {e}"
