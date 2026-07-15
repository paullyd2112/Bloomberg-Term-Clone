"""
Market Movers — pulls top gainers, losers, and most active stocks from FMP.

Gives the scanner a dynamic universe beyond the fixed 66-stock watchlist.
A few FMP API calls per run, zero AI cost. The scanner then applies
technical filters and only qualified stocks go to Haiku/Sonnet.
"""

import os
from loguru import logger
import httpx

FMP_STABLE = "https://financialmodelingprep.com/stable"


def _fmp_get(endpoint: str) -> list[dict]:
    fmp_key = os.environ.get("FMP_API_KEY", "")
    if not fmp_key:
        return []
    try:
        url = f"{FMP_STABLE}/{endpoint}?apikey={fmp_key}"
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


def fetch_alpaca_most_actives() -> list[str]:
    """Pull most-active stocks from Alpaca's screener (volume-based)."""
    try:
        from ingestion.alpaca_client import fetch_most_active_stocks
        actives = fetch_most_active_stocks(top_n=50)
        tickers = [a["symbol"] for a in actives]
        logger.info("Alpaca most-actives: {} tickers for scan universe", len(tickers))
        return tickers
    except Exception as e:
        logger.debug("Alpaca most-actives fetch failed in market_movers: {}", e)
        return []


def get_expanded_scan_universe() -> list[str]:
    """
    Combine the fixed watchlist with dynamic market movers from FMP
    and Alpaca most-actives. Zero AI cost — all filtering happens
    downstream in the scanner's technical gates.
    """
    from ingestion.stocks import get_default_watchlist

    watchlist = set(get_default_watchlist())
    fmp_movers = set(fetch_market_movers())
    alpaca_actives = set(fetch_alpaca_most_actives())
    combined = watchlist | fmp_movers | alpaca_actives

    logger.info(
        "Scan universe: {} tickers ({} watchlist + {} FMP movers + {} Alpaca actives, {} new from movers)",
        len(combined), len(watchlist), len(fmp_movers), len(alpaca_actives),
        len(combined - watchlist),
    )
    return sorted(combined)
