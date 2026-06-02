"""
Congressional trades ingestion — Quiver Quant API.
Pulls House + Senate STOCK Act disclosures, deduplicates, upserts to congressional_trades.
Runs daily at 8:00am ET via scheduler.
"""

import os
from datetime import date, datetime, timedelta, timezone

import httpx
import sentry_sdk
from loguru import logger
from dotenv import load_dotenv

from supabase_client import supabase

load_dotenv()

QUIVER_KEY  = os.environ.get("QUIVER_API_KEY", "")
BASE_URL    = "https://api.quiverquant.com/beta"
HEADERS     = {"Authorization": f"Bearer {QUIVER_KEY}", "Accept": "application/json"}
# Pull trades reported in the last 90 days
LOOKBACK_DAYS = 90


def _normalize_transaction(raw: str) -> str | None:
    raw = (raw or "").lower()
    if "purchase" in raw:
        return "buy"
    if "sale" in raw or "sell" in raw:
        return "sell"
    return None


def _fetch_house() -> list[dict]:
    if not QUIVER_KEY:
        logger.warning("congressional: QUIVER_API_KEY not set — skipping house")
        return []
    try:
        resp = httpx.get(f"{BASE_URL}/live/housedisclosure", headers=HEADERS, timeout=30)
        resp.raise_for_status()
        return resp.json() or []
    except Exception as e:
        logger.error("congressional: house fetch failed — {}", e)
        sentry_sdk.capture_exception(e)
        return []


def _fetch_senate() -> list[dict]:
    if not QUIVER_KEY:
        return []
    try:
        resp = httpx.get(f"{BASE_URL}/live/senatedisclosure", headers=HEADERS, timeout=30)
        resp.raise_for_status()
        return resp.json() or []
    except Exception as e:
        logger.error("congressional: senate fetch failed — {}", e)
        sentry_sdk.capture_exception(e)
        return []


def _parse_house(records: list[dict]) -> list[dict]:
    cutoff = date.today() - timedelta(days=LOOKBACK_DAYS)
    rows = []
    for r in records:
        ticker = (r.get("Ticker") or "").strip().upper()
        if not ticker or ticker in ("--", "N/A"):
            continue

        txn = _normalize_transaction(r.get("Transaction", ""))
        if txn is None:
            continue

        trade_date_raw  = r.get("TransactionDate") or r.get("Date") or ""
        report_date_raw = r.get("ReportDate") or ""

        try:
            trade_date = date.fromisoformat(trade_date_raw[:10])
        except (ValueError, TypeError):
            continue

        if trade_date < cutoff:
            continue

        try:
            report_date = date.fromisoformat(report_date_raw[:10])
        except (ValueError, TypeError):
            report_date = None

        politician = (r.get("Representative") or r.get("Name") or "").strip()
        party      = (r.get("Party") or "").strip()

        rows.append({
            "politician":   politician,
            "party":        party,
            "ticker":       ticker,
            "transaction":  txn,
            "amount_range": (r.get("Range") or r.get("Amount") or "").strip(),
            "trade_date":   trade_date.isoformat(),
            "report_date":  report_date.isoformat() if report_date else None,
        })
    return rows


def _parse_senate(records: list[dict]) -> list[dict]:
    cutoff = date.today() - timedelta(days=LOOKBACK_DAYS)
    rows = []
    for r in records:
        ticker = (r.get("Ticker") or "").strip().upper()
        if not ticker or ticker in ("--", "N/A"):
            continue

        txn = _normalize_transaction(r.get("Transaction", ""))
        if txn is None:
            continue

        trade_date_raw  = r.get("TransactionDate") or r.get("Date") or ""
        report_date_raw = r.get("ReportDate") or ""

        try:
            trade_date = date.fromisoformat(trade_date_raw[:10])
        except (ValueError, TypeError):
            continue

        if trade_date < cutoff:
            continue

        try:
            report_date = date.fromisoformat(report_date_raw[:10])
        except (ValueError, TypeError):
            report_date = None

        politician = (r.get("Senator") or r.get("Name") or "").strip()
        party      = (r.get("Party") or "").strip()

        rows.append({
            "politician":   politician,
            "party":        party,
            "ticker":       ticker,
            "transaction":  txn,
            "amount_range": (r.get("Range") or r.get("Amount") or "").strip(),
            "trade_date":   trade_date.isoformat(),
            "report_date":  report_date.isoformat() if report_date else None,
        })
    return rows


def _dedup(rows: list[dict]) -> list[dict]:
    seen: set[tuple] = set()
    out  = []
    for r in rows:
        key = (r["politician"], r["ticker"], r["transaction"], r["trade_date"])
        if key not in seen:
            seen.add(key)
            out.append(r)
    return out


def _get_existing_keys() -> set[tuple]:
    """Fetch (politician, ticker, transaction, trade_date) tuples already in DB."""
    cutoff = (date.today() - timedelta(days=LOOKBACK_DAYS)).isoformat()
    try:
        result = (
            supabase.table("congressional_trades")
            .select("politician, ticker, transaction, trade_date")
            .gte("trade_date", cutoff)
            .execute()
        )
        return {
            (r["politician"], r["ticker"], r["transaction"], r["trade_date"])
            for r in (result.data or [])
        }
    except Exception as e:
        logger.warning("congressional: failed to fetch existing keys — {}", e)
        return set()


def ingest_congressional() -> str:
    house_raw   = _fetch_house()
    senate_raw  = _fetch_senate()

    house_rows  = _parse_house(house_raw)
    senate_rows = _parse_senate(senate_raw)
    all_rows    = _dedup(house_rows + senate_rows)

    if not all_rows:
        logger.info("congressional: no trades parsed from API response")
        return "0 inserted"

    existing = _get_existing_keys()
    new_rows = [
        r for r in all_rows
        if (r["politician"], r["ticker"], r["transaction"], r["trade_date"]) not in existing
    ]

    if not new_rows:
        logger.info("congressional: {} trades fetched, all already stored", len(all_rows))
        return "0 inserted (all duplicates)"

    try:
        supabase.table("congressional_trades").insert(new_rows).execute()
        logger.info("congressional: inserted {} new trades ({} fetched)", len(new_rows), len(all_rows))
        return f"{len(new_rows)} inserted"
    except Exception as e:
        logger.error("congressional: insert failed — {}", e)
        sentry_sdk.capture_exception(e)
        return f"insert error: {e}"
