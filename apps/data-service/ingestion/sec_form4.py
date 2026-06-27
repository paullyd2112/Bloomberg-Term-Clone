"""
Insider trading ingestion (SEC Form 4) — Financial Modeling Prep API.
Pulls Form 4 filings (officer/director buys & sells), deduplicates,
upserts to insider_trades. Insiders must file within 2 business days,
making this a faster signal than congressional disclosures.
Runs daily at 8:15am ET via scheduler.
"""

import os
from datetime import date, datetime, timedelta

import httpx
import sentry_sdk
from loguru import logger
from dotenv import load_dotenv

from supabase_client import supabase

load_dotenv()

FMP_KEY       = os.environ.get("FMP_API_KEY", "")
BASE_URL      = "https://financialmodelingprep.com/api/v4"
LOOKBACK_DAYS = 60
MAX_PAGES     = 8   # ~100 records/page


def _normalize_transaction(acq_disp: str, txn_type: str) -> str | None:
    """A = acquired (buy), D = disposed (sell). Fall back to type code."""
    ad = (acq_disp or "").strip().upper()
    if ad == "A":
        return "buy"
    if ad == "D":
        return "sell"
    tt = (txn_type or "").strip().upper()
    if tt.startswith("P"):   # P-Purchase
        return "buy"
    if tt.startswith("S"):   # S-Sale
        return "sell"
    return None


def _fetch_insider_feed() -> list[dict]:
    if not FMP_KEY:
        logger.warning("insider_trades: FMP_API_KEY not set — skipping")
        return []
    rows: list[dict] = []
    for page in range(MAX_PAGES):
        try:
            resp = httpx.get(
                f"{BASE_URL}/insider-trading-rss-feed",
                params={"page": page, "apikey": FMP_KEY},
                timeout=30,
            )
            if resp.status_code in (401, 403):
                logger.error("insider_trades: FMP API key invalid or expired (HTTP {})", resp.status_code)
                sentry_sdk.capture_message(f"FMP_API_KEY invalid/expired: HTTP {resp.status_code}")
                return []
            resp.raise_for_status()
            data: list[dict] = resp.json() or []
            if not data:
                break
            rows.extend(data)
            if len(data) < 100:
                break
        except Exception as e:
            logger.error("insider_trades: page {} fetch failed — {}", page, e)
            sentry_sdk.capture_exception(e)
            break
    return rows


def _parse(records: list[dict]) -> list[dict]:
    cutoff = date.today() - timedelta(days=LOOKBACK_DAYS)
    rows = []
    for r in records:
        ticker = (r.get("symbol") or "").strip().upper()
        if not ticker or ticker in ("--", "N/A", ""):
            continue

        txn = _normalize_transaction(
            r.get("acquistionOrDisposition") or r.get("acquisitionOrDisposition") or "",
            r.get("transactionType") or "",
        )
        if txn is None:
            continue

        trade_date_raw  = r.get("transactionDate") or ""
        report_date_raw = r.get("filingDate") or ""

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

        insider_name = (r.get("reportingName") or "").strip()
        insider_title = (r.get("typeOfOwner") or "").strip()

        try:
            shares = int(float(r.get("securitiesTransacted") or 0))
        except (ValueError, TypeError):
            shares = None

        try:
            price = float(r.get("price") or 0) or None
        except (ValueError, TypeError):
            price = None

        value = round(shares * price, 2) if (shares and price) else None

        rows.append({
            "insider_name":  insider_name,
            "insider_title": insider_title,
            "ticker":        ticker,
            "transaction":   txn,
            "shares":        shares,
            "price":         price,
            "value_usd":     value,
            "trade_date":    trade_date.isoformat(),
            "report_date":   report_date.isoformat() if report_date else None,
        })
    return rows


def _dedup(rows: list[dict]) -> list[dict]:
    seen: set[tuple] = set()
    out = []
    for r in rows:
        key = (r["insider_name"], r["ticker"], r["transaction"], r["trade_date"], r["shares"])
        if key not in seen:
            seen.add(key)
            out.append(r)
    return out


def _get_existing_keys() -> set[tuple]:
    cutoff = (date.today() - timedelta(days=LOOKBACK_DAYS)).isoformat()
    try:
        result = (
            supabase.table("insider_trades")
            .select("insider_name, ticker, transaction, trade_date, shares")
            .gte("trade_date", cutoff)
            .execute()
        )
        return {
            (r["insider_name"], r["ticker"], r["transaction"], r["trade_date"], r["shares"])
            for r in (result.data or [])
        }
    except Exception as e:
        logger.warning("insider_trades: failed to fetch existing keys — {}", e)
        return set()


def ingest_insider_trades() -> str:
    raw = _fetch_insider_feed()
    all_rows = _dedup(_parse(raw))

    if not all_rows:
        logger.info("insider_trades: no trades parsed from API response")
        return "0 inserted"

    existing = _get_existing_keys()
    new_rows = [
        r for r in all_rows
        if (r["insider_name"], r["ticker"], r["transaction"], r["trade_date"], r["shares"]) not in existing
    ]

    if not new_rows:
        logger.info("insider_trades: {} fetched, all already stored", len(all_rows))
        return "0 inserted (all duplicates)"

    try:
        supabase.table("insider_trades").insert(new_rows).execute()
        logger.info("insider_trades: inserted {} new ({} fetched)", len(new_rows), len(all_rows))
        return f"{len(new_rows)} inserted"
    except Exception as e:
        logger.error("insider_trades: insert failed — {}", e)
        sentry_sdk.capture_exception(e)
        return f"insert error: {e}"
