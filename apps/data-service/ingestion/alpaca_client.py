"""
Alpaca Markets client — REST (historical bars) + WebSocket (live quotes).
Primary data source for stocks and crypto. Paper trading compatible.

Env vars:
  ALPACA_API_KEY, ALPACA_API_SECRET
  ALPACA_BASE_URL (default: https://paper-api.alpaca.markets)
"""

import os
from datetime import datetime, timedelta, timezone

import httpx
import pandas as pd
from loguru import logger

ALPACA_KEY    = os.environ.get("ALPACA_API_KEY", "")
ALPACA_SECRET = os.environ.get("ALPACA_API_SECRET", "")
ALPACA_BASE   = os.environ.get("ALPACA_BASE_URL", "https://paper-api.alpaca.markets")
DATA_BASE     = "https://data.alpaca.markets"

REQUEST_TIMEOUT = 20.0


def _is_configured() -> bool:
    return bool(ALPACA_KEY and ALPACA_SECRET)


def _headers() -> dict:
    return {
        "APCA-API-KEY-ID": ALPACA_KEY,
        "APCA-API-SECRET-KEY": ALPACA_SECRET,
    }


def fetch_stock_bars(
    ticker: str,
    days: int = 90,
    timeframe: str = "1Day",
) -> pd.DataFrame | None:
    """Fetch daily OHLCV bars for a stock from Alpaca Data API v2."""
    if not _is_configured():
        return None

    start = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%dT00:00:00Z")
    end = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    all_bars: list[dict] = []
    next_page_token = None

    try:
        with httpx.Client(timeout=REQUEST_TIMEOUT, headers=_headers()) as client:
            while True:
                params: dict = {
                    "timeframe": timeframe,
                    "start": start,
                    "end": end,
                    "limit": 10000,
                    "adjustment": "all",
                    "feed": "iex",
                }
                if next_page_token:
                    params["page_token"] = next_page_token

                resp = client.get(
                    f"{DATA_BASE}/v2/stocks/{ticker}/bars",
                    params=params,
                )
                resp.raise_for_status()
                data = resp.json()

                bars = data.get("bars") or []
                all_bars.extend(bars)

                next_page_token = data.get("next_page_token")
                if not next_page_token:
                    break

        if not all_bars:
            logger.debug("{}: Alpaca returned 0 bars", ticker)
            return None

        df = pd.DataFrame(all_bars)
        df["t"] = pd.to_datetime(df["t"])
        df = df.rename(columns={
            "t": "date", "o": "open", "h": "high",
            "l": "low", "c": "close", "v": "volume",
        })
        df = df.set_index("date").sort_index()
        df = df[["open", "high", "low", "close", "volume"]].astype(float)

        logger.debug("{}: Alpaca returned {} bars", ticker, len(df))
        return df

    except httpx.HTTPStatusError as e:
        if e.response.status_code in (401, 403):
            logger.warning("{}: Alpaca auth failed ({})", ticker, e.response.status_code)
        else:
            logger.debug("{}: Alpaca stock bars failed — {}", ticker, e)
        return None
    except Exception as e:
        logger.debug("{}: Alpaca stock bars failed — {}", ticker, e)
        return None


def fetch_crypto_bars(
    symbol: str,
    days: int = 90,
    timeframe: str = "1Day",
) -> pd.DataFrame | None:
    """Fetch daily OHLCV bars for a crypto pair from Alpaca Data API v2.
    Symbol format: BTC/USD, ETH/USD, etc."""
    if not _is_configured():
        return None

    pair = f"{symbol}/USD" if "/" not in symbol else symbol
    start = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%dT00:00:00Z")
    end = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    all_bars: list[dict] = []
    next_page_token = None

    try:
        with httpx.Client(timeout=REQUEST_TIMEOUT, headers=_headers()) as client:
            while True:
                params: dict = {
                    "timeframe": timeframe,
                    "start": start,
                    "end": end,
                    "limit": 10000,
                }
                if next_page_token:
                    params["page_token"] = next_page_token

                resp = client.get(
                    f"{DATA_BASE}/v1beta3/crypto/us/bars",
                    params={"symbols": pair, **params},
                )
                resp.raise_for_status()
                data = resp.json()

                bars = data.get("bars", {}).get(pair, [])
                all_bars.extend(bars)

                next_page_token = data.get("next_page_token")
                if not next_page_token:
                    break

        if not all_bars:
            logger.debug("{}: Alpaca crypto returned 0 bars", symbol)
            return None

        df = pd.DataFrame(all_bars)
        df["t"] = pd.to_datetime(df["t"])
        df = df.rename(columns={
            "t": "date", "o": "open", "h": "high",
            "l": "low", "c": "close", "v": "volume",
        })
        df = df.set_index("date").sort_index()
        df = df[["open", "high", "low", "close", "volume"]].astype(float)

        logger.debug("{}: Alpaca crypto returned {} bars", symbol, len(df))
        return df

    except httpx.HTTPStatusError as e:
        if e.response.status_code in (401, 403):
            logger.warning("{}: Alpaca crypto auth failed ({})", symbol, e.response.status_code)
        else:
            logger.debug("{}: Alpaca crypto bars failed — {}", symbol, e)
        return None
    except Exception as e:
        logger.debug("{}: Alpaca crypto bars failed — {}", symbol, e)
        return None


def fetch_latest_quote_stock(ticker: str) -> dict | None:
    """Fetch latest quote for a single stock (IEX feed)."""
    if not _is_configured():
        return None
    try:
        resp = httpx.get(
            f"{DATA_BASE}/v2/stocks/{ticker}/quotes/latest",
            params={"feed": "iex"},
            headers=_headers(),
            timeout=REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
        q = resp.json().get("quote", {})
        return {
            "bid": q.get("bp"),
            "ask": q.get("ap"),
            "price": q.get("ap") or q.get("bp"),
            "size": q.get("as", 0) + q.get("bs", 0),
            "timestamp": q.get("t"),
        }
    except Exception as e:
        logger.debug("{}: Alpaca latest quote failed — {}", ticker, e)
        return None


def fetch_latest_quote_crypto(symbol: str) -> dict | None:
    """Fetch latest quote for a crypto pair."""
    if not _is_configured():
        return None
    pair = f"{symbol}/USD" if "/" not in symbol else symbol
    try:
        resp = httpx.get(
            f"{DATA_BASE}/v1beta3/crypto/us/latest/quotes",
            params={"symbols": pair},
            headers=_headers(),
            timeout=REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
        quotes = resp.json().get("quotes", {})
        q = quotes.get(pair, {})
        if not q:
            return None
        return {
            "bid": q.get("bp"),
            "ask": q.get("ap"),
            "price": q.get("ap") or q.get("bp"),
            "size": q.get("as", 0) + q.get("bs", 0),
            "timestamp": q.get("t"),
        }
    except Exception as e:
        logger.debug("{}: Alpaca crypto latest quote failed — {}", symbol, e)
        return None


def fetch_stock_snapshot(ticker: str) -> dict | None:
    """Fetch snapshot (latest trade, quote, minute/daily bar) for a stock."""
    if not _is_configured():
        return None
    try:
        resp = httpx.get(
            f"{DATA_BASE}/v2/stocks/{ticker}/snapshot",
            params={"feed": "iex"},
            headers=_headers(),
            timeout=REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        logger.debug("{}: Alpaca snapshot failed — {}", ticker, e)
        return None


def fetch_multi_stock_snapshots(tickers: list[str]) -> dict:
    """Fetch snapshots for multiple stocks in one call."""
    if not _is_configured() or not tickers:
        return {}
    try:
        resp = httpx.get(
            f"{DATA_BASE}/v2/stocks/snapshots",
            params={"symbols": ",".join(tickers), "feed": "iex"},
            headers=_headers(),
            timeout=REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        logger.debug("Alpaca multi-snapshot failed — {}", e)
        return {}
