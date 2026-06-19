"""
Stocks ingestion — yfinance (OHLCV) + FMP (fundamentals fallback) +
Alpha Vantage (price fallback) + Finnhub (news) + Pandas-TA indicators.
Runs every 60 minutes weekdays 9am-5pm ET via scheduler.
"""

import os
import time
from datetime import datetime, timedelta, timezone

import pandas as pd
import pandas_ta_classic as ta
import yfinance as yf
import httpx
import sentry_sdk
from loguru import logger
from dotenv import load_dotenv

from supabase_client import supabase

load_dotenv()

FINNHUB_KEY    = os.environ.get("FINNHUB_API_KEY", "")
FMP_KEY        = os.environ.get("FMP_API_KEY", "")
AV_KEY         = os.environ.get("ALPHA_VANTAGE_API_KEY", "")
MASSIVE_KEY    = os.environ.get("_MASSIVE_API_KEY", "")
FINNHUB_URL    = "https://finnhub.io/api/v1/company-news"
FINNHUB_CANDLE = "https://finnhub.io/api/v1/stock/candle"
FMP_QUOTE_URL  = "https://financialmodelingprep.com/api/v3/quote"
AV_URL         = "https://www.alphavantage.co/query"
MASSIVE_BASE   = "https://api.massive.com"
TICKER_DELAY_S = 0.5   # stay well under rate limits

DEFAULT_WATCHLIST = [
    # Mega-cap tech
    "AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA", "NFLX",

    # Semiconductors & hardware
    "AMD", "INTC", "MU", "MRVL", "QCOM", "AVGO", "ARM", "SMCI",
    "LRCX", "AMAT", "ALAB",

    # AI / cloud / SaaS
    "PLTR", "SNOW", "DDOG", "NET", "CRWD", "ZS", "COIN",

    # Fintech
    "HOOD", "SOFI", "SQ", "PYPL", "AFRM", "UPST",

    # Space, defense & hard tech
    "RKLB", "ASTS", "LUNR", "KTOS", "HII", "LMT",

    # EV & clean energy
    "RIVN", "LCID", "NIO", "ENPH", "FSLR", "VRT",

    # Biotech
    "MRNA", "BNTX", "RXRX", "CELH",

    # Consumer / retail tech
    "SHOP", "MELI", "CHWY", "RDDT",

    # Quantum & emerging AI
    "IONQ", "RGTI", "SOUN",

    # Momentum / meme
    "GME", "AMC", "MSTR",

    # Sector ETFs (give macro context)
    "SPY", "QQQ", "ARKK", "SOXX", "XBI",
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
        if not match:
            return None
        val = latest[match[0]]
        return float(val) if pd.notna(val) else None

    volume_sma_raw = latest.get("volume_sma_20")
    volume_sma = float(volume_sma_raw) if pd.notna(volume_sma_raw) and volume_sma_raw else None
    vol_ratio  = (float(latest["volume"]) / volume_sma) if volume_sma else None

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


# ─── Price fetch (yfinance → FMP → Alpha Vantage) ────────────────────────────

def _fetch_ohlcv_yfinance(ticker: str) -> pd.DataFrame | None:
    try:
        df = yf.download(ticker, period="90d", interval="1d",
                         auto_adjust=True, progress=False)
        if df.empty:
            return None
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)
        df.columns = [c.lower() for c in df.columns]
        return df
    except Exception as e:
        logger.debug("{}: yfinance failed — {}", ticker, e)
        return None


def _fetch_ohlcv_finnhub(ticker: str) -> pd.DataFrame | None:
    """Finnhub stock candles — we already have the key, use it."""
    if not FINNHUB_KEY:
        return None
    try:
        end   = int(datetime.now(timezone.utc).timestamp())
        start = int((datetime.now(timezone.utc) - timedelta(days=90)).timestamp())
        resp = httpx.get(
            FINNHUB_CANDLE,
            params={"symbol": ticker, "resolution": "D",
                    "from": start, "to": end, "token": FINNHUB_KEY},
            timeout=15.0,
        )
        resp.raise_for_status()
        data = resp.json()
        if data.get("s") != "ok" or not data.get("t"):
            return None
        df = pd.DataFrame({
            "date":   pd.to_datetime(data["t"], unit="s", utc=True).tz_localize(None),
            "open":   data["o"],
            "high":   data["h"],
            "low":    data["l"],
            "close":  data["c"],
            "volume": data["v"],
        }).set_index("date").sort_index()
        return df
    except Exception as e:
        logger.debug("{}: Finnhub candle failed — {}", ticker, e)
        return None


def _fetch_ohlcv_fmp(ticker: str) -> pd.DataFrame | None:
    """FMP historical daily via stable endpoint."""
    if not FMP_KEY:
        return None
    try:
        resp = httpx.get(
            "https://financialmodelingprep.com/stable/historical-price-eod/full",
            params={"symbol": ticker, "apikey": FMP_KEY},
            timeout=15.0,
        )
        resp.raise_for_status()
        data = resp.json()
        hist = data if isinstance(data, list) else data.get("historical", [])
        if not hist:
            return None
        df = pd.DataFrame(hist)
        df["date"] = pd.to_datetime(df["date"])
        df = df.sort_values("date").set_index("date")
        df.columns = [c.lower() for c in df.columns]
        df = df.tail(90)
        return df[["open", "high", "low", "close", "volume"]]
    except Exception as e:
        logger.debug("{}: FMP OHLCV failed — {}", ticker, e)
        return None


def _fetch_ohlcv_av(ticker: str) -> pd.DataFrame | None:
    """Alpha Vantage daily (free tier)."""
    if not AV_KEY:
        return None
    try:
        resp = httpx.get(
            AV_URL,
            params={"function": "TIME_SERIES_DAILY", "symbol": ticker,
                    "outputsize": "compact", "apikey": AV_KEY},
            timeout=15.0,
        )
        resp.raise_for_status()
        ts = resp.json().get("Time Series (Daily)", {})
        if not ts:
            return None
        rows = [
            {"date": pd.Timestamp(d), "open": float(v["1. open"]),
             "high": float(v["2. high"]), "low": float(v["3. low"]),
             "close": float(v["4. close"]), "volume": float(v["5. volume"])}
            for d, v in ts.items()
        ]
        df = pd.DataFrame(rows).sort_values("date").set_index("date")
        return df[["open", "high", "low", "close", "volume"]]
    except Exception as e:
        logger.debug("{}: Alpha Vantage failed — {}", ticker, e)
        return None


def _fetch_ohlcv_massive(ticker: str) -> pd.DataFrame | None:
    """Massive aggregate bars — EOD on free plan."""
    if not MASSIVE_KEY:
        return None
    try:
        end = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        start = (datetime.now(timezone.utc) - timedelta(days=90)).strftime("%Y-%m-%d")
        resp = httpx.get(
            f"{MASSIVE_BASE}/v2/aggs/ticker/{ticker}/range/1/day/{start}/{end}",
            params={"apiKey": MASSIVE_KEY},
            timeout=15.0,
        )
        resp.raise_for_status()
        results = resp.json().get("results", [])
        if not results:
            return None
        rows = []
        for r in results:
            rows.append({
                "date": pd.Timestamp(r["t"], unit="ms").tz_localize(None),
                "open": r["o"], "high": r["h"], "low": r["l"],
                "close": r["c"], "volume": r.get("v", 0),
            })
        df = pd.DataFrame(rows).sort_values("date").set_index("date")
        return df[["open", "high", "low", "close", "volume"]]
    except Exception as e:
        logger.debug("{}: Massive OHLCV failed — {}", ticker, e)
        return None


def _fetch_ohlcv(ticker: str) -> pd.DataFrame | None:
    """Fetch from ALL 5 sources, merge into one DataFrame for best coverage."""
    sources = [
        ("yfinance",      _fetch_ohlcv_yfinance),
        ("Finnhub",       _fetch_ohlcv_finnhub),
        ("FMP",           _fetch_ohlcv_fmp),
        ("Alpha Vantage", _fetch_ohlcv_av),
        ("Massive",       _fetch_ohlcv_massive),
    ]
    frames: list[pd.DataFrame] = []
    for name, fn in sources:
        try:
            df = fn(ticker)
            if df is not None and not df.empty:
                df.columns = [c.lower() for c in df.columns]
                logger.debug("{}: {} returned {} rows", ticker, name, len(df))
                frames.append(df[["open", "high", "low", "close", "volume"]])
            else:
                logger.debug("{}: {} — no data", ticker, name)
        except Exception as e:
            logger.debug("{}: {} — error: {}", ticker, name, e)

    if not frames:
        logger.warning("{}: ALL 5 sources returned no data", ticker)
        return None

    merged = frames[0]
    for extra in frames[1:]:
        new_dates = extra.index.difference(merged.index)
        if len(new_dates) > 0:
            merged = pd.concat([merged, extra.loc[new_dates]]).sort_index()
            logger.debug("{}: filled {} gap dates from additional source", ticker, len(new_dates))

    logger.info("{}: merged OHLCV — {} rows from {} sources", ticker, len(merged), len(frames))
    return merged


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
