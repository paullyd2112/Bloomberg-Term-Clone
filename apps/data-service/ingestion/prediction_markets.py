"""
Prediction markets ingestion — Kalshi + Polymarket.
Runs every 30 minutes via scheduler.
"""

import asyncio
import base64
import os
import time
from datetime import datetime, timedelta, timezone

import httpx
import sentry_sdk
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from loguru import logger
from dotenv import load_dotenv

from supabase_client import supabase

load_dotenv()

NEWS_API_KEY       = os.environ.get("NEWS_API_KEY", "")
KALSHI_API_KEY     = os.environ.get("KALSHI_API_KEY", "")
KALSHI_PRIVATE_KEY = os.environ.get("KALSHI_PRIVATE_KEY", "")

KALSHI_BASE        = "https://api.elections.kalshi.com/trade-api/v2"
KALSHI_MARKETS_PATH = "/trade-api/v2/markets"
POLYMARKET_URL     = "https://clob.polymarket.com/markets"
NEWSAPI_URL        = "https://newsapi.org/v2/everything"

KALSHI_MIN_VOLUME     = 100
POLYMARKET_MIN_VOLUME = 100
REQUEST_TIMEOUT       = 15.0


# ─── Kalshi RSA-PSS auth ──────────────────────────────────────────────────────

def _kalshi_headers(method: str, path: str) -> dict:
    """Generate signed headers for Kalshi API v2 (RSA-PSS, timestamp in ms)."""
    if not KALSHI_API_KEY or not KALSHI_PRIVATE_KEY:
        return {}

    ts  = str(int(time.time() * 1000))
    msg = (ts + method.upper() + path).encode()

    # Support both literal \n (env var) and real newlines
    pem = KALSHI_PRIVATE_KEY.replace("\\n", "\n").encode()
    private_key = serialization.load_pem_private_key(pem, password=None)

    sig = private_key.sign(
        msg,
        padding.PSS(
            mgf=padding.MGF1(hashes.SHA256()),
            salt_length=padding.PSS.MAX_LENGTH,
        ),
        hashes.SHA256(),
    )

    return {
        "KALSHI-ACCESS-KEY":       KALSHI_API_KEY,
        "KALSHI-ACCESS-TIMESTAMP": ts,
        "KALSHI-ACCESS-SIGNATURE": base64.b64encode(sig).decode(),
    }


# ─── Fetchers ─────────────────────────────────────────────────────────────────

async def _fetch_kalshi(client: httpx.AsyncClient) -> list[dict]:
    if not KALSHI_API_KEY or not KALSHI_PRIVATE_KEY:
        logger.warning("Kalshi credentials not set — skipping Kalshi ingestion")
        return []

    records = []
    cursor  = None

    while True:
        params: dict = {"status": "open", "limit": 200}
        if cursor:
            params["cursor"] = cursor

        try:
            resp = await client.get(
                f"{KALSHI_BASE}/markets",
                params=params,
                headers=_kalshi_headers("GET", KALSHI_MARKETS_PATH),
                timeout=REQUEST_TIMEOUT,
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            logger.error("Kalshi fetch error: {}", e)
            sentry_sdk.capture_exception(e)
            break

        markets = data.get("markets", [])
        if not markets:
            break

        for m in markets:
            volume  = m.get("volume", 0) or 0
            yes_ask = m.get("yes_ask")
            if volume < KALSHI_MIN_VOLUME or yes_ask is None:
                continue

            records.append({
                "asset_type": "prediction",
                "identifier": m.get("ticker", ""),
                "price":      yes_ask / 100,       # Kalshi returns 0-100 cents
                "volume":     float(volume),
                "change_24h": None,
                "metadata": {
                    "source":     "kalshi",
                    "title":      m.get("title", ""),
                    "yes_bid":    m.get("yes_bid"),
                    "yes_ask":    yes_ask,
                    "category":   m.get("category", ""),
                    "close_time": m.get("close_time", ""),
                    "status":     m.get("status", ""),
                },
            })

        cursor = data.get("cursor")
        if not cursor:
            break

    logger.info("Kalshi: fetched {} open markets", len(records))
    return records


async def _fetch_polymarket(client: httpx.AsyncClient) -> list[dict]:
    records     = []
    next_cursor = ""

    while True:
        params: dict = {"active": "true"}
        if next_cursor:
            params["next_cursor"] = next_cursor

        try:
            resp = await client.get(POLYMARKET_URL, params=params, timeout=REQUEST_TIMEOUT)
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            logger.error("Polymarket fetch error: {}", e)
            sentry_sdk.capture_exception(e)
            break

        markets = data.get("data", [])
        if not markets:
            break

        for m in markets:
            if not m.get("active"):
                continue

            volume = float(m.get("volume", 0) or 0)
            if volume < POLYMARKET_MIN_VOLUME:
                continue

            tokens    = m.get("tokens", [])
            yes_price = None
            no_price  = None
            for token in tokens:
                outcome = (token.get("outcome") or "").upper()
                if outcome == "YES":
                    yes_price = token.get("price")
                elif outcome == "NO":
                    no_price = token.get("price")

            if yes_price is None:
                continue

            records.append({
                "asset_type": "prediction",
                "identifier": m.get("condition_id", ""),
                "price":      float(yes_price),
                "volume":     volume,
                "change_24h": None,
                "metadata": {
                    "source":    "polymarket",
                    "title":     m.get("question", ""),
                    "yes_price": yes_price,
                    "no_price":  no_price,
                    "end_date":  m.get("end_date_iso", ""),
                    "category":  m.get("category", ""),
                },
            })

        next_cursor = data.get("next_cursor", "")
        if not next_cursor or next_cursor == "LTE=":
            break

    logger.info("Polymarket: fetched {} active markets", len(records))
    return records


async def _fetch_both() -> tuple[list[dict], list[dict]]:
    async with httpx.AsyncClient() as client:
        return await asyncio.gather(
            _fetch_kalshi(client),
            _fetch_polymarket(client),
        )


# ─── News ─────────────────────────────────────────────────────────────────────

async def _fetch_news_for_market(
    client: httpx.AsyncClient,
    title: str,
    identifier: str,
) -> int:
    if not NEWS_API_KEY:
        return 0

    since = (datetime.now(timezone.utc) - timedelta(hours=24)).strftime("%Y-%m-%dT%H:%M:%S")

    try:
        resp = await client.get(
            NEWSAPI_URL,
            params={
                "q":        title[:100],
                "from":     since,
                "sortBy":   "relevancy",
                "pageSize": 3,
                "apiKey":   NEWS_API_KEY,
            },
            timeout=REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
        articles = resp.json().get("articles", [])
    except Exception as e:
        logger.warning("NewsAPI error for '{}': {}", title[:50], e)
        return 0

    rows = [
        {
            "asset_type":      "prediction",
            "identifier":      identifier,
            "headline":        a.get("title", ""),
            "source":          (a.get("source") or {}).get("name", ""),
            "url":             a.get("url", ""),
            "sentiment_score": None,
            "published_at":    a.get("publishedAt"),
        }
        for a in articles
        if a.get("title")
    ]

    if rows:
        try:
            supabase.table("news_items").insert(rows).execute()
        except Exception as e:
            logger.warning("news_items insert error for {}: {}", identifier, e)

    return len(rows)


async def _fetch_news_batch(markets: list[dict]) -> int:
    """Fetch news for top 10 markets concurrently."""
    top = sorted(markets, key=lambda r: r.get("volume") or 0, reverse=True)[:10]
    async with httpx.AsyncClient() as client:
        tasks = [
            _fetch_news_for_market(
                client,
                m.get("metadata", {}).get("title", ""),
                m["identifier"],
            )
            for m in top
            if m.get("metadata", {}).get("title")
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)
    return sum(r for r in results if isinstance(r, int))


# ─── Public: used by scheduler & scoring engine ───────────────────────────────

def fetch_recent_news_for_market(title: str, identifier: str) -> int:
    """Sync wrapper — fetches and stores news for a single market."""
    async def _run():
        async with httpx.AsyncClient() as client:
            return await _fetch_news_for_market(client, title, identifier)
    return asyncio.run(_run())


def ingest_prediction_markets() -> str:
    """
    Fetch Kalshi + Polymarket concurrently, upsert to raw_prices,
    fetch news for top markets. Returns summary string for scheduler log.
    """
    logger.info("Starting prediction markets ingestion")

    kalshi_records, polymarket_records = asyncio.run(_fetch_both())
    all_records = kalshi_records + polymarket_records

    if not all_records:
        logger.warning("No prediction market records fetched — both APIs may be down")
        return "0 records written"

    written    = 0
    batch_size = 100
    for i in range(0, len(all_records), batch_size):
        batch = all_records[i : i + batch_size]
        try:
            supabase.table("raw_prices").insert(batch).execute()
            written += len(batch)
        except Exception as e:
            logger.error("raw_prices insert error (batch {}): {}", i // batch_size, e)
            sentry_sdk.capture_exception(e)

    news_count = asyncio.run(_fetch_news_batch(all_records))

    summary = (
        f"{written} raw_prices written "
        f"({len(kalshi_records)} Kalshi, {len(polymarket_records)} Polymarket), "
        f"{news_count} news items"
    )
    logger.info("Prediction markets ingestion complete — {}", summary)
    return summary
