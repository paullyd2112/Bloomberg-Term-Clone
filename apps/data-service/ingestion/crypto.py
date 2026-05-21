"""
Crypto ingestion — CoinGecko (market data) + CCXT/Binance (OHLCV) +
Fear & Greed index + Finnhub news.
Runs every 60 minutes all hours via scheduler.
"""

import os
import time
from datetime import datetime, timezone

import ccxt
import httpx
import numpy as np
import pandas as pd
import pandas_ta as ta
import sentry_sdk
from loguru import logger
from dotenv import load_dotenv

from supabase_client import supabase

load_dotenv()

FINNHUB_KEY = os.environ.get("FINNHUB_API_KEY", "")

COINGECKO_URL  = "https://api.coingecko.com/api/v3/coins/markets"
FEAR_GREED_URL = "https://api.alternative.me/fng/?limit=1"
FINNHUB_NEWS   = "https://finnhub.io/api/v1/news"

REQUEST_TIMEOUT = 15.0
COINGECKO_DELAY = 1.2   # respect free-tier rate limit (~50 req/min)

# Always include these regardless of market cap rank
PRIORITY_SYMBOLS = {"BTC", "ETH", "SOL", "DOGE", "PEPE", "BNB", "XRP", "AVAX", "MATIC", "WIF"}

# CoinGecko symbol → CCXT/Binance pair mapping overrides for non-standard names
CCXT_SYMBOL_MAP: dict[str, str] = {
    "MATIC": "POL/USDT",  # Polygon rebranded to POL on Binance
    "WIF":   "WIF/USDT",
    "PEPE":  "PEPE/USDT",
}


# ─── CoinGecko market data ────────────────────────────────────────────────────

def _fetch_coingecko_markets() -> list[dict]:
    """Fetch top 50 coins by market cap. Free tier, no key needed."""
    all_coins: list[dict] = []

    with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
        for page in (1, 2):  # 2 pages × 50 = top 100, we'll filter to 50 after merge
            try:
                resp = client.get(
                    COINGECKO_URL,
                    params={
                        "vs_currency":           "usd",
                        "order":                 "market_cap_desc",
                        "per_page":              50,
                        "page":                  page,
                        "sparkline":             "false",
                        "price_change_percentage": "24h",
                    },
                )
                resp.raise_for_status()
                all_coins.extend(resp.json())
                time.sleep(COINGECKO_DELAY)
            except Exception as e:
                logger.warning("CoinGecko page {} fetch error: {}", page, e)
                break

    logger.info("CoinGecko: fetched {} coins", len(all_coins))
    return all_coins


def _coingecko_to_symbol(coin: dict) -> str:
    return coin.get("symbol", "").upper()


# ─── CCXT / Binance OHLCV ────────────────────────────────────────────────────

_exchange = ccxt.binance({"enableRateLimit": True})


def _fetch_ohlcv(symbol: str) -> pd.DataFrame | None:
    """Fetch 168 hours (7 days) of 1h OHLCV from Binance."""
    pair = CCXT_SYMBOL_MAP.get(symbol, f"{symbol}/USDT")
    try:
        raw = _exchange.fetch_ohlcv(pair, timeframe="1h", limit=168)
        if not raw:
            return None
        df = pd.DataFrame(raw, columns=["timestamp", "open", "high", "low", "close", "volume"])
        df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms", utc=True)
        df = df.set_index("timestamp").astype(float)
        return df
    except Exception as e:
        logger.warning("{}: CCXT OHLCV fetch failed — {}", symbol, e)
        return None


# ─── Technical indicators ─────────────────────────────────────────────────────

def _compute_crypto_indicators(df: pd.DataFrame) -> dict:
    df = df.copy()

    # RSI 14
    df.ta.rsi(length=14, append=True)

    # MACD (12, 26, 9)
    df.ta.macd(fast=12, slow=26, signal=9, append=True)

    # Volume anomaly — ratio vs 7-day (168h) average
    volume_avg = df["volume"].mean()
    latest_vol = float(df["volume"].iloc[-1])
    volume_ratio = round(latest_vol / volume_avg, 2) if volume_avg else None

    latest = df.iloc[-1]

    def _col(prefix: str) -> float | None:
        match = [c for c in df.columns if c.lower().startswith(prefix.lower())]
        val = latest[match[0]] if match else None
        return float(val) if val is not None and not np.isnan(val) else None

    return {
        "rsi_14":       _col("rsi_"),
        "macd_line":    _col("macd_"),
        "macd_signal":  _col("macds_"),
        "macd_hist":    _col("macdh_"),
        "volume_ratio": volume_ratio,      # >1.5 = above-average, >3 = anomaly
        "close":        float(latest["close"]),
        "volume_24h":   float(df["volume"].tail(24).sum()),  # last 24 1h bars
    }


# ─── Fear & Greed index ───────────────────────────────────────────────────────

def _fetch_fear_greed() -> dict | None:
    try:
        resp = httpx.get(FEAR_GREED_URL, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        data = resp.json().get("data", [{}])[0]
        return {
            "value":              int(data.get("value", 0)),
            "value_classification": data.get("value_classification", ""),
            "timestamp":          data.get("timestamp", ""),
        }
    except Exception as e:
        logger.warning("Fear & Greed fetch failed: {}", e)
        return None


def _store_fear_greed(fg: dict) -> None:
    try:
        supabase.table("raw_prices").insert({
            "asset_type": "crypto",
            "identifier": "MARKET_SENTIMENT",
            "price":      float(fg["value"]),
            "volume":     None,
            "change_24h": None,
            "metadata":   fg,
        }).execute()
    except Exception as e:
        logger.warning("Fear & Greed store failed: {}", e)


# ─── News ─────────────────────────────────────────────────────────────────────

def _fetch_and_store_crypto_news() -> int:
    """Fetch general crypto news from Finnhub and store top 10 items."""
    if not FINNHUB_KEY:
        return 0
    try:
        resp = httpx.get(
            FINNHUB_NEWS,
            params={"category": "crypto", "token": FINNHUB_KEY},
            timeout=REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
        articles = resp.json()
    except Exception as e:
        logger.warning("Finnhub crypto news failed: {}", e)
        return 0

    rows = [
        {
            "asset_type":      "crypto",
            "identifier":      "CRYPTO_GENERAL",
            "headline":        a.get("headline", ""),
            "source":          a.get("source", ""),
            "url":             a.get("url", ""),
            "sentiment_score": None,
            "published_at":    datetime.fromtimestamp(
                a["datetime"], tz=timezone.utc
            ).isoformat() if a.get("datetime") else None,
        }
        for a in articles[:10]
        if a.get("headline")
    ]

    if rows:
        try:
            supabase.table("news_items").insert(rows).execute()
        except Exception as e:
            logger.warning("Crypto news_items insert failed: {}", e)

    return len(rows)


# ─── Per-coin ingestion ───────────────────────────────────────────────────────

def _ingest_coin(cg_data: dict) -> bool:
    symbol = _coingecko_to_symbol(cg_data)
    if not symbol:
        return False

    # Base record from CoinGecko
    record: dict = {
        "asset_type": "crypto",
        "identifier": symbol,
        "price":      cg_data.get("current_price"),
        "volume":     cg_data.get("total_volume"),
        "change_24h": cg_data.get("price_change_percentage_24h"),
        "metadata": {
            "source":                "coingecko",
            "name":                  cg_data.get("name", ""),
            "market_cap":            cg_data.get("market_cap"),
            "market_cap_rank":       cg_data.get("market_cap_rank"),
            "sentiment_votes_up_pct": cg_data.get("sentiment_votes_up_percentage"),
            "ath":                   cg_data.get("ath"),
            "ath_change_pct":        cg_data.get("ath_change_percentage"),
        },
    }

    # Enrich with CCXT OHLCV + Pandas-TA indicators
    df = _fetch_ohlcv(symbol)
    if df is not None:
        try:
            indicators = _compute_crypto_indicators(df)
            record["metadata"].update(indicators)
        except Exception as e:
            logger.warning("{}: indicator computation failed — {}", symbol, e)

    try:
        supabase.table("raw_prices").insert(record).execute()
        return True
    except Exception as e:
        logger.error("{}: raw_prices insert failed — {}", symbol, e)
        sentry_sdk.capture_exception(e)
        return False


# ─── Main ingestion function ───────────────────────────────────────────────────

def ingest_crypto() -> str:
    """
    Fetch top 50 CoinGecko coins + priority list, enrich with CCXT indicators,
    store Fear & Greed, fetch crypto news.
    Returns summary string for scheduler log.
    """
    logger.info("Starting crypto ingestion")

    # Fear & Greed first — useful context even if coins fail
    fg = _fetch_fear_greed()
    if fg:
        _store_fear_greed(fg)
        logger.info("Fear & Greed: {} ({})", fg["value"], fg["value_classification"])

    # Fetch CoinGecko market data
    cg_coins = _fetch_coingecko_markets()

    # Ensure priority symbols are included even if outside top 50
    cg_symbols = {_coingecko_to_symbol(c) for c in cg_coins}
    missing_priority = PRIORITY_SYMBOLS - cg_symbols

    if missing_priority:
        logger.info("Fetching {} priority coins not in top-50: {}",
                    len(missing_priority), missing_priority)
        try:
            resp = httpx.get(
                COINGECKO_URL,
                params={
                    "vs_currency": "usd",
                    "symbols":     ",".join(s.lower() for s in missing_priority),
                    "order":       "market_cap_desc",
                    "per_page":    50,
                    "page":        1,
                    "sparkline":   "false",
                },
                timeout=REQUEST_TIMEOUT,
            )
            resp.raise_for_status()
            extra = [c for c in resp.json()
                     if _coingecko_to_symbol(c) in missing_priority]
            cg_coins.extend(extra)
        except Exception as e:
            logger.warning("Priority coin fetch failed: {}", e)

    # Deduplicate by symbol, keep first (highest market cap)
    seen:    set[str] = set()
    unique:  list[dict] = []
    for coin in cg_coins:
        sym = _coingecko_to_symbol(coin)
        if sym and sym not in seen:
            seen.add(sym)
            unique.append(coin)

    success = 0
    failed  = 0

    for coin in unique:
        try:
            ok = _ingest_coin(coin)
            if ok:
                success += 1
            else:
                failed += 1
        except Exception as e:
            logger.error("{}: unhandled error — {}", _coingecko_to_symbol(coin), e)
            sentry_sdk.capture_exception(e)
            failed += 1

    # General crypto news
    news_count = _fetch_and_store_crypto_news()

    summary = (
        f"{success} coins ingested, {failed} failed, "
        f"{news_count} news items, "
        f"F&G={fg['value'] if fg else 'N/A'}"
    )
    logger.info("Crypto ingestion complete — {}", summary)
    return summary
