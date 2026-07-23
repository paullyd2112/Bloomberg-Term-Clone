"""
Whale Sentinel — tracks large Polymarket CLOB V2 trades.

Polls the Polymarket CLOB API for recent trades exceeding $5,000 USD value,
stores them in the whale_alerts table, and exposes them via the /whale-alerts
API endpoint. Runs every 5 minutes via scheduler.
"""

import os
from datetime import datetime, timezone

import httpx
import sentry_sdk
from loguru import logger

from supabase_client import supabase

CLOB_BASE = "https://clob.polymarket.com"
MIN_USD_VALUE = 5000
FETCH_LIMIT = 100

# Polymarket Gamma API for market metadata (title lookups)
GAMMA_API = "https://gamma-api.polymarket.com"

_market_cache: dict[str, str] = {}


def _get_market_title(condition_id: str) -> str:
    if condition_id in _market_cache:
        return _market_cache[condition_id]
    try:
        resp = httpx.get(
            f"{GAMMA_API}/markets",
            params={"condition_id": condition_id, "limit": 1},
            timeout=8,
        )
        if resp.status_code == 200:
            markets = resp.json()
            if markets and len(markets) > 0:
                title = markets[0].get("question", markets[0].get("title", condition_id))
                _market_cache[condition_id] = title
                return title
    except Exception:
        pass
    _market_cache[condition_id] = condition_id
    return condition_id


def _fetch_recent_trades() -> list[dict]:
    """Fetch recent trades from Polymarket CLOB API."""
    try:
        resp = httpx.get(
            f"{CLOB_BASE}/trades",
            params={"limit": FETCH_LIMIT},
            timeout=15,
        )
        if resp.status_code != 200:
            logger.warning("whale_sentinel: CLOB trades returned {}", resp.status_code)
            return []
        return resp.json() if isinstance(resp.json(), list) else []
    except Exception as e:
        logger.error("whale_sentinel: failed to fetch trades — {}", e)
        return []


def _parse_whale_trades(trades: list[dict]) -> list[dict]:
    """Filter and parse trades above the USD threshold."""
    whales = []
    for trade in trades:
        try:
            price = float(trade.get("price", 0))
            size = float(trade.get("size", 0))
            usd_value = price * size

            if usd_value < MIN_USD_VALUE:
                continue

            asset_id = trade.get("asset_id", trade.get("token_id", ""))
            condition_id = trade.get("condition_id", "")
            market_title = _get_market_title(condition_id) if condition_id else asset_id

            outcome = trade.get("side", trade.get("outcome", "unknown"))
            if outcome.lower() in ("buy", "bid"):
                outcome = "YES" if price > 0.5 else "NO"
            elif outcome.lower() in ("sell", "ask"):
                outcome = "NO" if price > 0.5 else "YES"

            tx_hash = trade.get("transaction_hash", trade.get("id", None))

            maker = trade.get("maker", None)
            taker = trade.get("taker", None)

            whales.append({
                "market_title": market_title[:500],
                "asset_id": str(asset_id)[:200],
                "outcome": outcome[:50],
                "price": round(price, 4),
                "size": round(size, 4),
                "usd_value": round(usd_value, 2),
                "tx_hash": str(tx_hash)[:200] if tx_hash else None,
                "maker_address": str(maker)[:200] if maker else None,
                "taker_address": str(taker)[:200] if taker else None,
            })
        except (ValueError, TypeError, KeyError) as e:
            logger.debug("whale_sentinel: skipping malformed trade — {}", e)
            continue

    return whales


def _store_whale_alerts(whales: list[dict]) -> int:
    """Insert whale alerts into Supabase, deduplicating by tx_hash."""
    if not whales:
        return 0

    inserted = 0
    for whale in whales:
        try:
            if whale.get("tx_hash"):
                existing = (
                    supabase.table("whale_alerts")
                    .select("id")
                    .eq("tx_hash", whale["tx_hash"])
                    .limit(1)
                    .execute()
                )
                if existing.data:
                    continue

            supabase.table("whale_alerts").insert(whale).execute()
            inserted += 1
        except Exception as e:
            logger.debug("whale_sentinel: insert failed — {}", e)

    return inserted


def ingest_whale_alerts() -> str:
    """Main entry point — fetch, filter, store whale trades."""
    trades = _fetch_recent_trades()
    if not trades:
        return "0 trades fetched"

    whales = _parse_whale_trades(trades)
    if not whales:
        return f"{len(trades)} trades checked, 0 whales (threshold: ${MIN_USD_VALUE})"

    inserted = _store_whale_alerts(whales)
    return f"{len(trades)} trades checked, {len(whales)} whales found, {inserted} new alerts stored"


def get_recent_whale_alerts(limit: int = 20) -> list[dict]:
    """Fetch recent whale alerts for the API endpoint."""
    try:
        result = (
            supabase.table("whale_alerts")
            .select("market_title, asset_id, outcome, price, size, usd_value, tx_hash, created_at")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data or []
    except Exception as e:
        logger.error("whale_sentinel: fetch alerts failed — {}", e)
        return []
