"""
Congressional trades ingestion — multi-source.
Primary: Finnhub /stock/congressional-trading (per-ticker, included in most plans).
Fallback: FMP /v4/senate-trading-rss-feed + house-disclosure-rss-feed (bulk, paid v4).
Runs daily at 8:00am ET via scheduler.
"""

import os
import time
from datetime import date, timedelta

import httpx
import sentry_sdk
from loguru import logger
from dotenv import load_dotenv

from supabase_client import supabase

load_dotenv()

FINNHUB_KEY   = os.environ.get("FINNHUB_API_KEY", "")
FMP_BASE      = "https://financialmodelingprep.com/api/v4"
LOOKBACK_DAYS = 90
FMP_MAX_PAGES = 5


def _fmp_key() -> str:
    return os.environ.get("FMP_API_KEY", "")


def _get_tracked_tickers() -> list[str]:
    try:
        result = (
            supabase.table("raw_prices")
            .select("identifier")
            .eq("asset_type", "stock")
            .execute()
        )
        return list({r["identifier"] for r in (result.data or [])})
    except Exception as e:
        logger.warning("congressional: could not fetch tracked tickers — {}", e)
        return []


def _normalize_transaction(raw: str) -> str | None:
    raw = (raw or "").lower()
    if "purchase" in raw or "buy" in raw:
        return "buy"
    if "sale" in raw or "sell" in raw or "exchange" in raw:
        return "sell"
    return None


# ── Finnhub source (primary) ─────────────────────────────────────────────────

def _fetch_finnhub(tickers: list[str]) -> list[dict]:
    if not FINNHUB_KEY:
        logger.warning("congressional: FINNHUB_API_KEY not set — skipping Finnhub source")
        return []

    cutoff = date.today() - timedelta(days=LOOKBACK_DAYS)
    from_date = cutoff.isoformat()
    to_date = date.today().isoformat()
    rows: list[dict] = []

    for ticker in tickers:
        try:
            resp = httpx.get(
                "https://finnhub.io/api/v1/stock/congressional-trading",
                params={
                    "symbol": ticker,
                    "from": from_date,
                    "to": to_date,
                    "token": FINNHUB_KEY,
                },
                timeout=15,
            )
            if resp.status_code == 429:
                logger.warning("congressional: Finnhub rate limit hit at {} — stopping", ticker)
                break
            if resp.status_code in (401, 403):
                logger.warning("congressional: Finnhub congressional endpoint not available (HTTP {}) — may need premium", resp.status_code)
                return []
            if resp.status_code == 404:
                # Endpoint might not exist on this plan
                logger.info("congressional: Finnhub congressional endpoint returned 404 — not available on this plan")
                return []
            resp.raise_for_status()

            data = resp.json().get("data") or []
            for r in data:
                txn_date_raw = r.get("transactionDate") or ""
                try:
                    txn_date = date.fromisoformat(txn_date_raw[:10])
                except (ValueError, TypeError):
                    continue
                if txn_date < cutoff:
                    continue

                txn = _normalize_transaction(r.get("transactionType") or r.get("transaction") or "")
                if txn is None:
                    continue

                filing_raw = r.get("filingDate") or ""
                try:
                    filing_date = date.fromisoformat(filing_raw[:10])
                except (ValueError, TypeError):
                    filing_date = None

                rows.append({
                    "politician":   (r.get("name") or r.get("representative") or "").strip(),
                    "party":        (r.get("party") or "").strip(),
                    "ticker":       ticker,
                    "transaction":  txn,
                    "amount_range": (r.get("amountFrom") or r.get("amount") or ""),
                    "trade_date":   txn_date.isoformat(),
                    "report_date":  filing_date.isoformat() if filing_date else None,
                })

            time.sleep(0.12)
        except Exception as e:
            logger.warning("congressional: Finnhub fetch failed for {} — {}", ticker, e)
            continue

    logger.info("congressional: Finnhub returned {} records across {} tickers", len(rows), len(tickers))
    return rows


# ── FMP source (fallback) ────────────────────────────────────────────────────

def _fetch_fmp_chamber(endpoint: str, chamber: str) -> list[dict]:
    if not _fmp_key():
        return []
    rows: list[dict] = []
    for page in range(FMP_MAX_PAGES):
        try:
            resp = httpx.get(
                f"{FMP_BASE}/{endpoint}",
                params={"page": page, "apikey": _fmp_key()},
                timeout=30,
            )
            if resp.status_code in (401, 403):
                logger.error("congressional: FMP {} key invalid/expired (HTTP {}) — v4 may require premium", chamber, resp.status_code)
                sentry_sdk.capture_message(f"FMP {chamber} 401/403: HTTP {resp.status_code}")
                return []
            resp.raise_for_status()
            data: list[dict] = resp.json() or []
            if not data:
                break
            rows.extend(data)
            if len(data) < 100:
                break
        except Exception as e:
            logger.error("congressional: FMP {} page {} fetch failed — {}", chamber, page, e)
            sentry_sdk.capture_exception(e)
            break
    return rows


def _parse_fmp(records: list[dict], chamber: str) -> list[dict]:
    cutoff = date.today() - timedelta(days=LOOKBACK_DAYS)
    name_key = "senator" if chamber == "senate" else "representative"
    rows = []
    for r in records:
        ticker = (r.get("ticker") or "").strip().upper()
        if not ticker or ticker in ("--", "N/A", ""):
            continue

        txn = _normalize_transaction(r.get("type") or r.get("transaction") or "")
        if txn is None:
            continue

        try:
            trade_date = date.fromisoformat((r.get("transactionDate") or r.get("date") or "")[:10])
        except (ValueError, TypeError):
            continue
        if trade_date < cutoff:
            continue

        try:
            report_date = date.fromisoformat((r.get("disclosureDate") or "")[:10])
        except (ValueError, TypeError):
            report_date = None

        rows.append({
            "politician":   (r.get(name_key) or r.get("officialFullName") or "").strip(),
            "party":        "",
            "ticker":       ticker,
            "transaction":  txn,
            "amount_range": (r.get("amount") or "").strip(),
            "trade_date":   trade_date.isoformat(),
            "report_date":  report_date.isoformat() if report_date else None,
        })
    return rows


def _fetch_fmp_all() -> list[dict]:
    if not _fmp_key():
        logger.info("congressional: FMP_API_KEY not set — skipping FMP fallback")
        return []

    senate_raw = _fetch_fmp_chamber("senate-trading-rss-feed", "senate")
    house_raw = _fetch_fmp_chamber("house-disclosure-rss-feed", "house")

    senate = _parse_fmp(senate_raw, "senate")
    house = _parse_fmp(house_raw, "house")

    combined = senate + house
    logger.info("congressional: FMP returned {} senate + {} house = {} total", len(senate), len(house), len(combined))
    return combined


# ── Dedup + insert ───────────────────────────────────────────────────────────

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
    tickers = _get_tracked_tickers()

    # Try Finnhub first (per-ticker, free/most plans)
    all_rows = _fetch_finnhub(tickers) if tickers else []

    # Fall back to FMP bulk feed if Finnhub got nothing
    if not all_rows:
        logger.info("congressional: Finnhub returned 0 — trying FMP fallback")
        all_rows = _fetch_fmp_all()

    all_rows = _dedup(all_rows)

    if not all_rows:
        logger.info("congressional: no trades from any source")
        return "0 inserted (no data from Finnhub or FMP)"

    existing = _get_existing_keys()
    new_rows = [
        r for r in all_rows
        if (r["politician"], r["ticker"], r["transaction"], r["trade_date"]) not in existing
    ]

    if not new_rows:
        logger.info("congressional: {} fetched, all already stored", len(all_rows))
        return "0 inserted (all duplicates)"

    try:
        supabase.table("congressional_trades").insert(new_rows).execute()
        logger.info("congressional: inserted {} new trades ({} fetched)", len(new_rows), len(all_rows))
        return f"{len(new_rows)} inserted"
    except Exception as e:
        logger.error("congressional: insert failed — {}", e)
        sentry_sdk.capture_exception(e)
        return f"insert error: {e}"
