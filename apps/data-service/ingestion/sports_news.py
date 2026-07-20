"""
Sports news ingestion via public RSS feeds (no API key required).
Covers major results, championships, and storylines so the newsletter
can include sports as a full story when something big happens.
Runs daily — sports news is 7 days/week, not just weekdays.
"""

from loguru import logger

from ingestion.rss_utils import ingest_rss_feeds

FEEDS = [
    {"url": "https://www.espn.com/espn/rss/news", "source": "ESPN"},
    {"url": "https://feeds.bbci.co.uk/sport/rss.xml", "source": "BBC Sport"},
]


def ingest_sports_news() -> str:
    summary = ingest_rss_feeds(FEEDS, asset_type="market", identifier="SPORTS", log_prefix="sports_news")
    logger.info("sports_news: {}", summary)
    return summary
