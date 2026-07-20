"""
Geopolitics/defense news ingestion via public RSS feeds (no API key required).
Covers the story types the newsletter prompt explicitly asks for — wars,
sanctions, strait closures, defense/Congress activity — that a US-financial-wire
aggregator like Finnhub rarely surfaces on its own.
Runs daily before newsletter generation alongside ingest_news.
"""

from loguru import logger

from ingestion.rss_utils import ingest_rss_feeds

# Al Jazeera killed their category RSS feeds (economy.xml, middleeast.xml both 404
# as of July 2026). Only all.xml survives, so we keyword-filter it down to
# geopolitics/economy topics. Defense News category feeds still work fine.
_AJ_KEYWORDS = (
    "sanction", "war", "military", "missile", "nuclear", "iran", "israel",
    "gaza", "ukraine", "russia", "china", "taiwan", "nato", "un ", "united nations",
    "ceasefire", "peace deal", "trade war", "tariff", "oil", "energy",
    "strait", "diplomacy", "summit", "treaty", "election", "coup",
    "economy", "inflation", "central bank", "interest rate",
)

FEEDS = [
    {"url": "https://www.aljazeera.com/xml/rss/all.xml", "source": "Al Jazeera", "keywords": _AJ_KEYWORDS},
    {"url": "https://www.defensenews.com/arc/outboundfeeds/rss/category/global/?outputType=xml", "source": "Defense News"},
    {"url": "https://www.defensenews.com/arc/outboundfeeds/rss/category/congress/?outputType=xml", "source": "Defense News"},
]


def ingest_geopolitics_news() -> str:
    summary = ingest_rss_feeds(FEEDS, asset_type="market", identifier="GEOPOLITICS", log_prefix="geopolitics_news")
    logger.info("geopolitics_news: {}", summary)
    return summary
