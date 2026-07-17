"""
Legislative Catalysts — ingest crypto/macro-relevant bills from Congress.gov RSS.
Uses Haiku to classify each bill's crypto and macro sentiment.
Runs every 4 hours via scheduler; results stored in Supabase `legislative_catalysts`.
"""

import os
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from xml.etree import ElementTree

import httpx
import sentry_sdk
from loguru import logger
from dotenv import load_dotenv

from supabase_client import supabase

load_dotenv()

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
HAIKU_MODEL = "claude-haiku-4-5-20251001"

CONGRESS_RSS_FEEDS = [
    {
        "url": "https://www.congress.gov/rss/bill/recently-introduced.xml",
        "feed_type": "introduced",
    },
    {
        "url": "https://www.congress.gov/rss/bill/recently-active.xml",
        "feed_type": "active",
    },
]

CRYPTO_KEYWORDS = (
    "crypto", "cryptocurrency", "digital asset", "blockchain", "bitcoin",
    "stablecoin", "defi", "cbdc", "central bank digital", "token",
    "virtual currency", "web3", "nft", "digital commodity", "fintech",
    "money transmission", "sec", "cftc", "securities and exchange",
    "commodity futures", "financial innovation", "digital dollar",
    "financial technology", "money laundering", "bank secrecy",
    "aml", "kyc", "sanctions", "tariff", "trade", "federal reserve",
    "interest rate", "inflation", "fiscal", "monetary policy", "debt ceiling",
    "treasury", "appropriation", "budget", "tax",
)

REQUEST_TIMEOUT = 15.0
_USER_AGENT = "PlebsFinance/1.0 (legislative-catalyst-tracker)"


def _parse_congress_feed(xml_text: str) -> list[dict]:
    """Parse a Congress.gov RSS feed into items."""
    items = []
    try:
        root = ElementTree.fromstring(xml_text)
    except ElementTree.ParseError as e:
        logger.warning("legislative: feed parse failed — {}", e)
        return items

    for item in root.iter("item"):
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        description = (item.findtext("description") or "").strip()
        pub_date = item.findtext("pubDate")
        if not title or not link:
            continue
        published = None
        if pub_date:
            try:
                published = parsedate_to_datetime(pub_date)
                if published.tzinfo is None:
                    published = published.replace(tzinfo=timezone.utc)
            except (TypeError, ValueError):
                published = datetime.now(timezone.utc)
        else:
            published = datetime.now(timezone.utc)

        items.append({
            "title": title,
            "link": link,
            "description": description,
            "published": published,
        })
    return items


def _is_relevant(title: str, description: str) -> bool:
    """Quick keyword pre-filter before sending to Haiku."""
    combined = (title + " " + description).lower()
    return any(kw in combined for kw in CRYPTO_KEYWORDS)


def _classify_bills_batch(bills: list[dict]) -> list[dict]:
    """Use Haiku to classify crypto/macro sentiment for a batch of bills."""
    if not ANTHROPIC_API_KEY or not bills:
        return [{
            "crypto_relevance": "unknown",
            "macro_sentiment": "neutral",
            "summary": b["title"][:200],
        } for b in bills]

    bill_texts = "\n".join(
        f"{i+1}. TITLE: {b['title']}\nDESCRIPTION: {b['description'][:300]}"
        for i, b in enumerate(bills)
    )

    prompt = f"""Analyze these {len(bills)} US legislative bills for cryptocurrency and macroeconomic impact.

{bill_texts}

For each bill (by number), output a JSON array with objects containing:
- "index": the bill number (1-based)
- "crypto_relevance": "high", "medium", "low", or "none"
- "macro_sentiment": "bullish", "bearish", or "neutral" (for crypto/markets)
- "summary": one sentence on why this matters for crypto traders (max 120 chars)

Only output the JSON array, nothing else."""

    try:
        resp = httpx.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": HAIKU_MODEL,
                "max_tokens": 1024,
                "messages": [{"role": "user", "content": prompt}],
            },
            timeout=30.0,
        )
        resp.raise_for_status()
        content = resp.json().get("content", [])
        text = content[0].get("text", "[]") if content else "[]"

        import json
        start = text.find("[")
        end = text.rfind("]") + 1
        if start >= 0 and end > start:
            results = json.loads(text[start:end])
            result_map = {r.get("index", 0): r for r in results}
            return [
                result_map.get(i + 1, {
                    "crypto_relevance": "low",
                    "macro_sentiment": "neutral",
                    "summary": bills[i]["title"][:200],
                })
                for i in range(len(bills))
            ]
    except Exception as e:
        logger.warning("legislative: Haiku classification failed — {}", e)
        sentry_sdk.capture_exception(e)

    return [{
        "crypto_relevance": "unknown",
        "macro_sentiment": "neutral",
        "summary": b["title"][:200],
    } for b in bills]


def ingest_legislative_catalysts() -> str:
    """Main entry point — fetch Congress RSS, filter, classify, store."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=72)
    all_items: list[dict] = []

    for feed in CONGRESS_RSS_FEEDS:
        try:
            resp = httpx.get(
                feed["url"],
                timeout=REQUEST_TIMEOUT,
                follow_redirects=True,
                headers={"User-Agent": _USER_AGENT},
            )
            resp.raise_for_status()
        except Exception as e:
            logger.warning("legislative: fetch failed for {} — {}", feed["feed_type"], e)
            sentry_sdk.capture_exception(e)
            continue

        items = _parse_congress_feed(resp.text)
        for it in items:
            if it["published"] < cutoff:
                continue
            if _is_relevant(it["title"], it["description"]):
                it["feed_type"] = feed["feed_type"]
                all_items.append(it)

    if not all_items:
        logger.info("legislative: 0 relevant bills found")
        return "0 legislative catalysts"

    seen_titles: set[str] = set()
    deduped: list[dict] = []
    for item in all_items:
        key = item["title"][:80].lower()
        if key not in seen_titles:
            seen_titles.add(key)
            deduped.append(item)

    deduped = deduped[:30]

    classifications = _classify_bills_batch(deduped)

    rows = []
    for item, clf in zip(deduped, classifications):
        rows.append({
            "bill_title": item["title"][:500],
            "bill_url": item["link"][:1000],
            "description": item["description"][:1000],
            "feed_type": item["feed_type"],
            "crypto_relevance": clf.get("crypto_relevance", "unknown"),
            "macro_sentiment": clf.get("macro_sentiment", "neutral"),
            "ai_summary": clf.get("summary", "")[:500],
            "published_at": item["published"].isoformat(),
            "classified_at": datetime.now(timezone.utc).isoformat(),
        })

    try:
        supabase.table("legislative_catalysts").insert(rows).execute()
        logger.info("legislative: {} catalysts written", len(rows))
    except Exception as e:
        logger.error("legislative: DB write failed — {}", e)
        sentry_sdk.capture_exception(e)
        return f"{len(rows)} classified, DB write failed"

    high_count = sum(1 for r in rows if r["crypto_relevance"] == "high")
    return f"{len(rows)} legislative catalysts ({high_count} high-relevance)"


def get_recent_catalysts(limit: int = 30) -> list[dict]:
    """Fetch recent legislative catalysts for the API endpoint."""
    try:
        result = (
            supabase.table("legislative_catalysts")
            .select("*")
            .order("published_at", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data or []
    except Exception as e:
        logger.error("legislative: get_recent_catalysts failed — {}", e)
        return []
