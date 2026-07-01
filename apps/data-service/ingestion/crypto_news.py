"""
Crypto news ingestion via public RSS feeds (no API key required), pulled
directly from named outlets with stronger editorial standards than what
Finnhub's crypto news category tends to surface (which skews heavily
toward Cointelegraph). Runs alongside crypto ingestion so the newsletter
and briefings draw from a more balanced source mix.
"""

from loguru import logger

from ingestion.rss_utils import ingest_rss_feeds

FEEDS = [
    {"url": "https://www.coindesk.com/arc/outboundfeeds/rss/", "source": "CoinDesk"},
    {"url": "https://decrypt.co/feed", "source": "Decrypt"},
    {"url": "https://www.theblock.co/rss.xml", "source": "The Block"},
]


def ingest_crypto_news_rss() -> str:
    summary = ingest_rss_feeds(FEEDS, asset_type="crypto", identifier="CRYPTO_GENERAL", log_prefix="crypto_news_rss")
    logger.info("crypto_news_rss: {}", summary)
    return summary
