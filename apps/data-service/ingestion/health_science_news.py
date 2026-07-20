"""
Health and science news ingestion via public RSS feeds (no API key required).
Covers pandemics, FDA approvals, breakthroughs, and climate events so the
newsletter can report on health/science stories when they're newsworthy.
"""

from loguru import logger

from ingestion.rss_utils import ingest_rss_feeds

FEEDS = [
    {"url": "https://feeds.npr.org/1128/rss.xml", "source": "NPR"},
    {"url": "https://www.statnews.com/feed/", "source": "STAT News"},
]


def ingest_health_science_news() -> str:
    summary = ingest_rss_feeds(FEEDS, asset_type="market", identifier="HEALTH_SCIENCE", log_prefix="health_science_news")
    logger.info("health_science_news: {}", summary)
    return summary
