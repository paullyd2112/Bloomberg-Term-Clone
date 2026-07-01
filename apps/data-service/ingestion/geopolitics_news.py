"""
Geopolitics/defense news ingestion via public RSS feeds (no API key required).
Covers the story types the newsletter prompt explicitly asks for — wars,
sanctions, strait closures, defense/Congress activity — that a US-financial-wire
aggregator like Finnhub rarely surfaces on its own.
Runs daily before newsletter generation alongside ingest_news.
"""

from loguru import logger

from ingestion.rss_utils import ingest_rss_feeds

# Al Jazeera's economy/Middle East desks (not the firehose "all" feed) and
# Defense News' congress/global desks (Arc XP outbound feeds, same platform
# as several other outlets already in this pipeline). All four are scoped
# categories rather than general feeds, so nothing here needs keyword filtering.
FEEDS = [
    {"url": "https://www.aljazeera.com/xml/rss/economy.xml", "source": "Al Jazeera"},
    {"url": "https://www.aljazeera.com/xml/rss/middleeast.xml", "source": "Al Jazeera"},
    {"url": "https://www.defensenews.com/arc/outboundfeeds/rss/category/global/?outputType=xml", "source": "Defense News"},
    {"url": "https://www.defensenews.com/arc/outboundfeeds/rss/category/congress/?outputType=xml", "source": "Defense News"},
]


def ingest_geopolitics_news() -> str:
    summary = ingest_rss_feeds(FEEDS, asset_type="market", identifier="GEOPOLITICS", log_prefix="geopolitics_news")
    logger.info("geopolitics_news: {}", summary)
    return summary
