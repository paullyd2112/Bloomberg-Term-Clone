"""
Trusted news source whitelist. Only articles from these sources are
ingested into news_items and surfaced to users.

If a source isn't on this list, it gets dropped at ingestion time.
Add new sources here as we vet them.
"""

TRUSTED_SOURCES: set[str] = {
    # Wire services
    "Reuters",
    "Associated Press",
    "AFP",

    # Major financial
    "Bloomberg",
    "CNBC",
    "Financial Times",
    "Wall Street Journal",
    "The Wall Street Journal",
    "WSJ",
    "MarketWatch",
    "Barron's",
    "Barrons",
    "Investor's Business Daily",
    "Yahoo Finance",
    "Seeking Alpha",
    "Benzinga",

    # Crypto-specific (credible)
    "CoinDesk",
    "The Block",
    "Decrypt",
    "CoinTelegraph",
    "Cointelegraph",

    # Business / general
    "Forbes",
    "Business Insider",
    "The Economist",
    "BBC",
    "BBC News",
    "CNN",
    "CNN Business",
    "NPR",
    "AP News",
    "The New York Times",
    "New York Times",
    "Washington Post",
    "The Guardian",
    "TechCrunch",
    "Wired",
    "The Verge",
    "Ars Technica",
    "The Information",
    "Axios",
    "Politico",

    # Industry
    "SEC",
    "Federal Reserve",
    "U.S. Treasury",
}

_TRUSTED_LOWER = {s.lower() for s in TRUSTED_SOURCES}


def is_trusted_source(source: str) -> bool:
    if not source:
        return False
    return source.strip().lower() in _TRUSTED_LOWER
