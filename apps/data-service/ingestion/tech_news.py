"""
AI/tech industry news ingestion via public RSS feeds (no API key required).
Covers model launches, product releases, and usage/pricing changes from major
AI labs — coverage the Finnhub general/forex/merger feed rarely surfaces,
since it's a finance-wire aggregator, not a tech-industry one.
Runs daily before newsletter generation alongside ingest_news.
"""

from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from xml.etree import ElementTree

import httpx
import sentry_sdk
from loguru import logger

from supabase_client import supabase
from ingestion.trusted_sources import is_trusted_source

AI_KEYWORDS = (
    "ai", "artificial intelligence", "llm", "large language model", "chatbot",
    "openai", "anthropic", "claude", "gemini", "copilot", "machine learning",
    "genai", "generative ai", "gpt", "chatgpt",
)

# TechCrunch and Ars Technica feeds are already AI-scoped, so every item
# from them is ingested. The Verge feed is general tech, so it's filtered
# to AI-relevant headlines only.
FEEDS = [
    {"url": "https://techcrunch.com/category/artificial-intelligence/feed/", "source": "TechCrunch", "keyword_filter": False},
    {"url": "https://arstechnica.com/ai/feed/", "source": "Ars Technica", "keyword_filter": False},
    {"url": "https://www.theverge.com/rss/index.xml", "source": "The Verge", "keyword_filter": True},
]


def _matches_ai_keywords(text: str) -> bool:
    lowered = text.lower()
    return any(kw in lowered for kw in AI_KEYWORDS)


def _parse_feed(xml_text: str) -> list[dict]:
    items = []
    try:
        root = ElementTree.fromstring(xml_text)
    except ElementTree.ParseError as e:
        logger.warning("tech_news: RSS parse failed — {}", e)
        return items

    for item in root.iter("item"):
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        pub_date = item.findtext("pubDate")
        if not title or not link or not pub_date:
            continue
        try:
            published = parsedate_to_datetime(pub_date)
            if published.tzinfo is None:
                published = published.replace(tzinfo=timezone.utc)
        except (TypeError, ValueError):
            continue
        items.append({"title": title, "link": link, "published": published})

    return items


def ingest_tech_news() -> str:
    total_inserted = 0
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)

    for feed in FEEDS:
        if not is_trusted_source(feed["source"]):
            continue

        try:
            resp = httpx.get(feed["url"], timeout=15.0, follow_redirects=True,
                              headers={"User-Agent": "Mozilla/5.0 (compatible; PlebsBot/1.0)"})
            resp.raise_for_status()
        except Exception as e:
            logger.warning("tech_news: fetch failed for {} — {}", feed["source"], e)
            sentry_sdk.capture_exception(e)
            continue

        items = _parse_feed(resp.text)
        if not items:
            continue

        rows = []
        for it in items:
            if it["published"] < cutoff:
                continue
            if feed["keyword_filter"] and not _matches_ai_keywords(it["title"]):
                continue
            rows.append({
                "asset_type": "market",
                "identifier": "AI",
                "headline": it["title"][:500],
                "source": feed["source"],
                "url": it["link"][:1000],
                "sentiment_score": None,
                "published_at": it["published"].isoformat(),
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

        deduped = deduped[:15]

        try:
            supabase.table("news_items").insert(deduped).execute()
            total_inserted += len(deduped)
            logger.info("tech_news: inserted {} articles from {}", len(deduped), feed["source"])
        except Exception as e:
            logger.warning("tech_news: insert failed for {} — {}", feed["source"], e)
            sentry_sdk.capture_exception(e)

    summary = f"{total_inserted} AI/tech news articles ingested"
    logger.info("tech_news: {}", summary)
    return summary
