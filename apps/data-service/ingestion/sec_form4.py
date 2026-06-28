"""
Insider trading ingestion (SEC Form 4) — multi-source.
Primary: Finnhub /stock/insider-transactions (free tier, per-ticker).
Fallback: FMP /v4/insider-trading-rss-feed (bulk, paid tier).
Runs daily at 8:15am ET via scheduler.
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
LOOKBACK_DAYS = 60
FMP_MAX_PAGES = 8


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
        logger.warning("insider_trades: could not fetch tracked tickers — {}", e)
        return []


# ── Finnhub source (primary) ─────────────────────────────────────────────────

def _fetch_finnhub(tickers: list[str]) -> list[dict]:
    if not FINNHUB_KEY:
        logger.warning("insider_trades: FINNHUB_API_KEY not set — skipping Finnhub source")
        return []

    cutoff = date.today() - timedelta(days=LOOKBACK_DAYS)
    rows: list[dict] = []
    auth_failed = False

    for ticker in tickers:
        try:
            resp = httpx.get(
                "https://finnhub.io/api/v1/stock/insider-transactions",
                params={"symbol": ticker, "token": FINNHUB_KEY},
                timeout=15,
            )
            if resp.status_code == 429:
                logger.warning("insider_trades: Finnhub rate limit hit at {} — stopping", ticker)
                break
            if resp.status_code in (401, 403):
                logger.error("insider_trades: Finnhub key invalid or endpoint restricted (HTTP {})", resp.status_code)
                sentry_sdk.capture_message(f"Finnhub insider-transactions auth failure: HTTP {resp.status_code}")
                auth_failed = True
                break
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

                txn_code = (r.get("transactionCode") or "").upper()
                if txn_code in ("P", "A"):
                    txn = "buy"
                elif txn_code in ("S", "D", "F"):
                    txn = "sell"
                else:
                    continue

                filing_raw = r.get("filingDate") or ""
                try:
                    filing_date = date.fromisoformat(filing_raw[:10])
                except (ValueError, TypeError):
                    filing_date = None

                shares = r.get("share")
                try:
                    shares = int(float(shares)) if shares else None
                except (ValueError, TypeError):
                    shares = None

                price = r.get("transactionPrice")
                try:
                    price = float(price) if price else None
                except (ValueError, TypeError):
                    price = None

                value = round(abs(shares) * price, 2) if (shares and price) else None

                rows.append({
                    "insider_name":  (r.get("name") or "").strip(),
                    "insider_title": (r.get("transactionCode") or "").strip(),
                    "ticker":        ticker,
                    "transaction":   txn,
                    "shares":        abs(shares) if shares else None,
                    "price":         price,
                    "value_usd":     value,
                    "trade_date":    txn_date.isoformat(),
                    "report_date":   filing_date.isoformat() if filing_date else None,
                })

            time.sleep(0.12)
        except Exception as e:
            logger.warning("insider_trades: Finnhub fetch failed for {} — {}", ticker, e)
            continue

    if auth_failed:
        logger.error("insider_trades: Finnhub auth failed — returning 0 rows (key may be invalid)")
    else:
        logger.info("insider_trades: Finnhub returned {} records across {} tickers", len(rows), len(tickers))
    return rows


# ── FMP source (fallback) ────────────────────────────────────────────────────

def _normalize_fmp_transaction(acq_disp: str, txn_type: str) -> str | None:
    ad = (acq_disp or "").strip().upper()
    if ad == "A":
        return "buy"
    if ad == "D":
        return "sell"
    tt = (txn_type or "").strip().upper()
    if tt.startswith("P"):
        return "buy"
    if tt.startswith("S"):
        return "sell"
    return None


def _fetch_fmp() -> list[dict]:
    if not _fmp_key():
        logger.info("insider_trades: FMP_API_KEY not set — skipping FMP fallback")
        return []

    cutoff = date.today() - timedelta(days=LOOKBACK_DAYS)
    rows: list[dict] = []

    for page in range(FMP_MAX_PAGES):
        try:
            resp = httpx.get(
                f"{FMP_BASE}/insider-trading-rss-feed",
                params={"page": page, "apikey": _fmp_key()},
                timeout=30,
            )
            if resp.status_code in (401, 403):
                logger.error("insider_trades: FMP key invalid/expired (HTTP {}) — v4 endpoint may require premium plan", resp.status_code)
                sentry_sdk.capture_message(f"FMP insider-trading 401/403: HTTP {resp.status_code}")
                return []
            resp.raise_for_status()
            data: list[dict] = resp.json() or []
            if not data:
                break

            for r in data:
                ticker = (r.get("symbol") or "").strip().upper()
                if not ticker or ticker in ("--", "N/A", ""):
                    continue

                txn = _normalize_fmp_transaction(
                    r.get("acquistionOrDisposition") or r.get("acquisitionOrDisposition") or "",
                    r.get("transactionType") or "",
                )
                if txn is None:
                    continue

                try:
                    trade_date = date.fromisoformat((r.get("transactionDate") or "")[:10])
                except (ValueError, TypeError):
                    continue
                if trade_date < cutoff:
                    continue

                try:
                    report_date = date.fromisoformat((r.get("filingDate") or "")[:10])
                except (ValueError, TypeError):
                    report_date = None

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
                    "insider_name":  (r.get("reportingName") or "").strip(),
                    "insider_title": (r.get("typeOfOwner") or "").strip(),
                    "ticker":        ticker,
                    "transaction":   txn,
                    "shares":        shares,
                    "price":         price,
                    "value_usd":     value,
                    "trade_date":    trade_date.isoformat(),
                    "report_date":   report_date.isoformat() if report_date else None,
                })

            if len(data) < 100:
                break
        except Exception as e:
            logger.error("insider_trades: FMP page {} fetch failed — {}", page, e)
            sentry_sdk.capture_exception(e)
            break

    logger.info("insider_trades: FMP returned {} records", len(rows))
    return rows


# ── Dedup + insert ───────────────────────────────────────────────────────────

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
    tickers = _get_tracked_tickers()
    sources_tried = []

    # Try Finnhub first (free, per-ticker)
    all_rows = _fetch_finnhub(tickers) if tickers else []
    if all_rows:
        sources_tried.append(f"finnhub({len(all_rows)})")
    else:
        sources_tried.append("finnhub(0)")

    # Fall back to FMP bulk feed if Finnhub got nothing
    if not all_rows:
        logger.info("insider_trades: Finnhub returned 0 — trying FMP fallback")
        all_rows = _fetch_fmp()
        if all_rows:
            sources_tried.append(f"fmp({len(all_rows)})")
        else:
            sources_tried.append("fmp(0)")

    all_rows = _dedup(all_rows)
    source_log = ", ".join(sources_tried)

    if not all_rows:
        msg = f"0 inserted — all sources returned empty [{source_log}]"
        logger.warning("insider_trades: {}", msg)
        sentry_sdk.capture_message(f"insider_trades: {msg}")
        return msg

    existing = _get_existing_keys()
    new_rows = [
        r for r in all_rows
        if (r["insider_name"], r["ticker"], r["transaction"], r["trade_date"], r["shares"]) not in existing
    ]

    if not new_rows:
        logger.info("insider_trades: {} fetched, all already stored [{}]", len(all_rows), source_log)
        return f"0 inserted (all duplicates) [{source_log}]"

    try:
        supabase.table("insider_trades").insert(new_rows).execute()
        logger.info("insider_trades: inserted {} new ({} fetched) [{}]", len(new_rows), len(all_rows), source_log)
        return f"{len(new_rows)} inserted [{source_log}]"
    except Exception as e:
        logger.error("insider_trades: insert failed — {}", e)
        sentry_sdk.capture_exception(e)
        return f"insert error: {e}"
