"""
ApeWisdom Reddit sentiment ingestion — tracks trending crypto tickers
across major subreddits (r/CryptoCurrency, r/Bitcoin, r/SatoshiStreetBets, etc.).

Runs every hour via scheduler. Writes to `social_sentiment` table.
Consumed by the scoring engine as an additional context signal.
"""

import os
from datetime import datetime, timezone

import httpx
import sentry_sdk
from loguru import logger
from dotenv import load_dotenv

from supabase_client import supabase

load_dotenv()

APEWISDOM_URL = "https://apewisdom.io/api/v1.1/filter/all-crypto/"
REQUEST_TIMEOUT = 15.0
MAX_TICKERS = 50


def _fetch_trending() -> list[dict]:
    try:
        with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
            resp = client.get(APEWISDOM_URL)
            resp.raise_for_status()
            data = resp.json()
            return data.get("results", [])[:MAX_TICKERS]
    except Exception as e:
        logger.error("apewisdom: fetch failed: {}", e)
        sentry_sdk.capture_exception(e)
        return []


def ingest_apewisdom() -> str:
    results = _fetch_trending()
    if not results:
        return "0 tickers from ApeWisdom (fetch failed or empty)"

    now = datetime.now(timezone.utc).isoformat()
    rows = []

    for item in results:
        ticker = (item.get("ticker") or item.get("name") or "").upper().strip()
        if not ticker:
            continue

        rows.append({
            "ticker": ticker,
            "asset_type": "crypto",
            "mentions": item.get("mentions", 0),
            "rank": item.get("rank"),
            "rank_24h_ago": item.get("rank_24h_ago"),
            "upvotes": item.get("upvotes", 0),
            "source": "apewisdom",
            "captured_at": now,
            "metadata": {
                "mentions_24h_ago": item.get("mentions_24h_ago"),
                "name": item.get("name"),
            },
        })

    if not rows:
        return "0 tickers parsed from ApeWisdom response"

    inserted = 0
    skipped = 0
    for row in rows:
        try:
            supabase.table("social_sentiment").upsert(
                row,
                on_conflict="ticker,source,date_trunc('hour', captured_at AT TIME ZONE 'UTC')",
            ).execute()
            inserted += 1
        except Exception as e:
            err_str = str(e)
            if "duplicate" in err_str.lower() or "unique" in err_str.lower():
                skipped += 1
            else:
                logger.warning("apewisdom: failed to insert {}: {}", row["ticker"], e)

    top_5 = ", ".join(
        f"{r['ticker']}({r['mentions']})"
        for r in sorted(rows, key=lambda x: x["mentions"], reverse=True)[:5]
    )

    summary = f"{inserted} inserted, {skipped} dupes | top: {top_5}"
    logger.info("apewisdom: {}", summary)
    return summary


def get_reddit_sentiment(ticker: str, limit: int = 1) -> dict | None:
    """Fetch the latest Reddit sentiment for a ticker. Used by scoring engine."""
    try:
        result = (
            supabase.table("social_sentiment")
            .select("*")
            .eq("ticker", ticker.upper())
            .eq("source", "apewisdom")
            .order("captured_at", desc=True)
            .limit(limit)
            .execute()
        )
        if not result.data:
            return None
        row = result.data[0]
        meta = row.get("metadata") or {}

        mentions = row.get("mentions", 0)
        mentions_24h_ago = meta.get("mentions_24h_ago")

        mention_change_pct = None
        if mentions_24h_ago and mentions_24h_ago > 0:
            mention_change_pct = round(
                ((mentions - mentions_24h_ago) / mentions_24h_ago) * 100, 1
            )

        return {
            "mentions": mentions,
            "mentions_24h_ago": mentions_24h_ago,
            "mention_change_pct": mention_change_pct,
            "rank": row.get("rank"),
            "rank_24h_ago": row.get("rank_24h_ago"),
            "upvotes": row.get("upvotes", 0),
            "captured_at": row.get("captured_at"),
        }
    except Exception as e:
        logger.warning("apewisdom: sentiment fetch failed for {}: {}", ticker, e)
        return None


def get_trending_tickers(limit: int = 20) -> list[dict]:
    """Fetch current trending tickers. Used by the dashboard API."""
    try:
        result = (
            supabase.table("social_sentiment")
            .select("*")
            .eq("source", "apewisdom")
            .eq("asset_type", "crypto")
            .order("captured_at", desc=True)
            .limit(limit * 3)
            .execute()
        )
        if not result.data:
            return []

        seen: dict[str, dict] = {}
        for row in result.data:
            t = row["ticker"]
            if t not in seen:
                meta = row.get("metadata") or {}
                mentions = row.get("mentions", 0)
                mentions_24h_ago = meta.get("mentions_24h_ago")
                mention_change_pct = None
                if mentions_24h_ago and mentions_24h_ago > 0:
                    mention_change_pct = round(
                        ((mentions - mentions_24h_ago) / mentions_24h_ago) * 100, 1
                    )
                seen[t] = {
                    "ticker": t,
                    "mentions": mentions,
                    "mention_change_pct": mention_change_pct,
                    "rank": row.get("rank"),
                    "rank_24h_ago": row.get("rank_24h_ago"),
                    "upvotes": row.get("upvotes", 0),
                    "captured_at": row.get("captured_at"),
                }
            if len(seen) >= limit:
                break

        return sorted(seen.values(), key=lambda x: x.get("rank") or 9999)
    except Exception as e:
        logger.warning("apewisdom: trending fetch failed: {}", e)
        return []
