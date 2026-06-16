"""
Congressional trades ingestion — Financial Modeling Prep (FMP) API.
Pulls House + Senate STOCK Act disclosures via RSS feed, deduplicates, upserts to congressional_trades.
Runs daily at 8:00am ET via scheduler.
"""

import os
from datetime import date, timedelta

import httpx
import sentry_sdk
from loguru import logger
from dotenv import load_dotenv

from supabase_client import supabase

load_dotenv()

FMP_KEY      = os.environ.get("FMP_API_KEY", "")
BASE_URL     = "https://financialmodelingprep.com/api/v4"
LOOKBACK_DAYS = 90
MAX_PAGES    = 5   # up to 500 records per chamber per run


def _normalize_transaction(raw: str) -> str | None:
    raw = (raw or "").lower()
    if "purchase" in raw or "buy" in raw:
        return "buy"
    if "sale" in raw or "sell" in raw or "exchange" in raw:
        return "sell"
    return None


def _fetch_senate() -> list[dict]:
    if not FMP_KEY:
        logger.warning("congressional: FMP_API_KEY not set — skipping")
        return []
    rows: list[dict] = []
    for page in range(MAX_PAGES):
        try:
            resp = httpx.get(
                f"{BASE_URL}/senate-trading-rss-feed",
                params={"page": page, "apikey": FMP_KEY},
                timeout=30,
            )
            resp.raise_for_status()
            data: list[dict] = resp.json() or []
            if not data:
                break
            rows.extend(data)
            if len(data) < 100:   # FMP returns ~100 per page when full
                break
        except Exception as e:
            logger.error("congressional: senate page {} fetch failed — {}", page, e)
            sentry_sdk.capture_exception(e)
            break
    return rows


def _fetch_house() -> list[dict]:
    if not FMP_KEY:
        return []
    rows: list[dict] = []
    for page in range(MAX_PAGES):
        try:
            resp = httpx.get(
                f"{BASE_URL}/house-disclosure-rss-feed",
                params={"page": page, "apikey": FMP_KEY},
                timeout=30,
            )
            resp.raise_for_status()
            data: list[dict] = resp.json() or []
            if not data:
                break
            rows.extend(data)
            if len(data) < 100:
                break
        except Exception as e:
            logger.error("congressional: house page {} fetch failed — {}", page, e)
            sentry_sdk.capture_exception(e)
            break
    return rows


def _parse_senate(records: list[dict]) -> list[dict]:
    cutoff = date.today() - timedelta(days=LOOKBACK_DAYS)
    rows = []
    for r in records:
        ticker = (r.get("ticker") or "").strip().upper()
        if not ticker or ticker in ("--", "N/A", ""):
            continue

        txn = _normalize_transaction(r.get("type") or r.get("transaction") or "")
        if txn is None:
            continue

        trade_date_raw  = r.get("transactionDate") or r.get("date") or ""
        report_date_raw = r.get("disclosureDate") or ""

        try:
            trade_date = date.fromisoformat(trade_date_raw[:10])
        except (ValueError, TypeError):
            continue

        if trade_date < cutoff:
            continue

        try:
            report_date: date | None = date.fromisoformat(report_date_raw[:10])
        except (ValueError, TypeError):
            report_date = None

        politician = (r.get("senator") or r.get("officialFullName") or "").strip()

        rows.append({
            "politician":   politician,
            "party":        "",   # FMP does not provide party affiliation
            "ticker":       ticker,
            "transaction":  txn,
            "amount_range": (r.get("amount") or "").strip(),
            "trade_date":   trade_date.isoformat(),
            "report_date":  report_date.isoformat() if report_date else None,
        })
    return rows


def _parse_house(records: list[dict]) -> list[dict]:
    cutoff = date.today() - timedelta(days=LOOKBACK_DAYS)
    rows = []
    for r in records:
        ticker = (r.get("ticker") or "").strip().upper()
        if not ticker or ticker in ("--", "N/A", ""):
            continue

        txn = _normalize_transaction(r.get("type") or r.get("transaction") or "")
        if txn is None:
            continue

        trade_date_raw  = r.get("transactionDate") or r.get("date") or ""
        report_date_raw = r.get("disclosureDate") or ""

        try:
            trade_date = date.fromisoformat(trade_date_raw[:10])
        except (ValueError, TypeError):
            continue

        if trade_date < cutoff:
            continue

        try:
            report_date: date | None = date.fromisoformat(report_date_raw[:10])
        except (ValueError, TypeError):
            report_date = None

        politician = (r.get("representative") or r.get("officialFullName") or "").strip()

        rows.append({
            "politician":   politician,
            "party":        "",   # FMP does not provide party affiliation
            "ticker":       ticker,
            "transaction":  txn,
            "amount_range": (r.get("amount") or "").strip(),
            "trade_date":   trade_date.isoformat(),
            "report_date":  report_date.isoformat() if report_date else None,
        })
    return rows


def _dedup(rows: list[dict]) -> list[dict]:
    seen: set[tuple] = set()
    out = []
    for r in rows:
        key = (r["politician"], r["ticker"], r["transaction"], r["trade_date"])
        if key not in seen:
            seen.add(key)
            out.append(r)
    return out


def _get_existing_keys() -> set[tuple]:
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
    senate_raw  = _fetch_senate()
    house_raw   = _fetch_house()

    senate_rows = _parse_senate(senate_raw)
    house_rows  = _parse_house(house_raw)
    all_rows    = _dedup(senate_rows + house_rows)

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
