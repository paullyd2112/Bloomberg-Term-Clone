"""
Alpaca Markets client — REST (historical bars) + WebSocket (live quotes).
Primary data source for stocks and crypto. Paper trading compatible.

Env vars:
  ALPACA_API_KEY, ALPACA_API_SECRET
  ALPACA_BASE_URL (default: https://paper-api.alpaca.markets)
"""

import os
import re
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


CORPORATE_ACTION_TYPES = [
    "forward_split", "reverse_split", "unit_split",
    "cash_dividend", "stock_dividend",
    "spin_off",
    "cash_merger", "stock_merger", "stock_and_cash_merger",
]


def fetch_corporate_actions(symbols: list[str], days_ahead: int = 30, days_back: int = 7) -> list[dict]:
    """Fetch upcoming/recent corporate actions (splits, dividends, spinoffs, mergers)
    for a batch of tickers from Alpaca's Corporate Actions API.

    Returns a flat list of dicts, each tagged with its own `ca_type`, since Alpaca's
    response groups results by action type rather than returning one flat list.
    """
    if not _is_configured() or not symbols:
        return []

    start = (datetime.now(timezone.utc) - timedelta(days=days_back)).strftime("%Y-%m-%d")
    end = (datetime.now(timezone.utc) + timedelta(days=days_ahead)).strftime("%Y-%m-%d")

    flat: list[dict] = []
    try:
        with httpx.Client(timeout=REQUEST_TIMEOUT, headers=_headers()) as client:
            resp = client.get(
                f"{DATA_BASE}/v1/corporate-actions",
                params={
                    "symbols": ",".join(symbols),
                    "types": ",".join(CORPORATE_ACTION_TYPES),
                    "start": start,
                    "end": end,
                    "limit": 1000,
                },
            )
            resp.raise_for_status()
            data = resp.json()

            actions = data.get("corporate_actions") or {}
            # Alpaca groups by pluralized type key (e.g. "cash_dividends", "forward_splits") —
            # iterate whatever keys are actually present rather than hardcoding the mapping,
            # so an unexpected/renamed key doesn't silently drop a whole action type.
            for key, items in actions.items():
                if not isinstance(items, list):
                    continue
                for item in items:
                    flat.append({**item, "ca_type": key})

        return flat
    except httpx.HTTPStatusError as e:
        if e.response.status_code in (401, 403):
            logger.warning("Alpaca corporate actions auth failed ({})", e.response.status_code)
        else:
            logger.debug("Alpaca corporate actions fetch failed — {}", e)
        return []
    except Exception as e:
        logger.debug("Alpaca corporate actions fetch failed — {}", e)
        return []


_OCC_EXPIRY_RE = re.compile(r"(\d{6})[CP]\d{8}$")


def parse_occ_symbol(contract_symbol: str) -> dict | None:
    """Parse an OCC-style option contract symbol, e.g. AAPL260629C00220000."""
    m = re.match(r"^([A-Z]+)(\d{6})([CP])(\d{8})$", contract_symbol)
    if not m:
        return None
    root, exp_raw, cp, strike_raw = m.groups()
    return {
        "root":          root,
        "expiry":        f"20{exp_raw[0:2]}-{exp_raw[2:4]}-{exp_raw[4:6]}",
        "contract_type": "call" if cp == "C" else "put",
        "strike":        int(strike_raw) / 1000.0,
    }


def fetch_options_snapshots(underlying: str, max_expiries: int = 3, feed: str = "indicative") -> dict:
    """Fetch options snapshots for an underlying, limited to its nearest N expiries.
    Returns {contract_symbol: snapshot_dict} (latestTrade, latestQuote, dailyBar, greeks, openInterest)."""
    if not _is_configured():
        return {}

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    all_snapshots: dict = {}
    next_page_token = None

    try:
        with httpx.Client(timeout=REQUEST_TIMEOUT, headers=_headers()) as client:
            while True:
                params: dict = {
                    "feed": feed,
                    "limit": 1000,
                    "expiration_date_gte": today,
                }
                if next_page_token:
                    params["page_token"] = next_page_token

                resp = client.get(
                    f"{DATA_BASE}/v1beta1/options/snapshots/{underlying}",
                    params=params,
                )
                resp.raise_for_status()
                data = resp.json()

                all_snapshots.update(data.get("snapshots") or {})

                next_page_token = data.get("next_page_token")
                if not next_page_token:
                    break

                # Stop once we've collected contracts spanning enough distinct expiries —
                # avoids paginating through an underlying's full chain (LEAPS etc).
                expiries = {m.group(1) for sym in all_snapshots if (m := _OCC_EXPIRY_RE.search(sym))}
                if len(expiries) >= max_expiries and len(all_snapshots) > 200:
                    break

        return all_snapshots

    except httpx.HTTPStatusError as e:
        if e.response.status_code in (401, 403):
            logger.warning("{}: Alpaca options auth failed ({})", underlying, e.response.status_code)
        else:
            logger.debug("{}: Alpaca options snapshots failed — {}", underlying, e)
        return {}
    except Exception as e:
        logger.debug("{}: Alpaca options snapshots failed — {}", underlying, e)
        return {}
