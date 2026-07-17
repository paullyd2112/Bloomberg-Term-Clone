"""
Whale Sentinel — monitors Polymarket CLOB V2 for large orders (≥$5,000).
Scans the top active markets' order books and flags whale-sized positions.
Runs every 15 minutes via scheduler; results stored in Supabase `whale_alerts`.
"""

import asyncio
from datetime import datetime, timezone

import httpx
import sentry_sdk
from loguru import logger

from supabase_client import supabase

CLOB_BASE = "https://clob.polymarket.com"
GAMMA_BASE = "https://gamma-api.polymarket.com"
WHALE_THRESHOLD_USD = 5_000.0
TOP_MARKETS_LIMIT = 25
REQUEST_TIMEOUT = 12.0
MAX_BOOK_DEPTH = 50


async def _fetch_top_markets(client: httpx.AsyncClient) -> list[dict]:
    """Fetch the most active Polymarket markets by volume from the Gamma API."""
    try:
        resp = await client.get(
            f"{GAMMA_BASE}/markets",
            params={
                "limit": TOP_MARKETS_LIMIT,
                "active": "true",
                "closed": "false",
                "order": "volume",
                "ascending": "false",
            },
            timeout=REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
        return resp.json() if isinstance(resp.json(), list) else []
    except Exception as e:
        logger.warning("whale_sentinel: failed to fetch top markets — {}", e)
        return []


async def _fetch_order_book(client: httpx.AsyncClient, token_id: str) -> dict | None:
    """Fetch the order book for a single token from CLOB V2."""
    try:
        resp = await client.get(
            f"{CLOB_BASE}/book",
            params={"token_id": token_id},
            timeout=REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        logger.debug("whale_sentinel: order book fetch failed for {} — {}", token_id[:16], e)
        return None


def _extract_whale_orders(book: dict, side: str) -> list[dict]:
    """Pull orders from one side of the book that exceed the whale threshold."""
    whales = []
    orders = book.get(side, [])
    if not isinstance(orders, list):
        return whales
    for order in orders[:MAX_BOOK_DEPTH]:
        try:
            price = float(order.get("price", 0))
            size = float(order.get("size", 0))
        except (TypeError, ValueError):
            continue
        notional = price * size
        if notional >= WHALE_THRESHOLD_USD:
            whales.append({
                "side": "BID" if side == "bids" else "ASK",
                "price": round(price, 4),
                "size": round(size, 2),
                "notional_usd": round(notional, 2),
            })
    return whales


async def _scan_market(client: httpx.AsyncClient, market: dict) -> list[dict]:
    """Scan a single market's token order books for whale orders."""
    alerts = []
    condition_id = market.get("conditionId") or market.get("condition_id") or ""
    title = market.get("question") or market.get("title") or "Unknown Market"
    slug = market.get("slug") or ""

    clob_ids = market.get("clobTokenIds")
    if isinstance(clob_ids, str):
        import json as _json
        try:
            clob_ids = _json.loads(clob_ids)
        except (ValueError, TypeError):
            clob_ids = []
    if not clob_ids or not isinstance(clob_ids, list):
        return alerts

    outcomes = market.get("outcomes")
    if isinstance(outcomes, str):
        import json as _json
        try:
            outcomes = _json.loads(outcomes)
        except (ValueError, TypeError):
            outcomes = []
    if not outcomes or not isinstance(outcomes, list):
        outcomes = ["Yes", "No"]

    for idx, token_id in enumerate(clob_ids[:2]):
        book = await _fetch_order_book(client, token_id)
        if not book:
            continue
        outcome_label = outcomes[idx] if idx < len(outcomes) else f"Outcome {idx}"
        for side_key in ("bids", "asks"):
            whales = _extract_whale_orders(book, side_key)
            for w in whales:
                alerts.append({
                    "condition_id": condition_id,
                    "market_title": title[:500],
                    "market_slug": slug[:200],
                    "outcome": outcome_label[:50],
                    "side": w["side"],
                    "price": w["price"],
                    "size": w["size"],
                    "notional_usd": w["notional_usd"],
                    "detected_at": datetime.now(timezone.utc).isoformat(),
                })
    return alerts


async def _scan_all() -> list[dict]:
    """Main async entrypoint — fetch top markets, scan each for whales."""
    async with httpx.AsyncClient() as client:
        markets = await _fetch_top_markets(client)
        if not markets:
            return []

        all_alerts: list[dict] = []
        for market in markets:
            try:
                alerts = await _scan_market(client, market)
                all_alerts.extend(alerts)
            except Exception as e:
                logger.debug("whale_sentinel: scan failed for market — {}", e)
                sentry_sdk.capture_exception(e)
        return all_alerts


def scan_whales() -> str:
    """Synchronous entry point for the scheduler."""
    try:
        alerts = asyncio.run(_scan_all())
    except Exception as e:
        logger.error("whale_sentinel: scan_whales crashed — {}", e)
        sentry_sdk.capture_exception(e)
        return "0 whale alerts (error)"

    if not alerts:
        logger.info("whale_sentinel: 0 whale alerts detected")
        return "0 whale alerts"

    try:
        supabase.table("whale_alerts").insert(alerts).execute()
        logger.info("whale_sentinel: {} whale alerts written", len(alerts))
    except Exception as e:
        logger.error("whale_sentinel: DB write failed — {}", e)
        sentry_sdk.capture_exception(e)
        return f"{len(alerts)} detected, DB write failed"

    return f"{len(alerts)} whale alerts"


def get_recent_alerts(limit: int = 50) -> list[dict]:
    """Fetch recent whale alerts for the API endpoint."""
    try:
        result = (
            supabase.table("whale_alerts")
            .select("*")
            .order("detected_at", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data or []
    except Exception as e:
        logger.error("whale_sentinel: get_recent_alerts failed — {}", e)
        return []
