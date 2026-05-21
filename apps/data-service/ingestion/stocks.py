"""
Stocks ingestion — yfinance + Pandas-TA indicators + Finnhub news.
Runs every 60 minutes weekdays 9am-5pm ET via scheduler.
"""

import os
import time
from datetime import datetime, timedelta, timezone

import pandas as pd
import pandas_ta as ta
import yfinance as yf
import httpx
import sentry_sdk
from loguru import logger
from dotenv import load_dotenv

from supabase_client import supabase

load_dotenv()

FINNHUB_KEY    = os.environ.get("FINNHUB_API_KEY", "")
FINNHUB_URL    = "https://finnhub.io/api/v1/company-news"
TICKER_DELAY_S = 0.5   # stay well under rate limits

DEFAULT_WATCHLIST = [
    "AAPL", "TSLA", "NVDA", "MSFT", "AMZN",
    "META", "GOOGL", "AMD",  "COIN", "PLTR",
    "SPY",  "QQQ",  "ARKK", "GME",  "AMC",
    "HOOD", "SOFI", "MSTR", "ARM",  "SMCI",
]


def get_default_watchlist() -> list[str]:
    return DEFAULT_WATCHLIST.copy()


# ─── Technical indicators ─────────────────────────────────────────────────────

def _compute_indicators(df: pd.DataFrame) -> dict:
    """
    Compute technical indicators on OHLCV DataFrame.
    Returns dict of latest indicator values.
    """
    # Ensure lowercase columns
    df.columns = [c.lower() for c in df.columns]

    if len(df) < 50:
        logger.warning("Not enough bars for full indicator set ({} rows)", len(df))

    df = df.copy()

    # RSI 14
    df.ta.rsi(length=14, append=True)

    # MACD (12, 26, 9)
    df.ta.macd(fast=12, slow=26, signal=9, append=True)

    # Bollinger Bands (20, 2)
    df.ta.bbands(length=20, std=2, append=True)

    # Volume SMA 20
    df["volume_sma_20"] = df["volume"].rolling(20).mean()

    # Price vs 50-day SMA
    df["sma_50"]            = df["close"].rolling(50).mean()
    df["price_vs_sma50_pct"] = ((df["close"] - df["sma_50"]) / df["sma_50"] * 100)

    latest = df.iloc[-1]
    prev   = df.iloc[-2] if len(df) >= 2 else latest

    # Resolve Pandas-TA column names (they include params in name)
    def _col(prefix: str) -> float | None:
        match = [c for c in df.columns if c.startswith(prefix.lower())]
        return float(latest[match[0]]) if match else None

    volume_sma = latest.get("volume_sma_20")
    vol_ratio  = (float(latest["volume"]) / float(volume_sma)) if volume_sma else None

    return {
        "rsi_14":              _col("rsi_"),
        "macd_line":           _col("macd_"),
        "macd_signal":         _col("macds_"),
        "macd_hist":           _col("macdh_"),
        "bb_upper":            _col("bbu_"),
        "bb_middle":           _col("bbm_"),
        "bb_lower":            _col("bbl_"),
        "bb_bandwidth":        _col("bbb_"),
        "volume_sma_20":       float(volume_sma) if volume_sma else None,
        "volume_ratio":        round(vol_ratio, 2) if vol_ratio else None,
        "sma_50":              float(latest["sma_50"]) if pd.notna(latest["sma_50"]) else None,
        "price_vs_sma50_pct":  round(float(latest["price_vs_sma50_pct"]), 2)
                               if pd.notna(latest["price_vs_sma50_pct"]) else None,
        "close":               float(latest["close"]),
        "volume":              float(latest["volume"]),
        "change_1d_pct":       round(
            (float(latest["close"]) - float(prev["close"])) / float(prev["close"]) * 100, 2
        ) if len(df) >= 2 else None,
    }


# ─── Price fetch ──────────────────────────────────────────────────────────────

def _fetch_ohlcv(ticker: str) -> pd.DataFrame | None:
    """Fetch 90 days of daily OHLCV via yfinance."""
    try:
        df = yf.download(
            ticker,
            period="90d",
            interval="1d",
            auto_adjust=True,
            progress=False,
        )
        if df.empty:
            logger.warning("{}: empty OHLCV response", ticker)
            return None
        # yfinance returns MultiIndex columns when downloading single ticker
        # with some versions — flatten if needed
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)
        df.columns = [c.lower() for c in df.columns]
        return df
    except Exception as e:
        logger.error("{}: OHLCV fetch failed — {}", ticker, e)
        sentry_sdk.capture_exception(e)
        return None


# ─── News fetch ───────────────────────────────────────────────────────────────

def _fetch_and_store_news(ticker: str) -> int:
    if not FINNHUB_KEY:
        return 0

    today = datetime.now(timezone.utc)
    from_dt = (today - timedelta(days=3)).strftime("%Y-%m-%d")
    to_dt   = today.strftime("%Y-%m-%d")

    try:
        resp = httpx.get(
            FINNHUB_URL,
            params={"symbol": ticker, "from": from_dt, "to": to_dt, "token": FINNHUB_KEY},
            timeout=10.0,
        )
        resp.raise_for_status()
        articles = resp.json()
    except Exception as e:
        logger.warning("{}: Finnhub news fetch failed — {}", ticker, e)
        return 0

    if not articles:
        return 0

    rows = [
        {
            "asset_type":      "stock",
            "identifier":      ticker,
            "headline":        a.get("headline", ""),
            "source":          a.get("source", ""),
            "url":             a.get("url", ""),
            "sentiment_score": a.get("sentiment", {}).get("compound")
                               if isinstance(a.get("sentiment"), dict) else None,
            "published_at":    datetime.fromtimestamp(
                a["datetime"], tz=timezone.utc
            ).isoformat() if a.get("datetime") else None,
        }
        for a in articles[:5]          # cap at 5 most recent per run
        if a.get("headline")
    ]

    if rows:
        try:
            supabase.table("news_items").insert(rows).execute()
        except Exception as e:
            logger.warning("{}: news_items insert failed — {}", ticker, e)

    return len(rows)


# ─── Per-ticker ingestion ─────────────────────────────────────────────────────

def _ingest_ticker(ticker: str) -> bool:
    """Fetch OHLCV, compute indicators, write raw_prices + news. Returns success."""
    df = _fetch_ohlcv(ticker)
    if df is None:
        return False

    try:
        indicators = _compute_indicators(df)
    except Exception as e:
        logger.error("{}: indicator computation failed — {}", ticker, e)
        sentry_sdk.capture_exception(e)
        return False

    record = {
        "asset_type": "stock",
        "identifier": ticker,
        "price":      indicators["close"],
        "volume":     indicators["volume"],
        "change_24h": indicators["change_1d_pct"],
        "metadata":   indicators,
    }

    try:
        supabase.table("raw_prices").insert(record).execute()
    except Exception as e:
        logger.error("{}: raw_prices insert failed — {}", ticker, e)
        sentry_sdk.capture_exception(e)
        return False

    _fetch_and_store_news(ticker)
    return True


# ─── Main ingestion function ───────────────────────────────────────────────────

def ingest_stocks(tickers: list[str] | None = None) -> str:
    """
    Ingest OHLCV + indicators + news for each ticker.
    Returns summary string for scheduler log.
    """
    tickers = tickers or get_default_watchlist()
    logger.info("Starting stocks ingestion for {} tickers", len(tickers))

    success = 0
    failed  = 0

    for ticker in tickers:
        try:
            ok = _ingest_ticker(ticker)
            if ok:
                success += 1
            else:
                failed += 1
        except Exception as e:
            # Belt-and-suspenders: _ingest_ticker already catches, but never crash
            logger.error("{}: unhandled error — {}", ticker, e)
            sentry_sdk.capture_exception(e)
            failed += 1

        time.sleep(TICKER_DELAY_S)

    summary = f"{success} tickers ingested, {failed} failed"
    logger.info("Stocks ingestion complete — {}", summary)
    return summary
