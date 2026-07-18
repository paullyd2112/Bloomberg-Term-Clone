"""
Prediction markets ingestion — Polymarket only.
Runs every 30 minutes via scheduler.
"""

import asyncio
import base64
import json
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
from scoring.prediction_filters import infer_category

load_dotenv()

NEWS_API_KEY       = os.environ.get("NEWS_API_KEY", "")
KALSHI_API_KEY     = os.environ.get("KALSHI_API_KEY", "")
KALSHI_PRIVATE_KEY = os.environ.get("KALSHI_PRIVATE_KEY", "")

KALSHI_ENABLED = False

KALSHI_BASE        = "https://api.elections.kalshi.com/trade-api/v2"
KALSHI_MARKETS_PATH = "/trade-api/v2/markets"
# Gamma API: Polymarket's public, unauthenticated market-listing API. The CLOB
# API this used to hit (clob.polymarket.com) is for order-book/trading, not
# bulk market discovery, and uses a different pagination scheme entirely.
POLYMARKET_URL       = "https://gamma-api.polymarket.com/markets"
POLYMARKET_PAGE_SIZE = 100
NEWSAPI_URL        = "https://newsapi.org/v2/everything"

KALSHI_MIN_VOLUME     = 100
POLYMARKET_MIN_VOLUME = 100
REQUEST_TIMEOUT       = 15.0
MAX_PAGES             = 50   # hard cap so a pagination cursor that never terminates can't hang the job forever

# ─── In-memory metadata cache ────────────────────────────────────────────────
# Static contract fields (title, category, event_slug, context_description,
# end_date, settlement rules) rarely change. Cache them keyed by conditionId
# so scheduled runs only update live pricing (yes_price, no_price, volume).
# News lookups are skipped for markets already in the cache — they don't need
# re-enriching every run. The cache lives for the process lifetime; Railway
# restarts give a clean slate, which is fine.
_metadata_cache: dict[str, dict] = {}
_cache_hits = 0
_cache_misses = 0


def _first(item: dict, *keys: str):
    for k in keys:
        if item.get(k) is not None:
            return item[k]
    return None


def _parse_json_list(value) -> list:
    """Gamma often returns outcomes/outcomePrices as JSON-encoded strings
    rather than native arrays -- handle both rather than assume one."""
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, list) else []
        except (ValueError, TypeError):
            return []
    return []


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

    for page in range(MAX_PAGES):
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
    else:
        logger.warning("Kalshi: hit the {}-page cap without exhausting pagination", MAX_PAGES)

    logger.info("Kalshi: fetched {} open markets", len(records))
    return records


async def _fetch_polymarket(client: httpx.AsyncClient) -> list[dict]:
    """Fetch active markets from Polymarket's Gamma API.

    Static metadata (title, category, event_slug, context_description,
    end_date, settlement rules) is cached in-memory keyed by conditionId.
    On repeat runs within the same process, only live pricing fields
    (yes_price, no_price, volume) are updated — the cached static fields
    are reused without re-processing. The full raw item is still kept in
    metadata.raw on first sight so field mismatches are fixable from real
    production data."""
    global _cache_hits, _cache_misses
    records = []
    offset  = 0

    for page in range(MAX_PAGES):
        try:
            resp = await client.get(
                POLYMARKET_URL,
                params={"active": "true", "closed": "false", "limit": POLYMARKET_PAGE_SIZE, "offset": offset},
                timeout=REQUEST_TIMEOUT,
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            logger.error("Polymarket fetch error at offset {}: {}", offset, e)
            sentry_sdk.capture_exception(e)
            break

        if isinstance(data, list):
            markets  = data
            has_more = len(markets) >= POLYMARKET_PAGE_SIZE
        else:
            markets  = data.get("data") or data.get("markets") or []
            has_more = data.get("has_more", len(markets) >= POLYMARKET_PAGE_SIZE)

        if not markets:
            break

        for m in markets:
            if _first(m, "active") is False:
                continue

            volume_raw = _first(m, "volume", "volume24hr", "volumeNum")
            try:
                volume = float(volume_raw) if volume_raw is not None else 0.0
            except (TypeError, ValueError):
                volume = 0.0
            if volume < POLYMARKET_MIN_VOLUME:
                continue

            outcomes       = _parse_json_list(_first(m, "outcomes"))
            outcome_prices = _parse_json_list(_first(m, "outcomePrices"))
            yes_price = None
            no_price  = None
            for outcome_name, price in zip(outcomes, outcome_prices):
                try:
                    price_f = float(price)
                except (TypeError, ValueError):
                    continue
                label = (outcome_name or "").strip().upper()
                if label == "YES":
                    yes_price = price_f
                elif label == "NO":
                    no_price = price_f

            if yes_price is None:
                continue

            identifier = str(_first(m, "conditionId", "condition_id", "id") or "")

            cached = _metadata_cache.get(identifier)
            if cached is not None:
                _cache_hits += 1
                meta = {
                    **cached,
                    "yes_price": yes_price,
                    "no_price":  no_price,
                }
            else:
                _cache_misses += 1
                events = _first(m, "events") or []
                first_event = events[0] if events else {}
                event_slug = first_event.get("slug") or ""
                context_description = (first_event.get("eventMetadata") or {}).get("context_description") or ""

                title = _first(m, "question") or ""
                raw_category = _first(m, "category") or ""
                inferred = raw_category or infer_category(title, event_slug)

                static_meta = {
                    "source":              "polymarket",
                    "title":               title,
                    "end_date":            _first(m, "endDate", "end_date_iso") or "",
                    "category":            inferred,
                    "event_slug":          event_slug,
                    "context_description": context_description,
                    "raw":                 m,
                }
                _metadata_cache[identifier] = static_meta

                meta = {
                    **static_meta,
                    "yes_price": yes_price,
                    "no_price":  no_price,
                }

            records.append({
                "asset_type": "prediction",
                "identifier": identifier,
                "price":      yes_price,
                "volume":     volume,
                "change_24h": None,
                "metadata":   meta,
            })

        if not has_more or len(markets) < POLYMARKET_PAGE_SIZE:
            break
        offset += POLYMARKET_PAGE_SIZE
    else:
        logger.warning("Polymarket: hit the {}-page cap without exhausting pagination", MAX_PAGES)

    logger.info("Polymarket: fetched {} active markets (cache: {} hits, {} misses, {} total cached)",
                len(records), _cache_hits, _cache_misses, len(_metadata_cache))
    return records


async def _fetch_both() -> tuple[list[dict], list[dict]]:
    async with httpx.AsyncClient() as client:
        if KALSHI_ENABLED:
            return await asyncio.gather(
                _fetch_kalshi(client),
                _fetch_polymarket(client),
            )
        return [], await _fetch_polymarket(client)


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


_news_fetched_ids: set[str] = set()

async def _fetch_news_batch(markets: list[dict]) -> int:
    """Fetch news for top 10 markets concurrently. Skips markets whose news
    was already fetched in a prior run this process — static metadata doesn't
    change, so re-fetching the same 3 articles is pure waste."""
    top = sorted(markets, key=lambda r: r.get("volume") or 0, reverse=True)[:10]
    new_markets = [m for m in top if m["identifier"] not in _news_fetched_ids]
    if not new_markets:
        logger.debug("News: all top-10 markets already enriched, skipping")
        return 0
    async with httpx.AsyncClient() as client:
        tasks = [
            _fetch_news_for_market(
                client,
                m.get("metadata", {}).get("title", ""),
                m["identifier"],
            )
            for m in new_markets
            if m.get("metadata", {}).get("title")
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)
    for m in new_markets:
        _news_fetched_ids.add(m["identifier"])
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
    Fetch Polymarket (Kalshi disabled — see KALSHI_ENABLED), upsert to
    raw_prices, fetch news for top markets. Returns summary string for
    scheduler log.
    """
    logger.info("Starting prediction markets ingestion")

    kalshi_records, polymarket_records = asyncio.run(_fetch_both())
    all_records = kalshi_records + polymarket_records

    if not KALSHI_ENABLED:
        kalshi_label = "disabled"
    elif not (KALSHI_API_KEY and KALSHI_PRIVATE_KEY):
        kalshi_label = "no credentials"
    else:
        kalshi_label = str(len(kalshi_records))

    if not all_records:
        logger.warning(
            "No prediction market records fetched — Kalshi: {}, Polymarket: 0 markets after fetch/filter",
            kalshi_label,
        )
        return f"0 records written (Kalshi: {kalshi_label}, Polymarket: 0 after fetch/filter)"

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

    # Append price snapshots for sparklines on the predictions browse tab.
    history_rows = []
    for r in all_records:
        meta = r.get("metadata") or {}
        yes_p = meta.get("yes_price") if meta.get("yes_price") is not None else r.get("price")
        if yes_p is None:
            continue
        history_rows.append({
            "condition_id": r["identifier"],
            "yes_price":    yes_p,
            "no_price":     meta.get("no_price"),
            "volume":       r.get("volume"),
        })
    history_written = 0
    for i in range(0, len(history_rows), batch_size):
        batch = history_rows[i : i + batch_size]
        try:
            supabase.table("prediction_price_history").insert(batch).execute()
            history_written += len(batch)
        except Exception as e:
            logger.warning("prediction_price_history insert error (batch {}): {}", i // batch_size, e)

    news_count = asyncio.run(_fetch_news_batch(all_records))

    summary = (
        f"{written} raw_prices written "
        f"(Kalshi: {kalshi_label}, {len(polymarket_records)} Polymarket), "
        f"{history_written} price snapshots, "
        f"{news_count} news items"
    )
    logger.info("Prediction markets ingestion complete — {}", summary)
    return summary
