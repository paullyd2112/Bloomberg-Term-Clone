"""
General market & geopolitical news ingestion via Finnhub.
Fetches broad market news (not ticker-specific company news, which stocks.py handles).
Runs daily before newsletter generation so the briefing has fresh macro/geopolitical context.
"""

import os
from datetime import datetime, timedelta, timezone

import httpx
import sentry_sdk
from loguru import logger
from dotenv import load_dotenv

from supabase_client import supabase

load_dotenv()

FINNHUB_KEY = os.environ.get("FINNHUB_API_KEY", "")
FINNHUB_NEWS_URL = "https://finnhub.io/api/v1/news"

CATEGORIES = ["general", "forex", "merger"]


def ingest_news() -> str:
    if not FINNHUB_KEY:
        logger.warning("news: FINNHUB_API_KEY not set, skipping")
        return "skipped — no API key"

    total_inserted = 0

    for category in CATEGORIES:
        try:
            resp = httpx.get(
                FINNHUB_NEWS_URL,
                params={"category": category, "token": FINNHUB_KEY},
                timeout=15.0,
            )
            resp.raise_for_status()
            articles = resp.json()
        except Exception as e:
            logger.warning("news: Finnhub {} fetch failed — {}", category, e)
            sentry_sdk.capture_exception(e)
            continue

        if not articles:
            logger.debug("news: no articles for category {}", category)
            continue

        cutoff = datetime.now(timezone.utc) - timedelta(hours=24)

        rows = []
        for a in articles:
            ts = a.get("datetime")
            if not ts:
                continue
            published = datetime.fromtimestamp(ts, tz=timezone.utc)
            if published < cutoff:
                continue

            headline = (a.get("headline") or "").strip()
            if not headline:
                continue

            related = a.get("related", "")
            identifier = related.split(",")[0].strip().upper() if related else "MARKET"

            rows.append({
                "asset_type": "market",
                "identifier": identifier or "MARKET",
                "headline": headline[:500],
                "source": (a.get("source") or "")[:100],
                "url": (a.get("url") or "")[:1000],
                "sentiment_score": None,
                "published_at": published.isoformat(),
            })

        if not rows:
            continue

        seen = set()
        deduped = []
        for r in rows:
            key = r["headline"][:80].lower()
            if key not in seen:
                seen.add(key)
                deduped.append(r)

        deduped = deduped[:25]

        try:
            supabase.table("news_items").insert(deduped).execute()
            total_inserted += len(deduped)
            logger.info("news: inserted {} articles from {}", len(deduped), category)
        except Exception as e:
            logger.warning("news: insert failed for {} — {}", category, e)
            sentry_sdk.capture_exception(e)

    summary = f"{total_inserted} market news articles ingested"
    logger.info("news: {}", summary)
    return summary
