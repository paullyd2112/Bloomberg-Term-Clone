"""
Market Movers — pulls top gainers, losers, and most active stocks from FMP.

Gives the scanner a dynamic universe beyond the fixed 66-stock watchlist.
A few FMP API calls per run, zero AI cost. The scanner then applies
technical filters and only qualified stocks go to Haiku/Sonnet.
"""

import os
from loguru import logger
import httpx

FMP_KEY = os.environ.get("FMP_API_KEY", "")
FMP_STABLE = "https://financialmodelingprep.com/stable"


def _fmp_get(endpoint: str) -> list[dict]:
    if not FMP_KEY:
        return []
    try:
        url = f"{FMP_STABLE}/{endpoint}?apikey={FMP_KEY}"
        resp = httpx.get(url, timeout=15.0)
        resp.raise_for_status()
        data = resp.json()
        return data if isinstance(data, list) else []
    except Exception as e:
        logger.debug("FMP {} failed: {}", endpoint, e)
        return []


def fetch_market_movers() -> list[str]:
    """
    Pull top gainers, losers, and most active from FMP.
    Returns deduplicated list of tickers showing unusual activity.
    """
    tickers: set[str] = set()

    for endpoint in ("gainers", "losers", "actives"):
        data = _fmp_get(endpoint)
        for item in data[:30]:
            sym = item.get("symbol", "")
            if sym and "." not in sym and len(sym) <= 5:
                tickers.add(sym.upper())

    logger.info(
        "Market movers: {} unique tickers from gainers/losers/actives",
        len(tickers),
    )
    return sorted(tickers)


def get_expanded_scan_universe() -> list[str]:
    """
    Combine the fixed watchlist with dynamic market movers.
    This is the full universe the scanner will screen.
    """
    from ingestion.stocks import get_default_watchlist

    watchlist = set(get_default_watchlist())
    movers = set(fetch_market_movers())
    combined = watchlist | movers

    logger.info(
        "Scan universe: {} tickers ({} watchlist + {} movers, {} overlap)",
        len(combined), len(watchlist), len(movers), len(watchlist & movers),
    )
    return sorted(combined)
