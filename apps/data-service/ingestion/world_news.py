"""
General world and US news ingestion via public RSS feeds (no API key required).
Covers broad headlines — elections, diplomacy, domestic policy, Supreme Court,
and anything else that doesn't fit a more specific feed. Gives the newsletter
raw material to cover the full world picture beyond just finance and crypto.
"""

from loguru import logger

from ingestion.rss_utils import ingest_rss_feeds

FEEDS = [
    {"url": "https://feeds.bbci.co.uk/news/world/rss.xml", "source": "BBC News"},
    {"url": "https://feeds.npr.org/1001/rss.xml", "source": "NPR"},
    {"url": "https://rss.nytimes.com/services/xml/rss/nyt/World.xml", "source": "The New York Times"},
]


def ingest_world_news() -> str:
    summary = ingest_rss_feeds(FEEDS, asset_type="market", identifier="WORLD", log_prefix="world_news")
    logger.info("world_news: {}", summary)
    return summary
