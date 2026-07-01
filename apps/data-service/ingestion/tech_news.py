"""
AI/tech industry news ingestion via public RSS feeds (no API key required).
Covers model launches, product releases, and usage/pricing changes from major
AI labs — coverage the Finnhub general/forex/merger feed rarely surfaces,
since it's a finance-wire aggregator, not a tech-industry one.
Runs daily before newsletter generation alongside ingest_news.
"""

from loguru import logger

from ingestion.rss_utils import ingest_rss_feeds

AI_KEYWORDS = (
    "ai", "artificial intelligence", "llm", "large language model", "chatbot",
    "openai", "anthropic", "claude", "gemini", "copilot", "machine learning",
    "genai", "generative ai", "gpt", "chatgpt",
)

# TechCrunch and Ars Technica feeds are already AI-scoped, so every item
# from them is ingested. The Verge feed is general tech, so it's filtered
# to AI-relevant headlines only.
FEEDS = [
    {"url": "https://techcrunch.com/category/artificial-intelligence/feed/", "source": "TechCrunch"},
    {"url": "https://arstechnica.com/ai/feed/", "source": "Ars Technica"},
    {"url": "https://www.theverge.com/rss/index.xml", "source": "The Verge", "keywords": AI_KEYWORDS},
]


def ingest_tech_news() -> str:
    summary = ingest_rss_feeds(FEEDS, asset_type="market", identifier="AI", log_prefix="tech_news")
    logger.info("tech_news: {}", summary)
    return summary
