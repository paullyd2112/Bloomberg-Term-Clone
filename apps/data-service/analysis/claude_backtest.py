"""
Sampled Claude backtest — calls the real scoring engine (Claude via Instructor)
on historical data points, then evaluates against actual future prices.

Unlike the rules-based backtest in backtest.py, this validates the ACTUAL product:
same prompts, same context, same model. Cost: ~$0.01 per signal (40 signals ≈ $0.50).

Usage:
    from analysis.claude_backtest import run_claude_backtest
    results = run_claude_backtest()

Or via scheduler endpoint:
    POST /backtest/claude
"""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

import httpx
import numpy as np
import pandas as pd
import pandas_ta_classic as ta
import anthropic
import instructor
from loguru import logger
from pydantic import BaseModel, Field
from dotenv import load_dotenv

from prompts import stocks as stocks_prompt
from prompts import crypto as crypto_prompt
from ingestion.alpaca_client import fetch_stock_bars, fetch_crypto_bars

load_dotenv()

MODEL      = "claude-sonnet-4-6"
MAX_TOKENS = 1024

FMP_KEY     = os.environ.get("FMP_API_KEY", "")
AV_KEY      = os.environ.get("ALPHA_VANTAGE_API_KEY", "")
CG_KEY      = os.environ.get("COINGECKO_API_KEY", "")
FINNHUB_KEY = os.environ.get("FINNHUB_API_KEY", "")
MASSIVE_KEY = os.environ.get("_MASSIVE_API_KEY", "")
FMP_BASE    = "https://financialmodelingprep.com/api/v3"
CG_BASE     = "https://api.coingecko.com/api/v3"
MASSIVE_BASE   = "https://api.massive.com"
FINNHUB_CANDLE = "https://finnhub.io/api/v1/stock/candle"
AV_URL         = "https://www.alphavantage.co/query"

DATE_FROM = "2026-02-01"
DATE_TO   = "2026-06-16"

SAMPLE_DATES = ["2026-02-20", "2026-03-12", "2026-03-27",
                "2026-04-10", "2026-04-24", "2026-05-08",
                "2026-05-22", "2026-06-04"]

SAMPLE_STOCKS = ["AAPL", "NVDA", "TSLA", "PLTR", "AMD",
                 "META", "GOOGL", "COIN", "SOFI", "HOOD"]

CRYPTO_ASSETS = [
    ("BTC", "bitcoin"),
    ("ETH", "ethereum"),
    ("SOL", "solana"),
    ("XRP", "ripple"),
    ("ADA", "cardano"),
]

EVAL_WINDOWS = {
    "intraday": 1,
    "swing":    5,
    "longterm": 15,
}

LOSS_THRESHOLDS = {
    ("stock", "intraday"):  0.015,
    ("stock", "swing"):     0.05,
    ("stock", "longterm"):  0.10,
    ("crypto", "intraday"): 0.03,
    ("crypto", "swing"):    0.10,
    ("crypto", "longterm"): 0.20,
}

WIN_THRESHOLDS = {
    ("stock", "intraday"):  0.005,
    ("stock", "swing"):     0.02,
    ("stock", "longterm"):  0.05,
    ("crypto", "intraday"): 0.015,
    ("crypto", "swing"):    0.05,
    ("crypto", "longterm"): 0.10,
}


# ─── Pydantic models (mirror scoring/engine.py) ─────────────────────────────

class StockSignal(BaseModel):
    direction:    Literal["BUY", "SELL", "HOLD"]
    confidence:   int    = Field(..., ge=0, le=100)
    reasoning:    str    = Field(..., min_length=20)
    time_horizon: Literal["intraday", "swing", "longterm"]
    key_risk:     str
    news_context: list[str] = Field(default_factory=list, max_length=3)


class CryptoSignal(BaseModel):
    direction:        Literal["BUY", "SELL", "HOLD"]
    confidence:       int    = Field(..., ge=0, le=100)
    reasoning:        str    = Field(..., min_length=20)
    time_horizon:     Literal["intraday", "swing", "longterm"]
    sentiment_driver: str
    news_context:     list[str] = Field(default_factory=list, max_length=3)


# ─── Data structures ────────────────────────────────────────────────────────

@dataclass
class ClaudeSignalResult:
    ticker:          str
    asset_class:     str
    sample_date:     str
    direction:       str
    confidence:      int
    time_horizon:    str
    reasoning:       str
    entry_price:     float
    stop_loss_pct:   float = 4.0
    take_profit_pct: float = 8.0
    exit_price:      float | None = None
    return_pct:      float | None = None
    outcome:         str = "PENDING"
    exit_reason:     str = ""
    max_favorable:   float | None = None
    max_adverse:     float | None = None
    position_weight: float = 1.0
    rsi:             float | None = None
    macd_hist:       float | None = None
    volume_ratio:    float | None = None
    change_24h:      float | None = None


# ─── Data fetching (reuse from backtest.py) ──────────────────────────────────

def _get_json(url: str, headers: dict | None = None) -> dict | None:
    try:
        resp = httpx.get(url, headers=headers or {}, timeout=15.0)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        logger.debug("HTTP fetch failed: {} — {}", url[:80], e)
        return None


_NEEDED_COLS = {"open", "high", "low", "close", "volume"}


def _normalize_ohlcv(df: pd.DataFrame | None) -> pd.DataFrame | None:
    """Lower-case cols, strip tz, validate required columns, clip to date range."""
    if df is None or df.empty:
        return None
    df = df.copy()
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
    df.columns = [c.lower() for c in df.columns]
    if not _NEEDED_COLS.issubset(df.columns):
        return None
    df.index = pd.to_datetime(df.index).tz_localize(None)
    df = df.sort_index()
    df = df[(df.index >= pd.Timestamp(DATE_FROM)) & (df.index <= pd.Timestamp(DATE_TO))]
    if df.empty:
        return None
    return df[list(_NEEDED_COLS)].astype(float)


def _days_needed() -> int:
    return (datetime.now(timezone.utc).date()
            - datetime.strptime(DATE_FROM, "%Y-%m-%d").date()).days + 5


MIN_ROWS_FOR_SOLE_SOURCE = 80  # ~ full Feb-Jun trading-day range; below this we merge fallbacks


def _stock_alpaca(ticker: str) -> pd.DataFrame | None:
    return _normalize_ohlcv(fetch_stock_bars(ticker, days=_days_needed()))


def _crypto_alpaca(symbol: str) -> pd.DataFrame | None:
    return _normalize_ohlcv(fetch_crypto_bars(symbol, days=_days_needed()))


def _stock_yfinance(ticker: str) -> pd.DataFrame | None:
    try:
        import yfinance as yf
        for period in ("200d", "90d", "ytd", "6mo", "1y"):
            df = yf.download(ticker, period=period, interval="1d",
                             auto_adjust=True, progress=False)
            if df is not None and not df.empty:
                logger.debug("[claude_backtest] {} yfinance download worked with period={}", ticker, period)
                return _normalize_ohlcv(df)
        t = yf.Ticker(ticker)
        df = t.history(period="6mo", auto_adjust=True)
        if df is not None and not df.empty:
            logger.debug("[claude_backtest] {} yfinance Ticker.history worked", ticker)
            return _normalize_ohlcv(df)
        return None
    except Exception as e:
        logger.debug("[claude_backtest] {} yfinance failed — {}", ticker, e)
        return None


def _stock_finnhub(ticker: str) -> pd.DataFrame | None:
    if not FINNHUB_KEY:
        return None
    try:
        start = int(datetime.strptime(DATE_FROM, "%Y-%m-%d").replace(tzinfo=timezone.utc).timestamp())
        end   = int(datetime.strptime(DATE_TO,   "%Y-%m-%d").replace(tzinfo=timezone.utc).timestamp())
        url = (f"{FINNHUB_CANDLE}?symbol={ticker}&resolution=D"
               f"&from={start}&to={end}&token={FINNHUB_KEY}")
        data = _get_json(url)
        if not data or data.get("s") != "ok" or not data.get("t"):
            return None
        df = pd.DataFrame({
            "date":   pd.to_datetime(data["t"], unit="s", utc=True).tz_localize(None),
            "open":   data["o"], "high": data["h"], "low": data["l"],
            "close":  data["c"], "volume": data["v"],
        }).set_index("date")
        return _normalize_ohlcv(df)
    except Exception as e:
        logger.debug("[claude_backtest] {} Finnhub failed — {}", ticker, e)
        return None


def _stock_fmp(ticker: str) -> pd.DataFrame | None:
    if not FMP_KEY:
        return None
    endpoints = [
        f"https://financialmodelingprep.com/stable/historical-price-eod/full?symbol={ticker}&from={DATE_FROM}&to={DATE_TO}&apikey={FMP_KEY}",
        f"https://financialmodelingprep.com/api/v3/historical-price-full/{ticker}?from={DATE_FROM}&to={DATE_TO}&apikey={FMP_KEY}",
    ]
    for url in endpoints:
        try:
            data = _get_json(url)
            if not data:
                continue
            hist = data.get("historical", []) if isinstance(data, dict) else data if isinstance(data, list) else []
            if not hist:
                continue
            df = pd.DataFrame(hist)
            df["date"] = pd.to_datetime(df["date"])
            df = df.set_index("date")
            result = _normalize_ohlcv(df)
            if result is not None:
                return result
        except Exception as e:
            logger.debug("[claude_backtest] {} FMP endpoint failed — {}", ticker, e)
    return None


def _stock_alphavantage(ticker: str) -> pd.DataFrame | None:
    if not AV_KEY:
        return None
    try:
        url = (f"{AV_URL}?function=TIME_SERIES_DAILY&symbol={ticker}"
               f"&outputsize=compact&apikey={AV_KEY}")
        data = _get_json(url)
        ts = (data or {}).get("Time Series (Daily)", {})
        if not ts:
            return None
        rows = [
            {"date": pd.Timestamp(d), "open": float(v["1. open"]),
             "high": float(v["2. high"]), "low": float(v["3. low"]),
             "close": float(v["4. close"]), "volume": float(v["5. volume"])}
            for d, v in ts.items()
        ]
        df = pd.DataFrame(rows).set_index("date")
        return _normalize_ohlcv(df)
    except Exception as e:
        logger.debug("[claude_backtest] {} Alpha Vantage failed — {}", ticker, e)
        return None


def _stock_massive(ticker: str) -> pd.DataFrame | None:
    if not MASSIVE_KEY:
        return None
    try:
        url = (f"{MASSIVE_BASE}/v2/aggs/ticker/{ticker}/range/1/day"
               f"/{DATE_FROM}/{DATE_TO}?apiKey={MASSIVE_KEY}")
        data = _get_json(url)
        results = (data or {}).get("results", [])
        if not results:
            return None
        rows = []
        for r in results:
            rows.append({
                "date": pd.Timestamp(r["t"], unit="ms").tz_localize(None),
                "open": r["o"], "high": r["h"], "low": r["l"],
                "close": r["c"], "volume": r.get("v", 0),
            })
        df = pd.DataFrame(rows).set_index("date")
        return _normalize_ohlcv(df)
    except Exception as e:
        logger.debug("[claude_backtest] {} Massive failed — {}", ticker, e)
        return None


def _fetch_stock_ohlcv(ticker: str) -> pd.DataFrame | None:
    """Alpaca primary — used alone if it covers the full range. Other sources
    are fallbacks only, merged in if Alpaca is missing or insufficient."""
    alpaca_df = _stock_alpaca(ticker)
    if alpaca_df is not None and len(alpaca_df) >= MIN_ROWS_FOR_SOLE_SOURCE:
        logger.info("[claude_backtest] {} — Alpaca returned {} rows, using as sole source", ticker, len(alpaca_df))
        return alpaca_df

    logger.warning(
        "[claude_backtest] {} — Alpaca insufficient ({} rows) — falling back to other sources",
        ticker, len(alpaca_df) if alpaca_df is not None else 0,
    )
    sources = [
        ("yfinance",      _stock_yfinance),
        ("Finnhub",       _stock_finnhub),
        ("FMP",           _stock_fmp),
        ("Massive",       _stock_massive),
        ("Alpha Vantage", _stock_alphavantage),
    ]
    frames: list[pd.DataFrame] = [alpaca_df] if alpaca_df is not None and not alpaca_df.empty else []
    for name, fn in sources:
        try:
            df = fn(ticker)
            if df is not None and not df.empty:
                logger.info("[claude_backtest] {} — {} returned {} rows", ticker, name, len(df))
                frames.append(df)
            else:
                logger.debug("[claude_backtest] {} — {} no data", ticker, name)
        except Exception as e:
            logger.debug("[claude_backtest] {} — {} error: {}", ticker, name, e)

    if not frames:
        logger.warning("[claude_backtest] {} — ALL 5 sources returned no data", ticker)
        return None

    merged = frames[0]
    for extra in frames[1:]:
        new_dates = extra.index.difference(merged.index)
        if len(new_dates) > 0:
            merged = pd.concat([merged, extra.loc[new_dates]]).sort_index()
            logger.info("[claude_backtest] {} — filled {} gap dates from additional source", ticker, len(new_dates))

    merged = merged[~merged.index.duplicated(keep="first")]
    logger.info("[claude_backtest] {} — merged OHLCV: {} total rows from {} sources", ticker, len(merged), len(frames))
    return merged


def diagnose_stock_sources(tickers: list[str] | None = None) -> dict:
    """
    Zero-cost data-layer diagnostic. For each ticker, try all 4 sources and
    report exactly what each returned (row count or error). No Claude calls.

    This answers definitively: can we get historical stock data on this host,
    and from which source — without spending anything or guessing from logs.
    """
    tickers = tickers or SAMPLE_STOCKS[:3]
    sources = [
        ("alpaca",        _stock_alpaca),
        ("yfinance",      _stock_yfinance),
        ("finnhub",       _stock_finnhub),
        ("fmp",           _stock_fmp),
        ("massive",       _stock_massive),
        ("alpha_vantage", _stock_alphavantage),
    ]

    report: dict = {
        "date_range": f"{DATE_FROM} → {DATE_TO}",
        "primary_source": "alpaca",
        "keys_present": {
            "alpaca":        bool(os.environ.get("ALPACA_API_KEY")),
            "finnhub":       bool(FINNHUB_KEY),
            "fmp":           bool(FMP_KEY),
            "massive":       bool(MASSIVE_KEY),
            "alpha_vantage": bool(AV_KEY),
        },
        "tickers": {},
    }

    ticker_0 = tickers[0]
    raw_tests: dict = {}

    try:
        df = _stock_alpaca(ticker_0)
        raw_tests["alpaca"] = (
            f"OK — {len(df)} rows ({df.index[0].date()} → {df.index[-1].date()})"
            if df is not None and not df.empty else "no data (None/empty)"
        )
    except Exception as e:
        raw_tests["alpaca"] = f"ERROR: {type(e).__name__}: {str(e)[:200]}"

    try:
        import yfinance as yf
        yf_results = []
        for p in ("200d", "90d", "ytd", "6mo", "1y"):
            df = yf.download(ticker_0, period=p, interval="1d",
                             auto_adjust=True, progress=False)
            if df is not None and not df.empty:
                yf_results.append(f"download({p})={len(df)}rows")
                break
            else:
                yf_results.append(f"download({p})=empty")
        t = yf.Ticker(ticker_0)
        df2 = t.history(period="6mo", auto_adjust=True)
        if df2 is not None and not df2.empty:
            yf_results.append(f"Ticker.history(6mo)={len(df2)}rows")
        else:
            yf_results.append("Ticker.history(6mo)=empty")
        raw_tests["yfinance"] = " | ".join(yf_results)
    except Exception as e:
        raw_tests["yfinance"] = f"ERROR: {type(e).__name__}: {str(e)[:200]}"

    if FINNHUB_KEY:
        try:
            start_ts = int(datetime.strptime(DATE_FROM, "%Y-%m-%d").replace(tzinfo=timezone.utc).timestamp())
            end_ts = int(datetime.strptime(DATE_TO, "%Y-%m-%d").replace(tzinfo=timezone.utc).timestamp())
            url = f"{FINNHUB_CANDLE}?symbol={ticker_0}&resolution=D&from={start_ts}&to={end_ts}&token={FINNHUB_KEY}"
            resp = httpx.get(url, timeout=15.0)
            raw_tests["finnhub"] = f"http_status={resp.status_code}, body={resp.text[:300]}"
        except Exception as e:
            raw_tests["finnhub"] = f"ERROR: {type(e).__name__}: {str(e)[:200]}"

    if FMP_KEY:
        try:
            url = f"https://financialmodelingprep.com/stable/historical-price-eod/full?symbol={ticker_0}&apikey={FMP_KEY}"
            resp = httpx.get(url, timeout=15.0)
            raw_tests["fmp"] = f"http_status={resp.status_code}, body={resp.text[:300]}"
        except Exception as e:
            raw_tests["fmp_stable"] = f"ERROR: {type(e).__name__}: {str(e)[:200]}"

    if MASSIVE_KEY:
        try:
            url = (f"{MASSIVE_BASE}/v2/aggs/ticker/{ticker_0}/range/1/day"
                   f"/{DATE_FROM}/{DATE_TO}?apiKey={MASSIVE_KEY}")
            resp = httpx.get(url, timeout=15.0)
            raw_tests["massive"] = f"http_status={resp.status_code}, body={resp.text[:300]}"
        except Exception as e:
            raw_tests["massive"] = f"ERROR: {type(e).__name__}: {str(e)[:200]}"

    if AV_KEY:
        try:
            url = f"{AV_URL}?function=TIME_SERIES_DAILY&symbol={ticker_0}&outputsize=compact&apikey={AV_KEY}"
            data = _get_json(url)
            ts = (data or {}).get("Time Series (Daily)", {})
            raw_tests["alpha_vantage"] = f"got {len(ts)} daily rows, keys={list((data or {}).keys())}, sample={str(data)[:300]}"
        except Exception as e:
            raw_tests["alpha_vantage"] = f"ERROR: {type(e).__name__}: {str(e)[:200]}"

    report["raw_api_tests"] = raw_tests

    for ticker in tickers:
        per_source: dict = {}
        for name, fn in sources:
            try:
                df = fn(ticker)
                if df is None:
                    per_source[name] = "no data (None)"
                elif df.empty:
                    per_source[name] = "empty dataframe"
                else:
                    first = str(df.index[0].date())
                    last  = str(df.index[-1].date())
                    per_source[name] = f"OK — {len(df)} rows ({first} → {last})"
            except Exception as e:
                per_source[name] = f"ERROR: {type(e).__name__}: {str(e)[:120]}"
        report["tickers"][ticker] = per_source

    return report


def _fetch_crypto_ohlcv_coingecko(cg_id: str) -> pd.DataFrame | None:
    start_ts = int(datetime.strptime(DATE_FROM, "%Y-%m-%d").timestamp())
    end_ts   = int(datetime.strptime(DATE_TO,   "%Y-%m-%d").timestamp())
    url = (
        f"{CG_BASE}/coins/{cg_id}/market_chart/range"
        f"?vs_currency=usd&from={start_ts}&to={end_ts}"
    )
    headers: dict = {}
    if CG_KEY:
        headers["x-cg-demo-api-key"] = CG_KEY

    data = _get_json(url, headers)
    if not data:
        return None

    prices  = data.get("prices", [])
    volumes = data.get("total_volumes", [])
    if not prices:
        return None

    volume_map = {int(ts): v for ts, v in volumes}
    rows = []
    for ts, price in prices:
        vol = volume_map.get(int(ts), 0.0)
        rows.append({
            "timestamp": pd.Timestamp(ts, unit="ms", tz="UTC").tz_localize(None),
            "open": price, "high": price, "low": price, "close": price,
            "volume": vol,
        })

    df = pd.DataFrame(rows).sort_values("timestamp").set_index("timestamp")
    df = df[(df.index >= pd.Timestamp(DATE_FROM)) & (df.index <= pd.Timestamp(DATE_TO))]
    time.sleep(1.2)
    return df[["open", "high", "low", "close", "volume"]].astype(float)


def _cg_ohlc_days_param() -> str:
    """Pick the smallest CoinGecko /ohlc lookback bucket that reaches DATE_FROM.
    Demo tier allows 1/7/14/30/90/180/365/max. We count back from the real
    current date (the API ignores from/to on this endpoint)."""
    needed = (datetime.utcnow().date()
              - datetime.strptime(DATE_FROM, "%Y-%m-%d").date()).days + 10
    for bucket in (90, 180, 365):
        if needed <= bucket:
            return str(bucket)
    return "max"


def _fetch_crypto_ohlc_candles(cg_id: str) -> pd.DataFrame | None:
    """Real OHLC candles from CoinGecko's /ohlc endpoint (free Demo tier).

    Unlike market_chart/range (which gives daily CLOSES only — open=high=low=close),
    this returns genuine high/low ranges. Caveats on the free tier:
      • 31+ day lookbacks are aggregated to 4-DAY candles (no daily granularity).
      • NO volume is returned.
    So we use this ONLY as a real high/low overlay for catastrophic-stop checks in
    crypto evaluation. Daily closes, volume, and indicators still come from
    market_chart/range via _fetch_crypto_ohlcv()."""
    days = _cg_ohlc_days_param()
    url = f"{CG_BASE}/coins/{cg_id}/ohlc?vs_currency=usd&days={days}"
    headers: dict = {}
    if CG_KEY:
        headers["x-cg-demo-api-key"] = CG_KEY

    data = _get_json(url, headers)
    if not data or not isinstance(data, list):
        return None

    rows = []
    for c in data:
        if not isinstance(c, (list, tuple)) or len(c) < 5:
            continue
        rows.append({
            "timestamp": pd.Timestamp(c[0], unit="ms", tz="UTC").tz_localize(None),
            "open": c[1], "high": c[2], "low": c[3], "close": c[4],
        })
    if not rows:
        return None

    df = pd.DataFrame(rows).sort_values("timestamp").set_index("timestamp")
    df = df[(df.index >= pd.Timestamp(DATE_FROM)) & (df.index <= pd.Timestamp(DATE_TO))]
    time.sleep(1.2)
    if df.empty:
        return None
    return df[["open", "high", "low", "close"]].astype(float)


# ─── Indicator computation ───────────────────────────────────────────────────

def _compute_indicators(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = [c.lower() for c in df.columns]

    df.ta.rsi(length=14, append=True)
    df.ta.macd(fast=12, slow=26, signal=9, append=True)
    df.ta.bbands(length=20, std=2, append=True)

    df["volume_sma_20"]  = df["volume"].rolling(20).mean()
    df["sma_50"]         = df["close"].rolling(50).mean()
    df["price_vs_sma50"] = (df["close"] - df["sma_50"]) / df["sma_50"] * 100
    df["change_1d"]      = df["close"].pct_change() * 100
    df["volume_ratio"]   = df["volume"] / df["volume_sma_20"]

    def _find(prefix: str) -> str | None:
        m = [c for c in df.columns if c.lower().startswith(prefix.lower())]
        return m[0] if m else None

    def _safe_col(prefix: str):
        col = _find(prefix)
        if col is not None:
            return df[col]
        return pd.Series(np.nan, index=df.index)

    df["_rsi"]       = _safe_col("rsi_14")
    df["_macd_line"] = _safe_col("macd_12")
    df["_macd_sig"]  = _safe_col("macds_")
    df["_macd_hist"] = _safe_col("macdh_")
    df["_bb_upper"]  = _safe_col("bbu_")
    df["_bb_middle"] = _safe_col("bbm_")
    df["_bb_lower"]  = _safe_col("bbl_")

    return df


# ─── Build context for Claude (mirrors live engine) ─────────────────────────

def _build_stock_context(ticker: str, row: pd.Series, df: pd.DataFrame,
                         benchmarks: dict | None = None) -> dict:
    loc = df.index.get_loc(row.name)
    idx = loc if isinstance(loc, int) else (loc.start if isinstance(loc, slice) else int(np.argmax(loc)))
    prev_macd_hist = None
    if idx >= 1:
        prev_row = df.iloc[idx - 1]
        if pd.notna(prev_row.get("_macd_hist")):
            prev_macd_hist = round(float(prev_row["_macd_hist"]), 4)

    week_return = None
    if idx >= 5:
        week_ago_close = float(df.iloc[idx - 5]["close"])
        week_return = round((float(row["close"]) - week_ago_close) / week_ago_close * 100, 2)

    return {
        "identifier":     ticker,
        "current_price":  float(row["close"]),
        "change_24h":     round(float(row["change_1d"]), 2) if pd.notna(row.get("change_1d")) else None,
        "technical_indicators": {
            "rsi_14":            round(float(row["_rsi"]), 2)       if pd.notna(row.get("_rsi")) else None,
            "macd_line":         round(float(row["_macd_line"]), 4) if pd.notna(row.get("_macd_line")) else None,
            "macd_signal":       round(float(row["_macd_sig"]), 4)  if pd.notna(row.get("_macd_sig")) else None,
            "macd_hist":         round(float(row["_macd_hist"]), 4) if pd.notna(row.get("_macd_hist")) else None,
            "prev_macd_hist":    prev_macd_hist,
            "bb_upper":          round(float(row["_bb_upper"]), 2)  if pd.notna(row.get("_bb_upper")) else None,
            "bb_middle":         round(float(row["_bb_middle"]), 2) if pd.notna(row.get("_bb_middle")) else None,
            "bb_lower":          round(float(row["_bb_lower"]), 2)  if pd.notna(row.get("_bb_lower")) else None,
            "price_vs_sma50_pct": round(float(row["price_vs_sma50"]), 2) if pd.notna(row.get("price_vs_sma50")) else None,
            "volume_ratio":      round(float(row["volume_ratio"]), 2)    if pd.notna(row.get("volume_ratio")) else None,
            "week_return_pct":   week_return,
        },
        "market_benchmarks": benchmarks or {},
        "news_headlines": [],
    }


def _fetch_fear_greed_history() -> dict[str, dict]:
    """Fetch historical Fear & Greed index from Alternative.me. Free, no key needed.
    Returns {date_str: {"value": int, "value_classification": str}}."""
    url = "https://api.alternative.me/fng/?limit=200&format=json"
    data = _get_json(url)
    if not data or "data" not in data:
        logger.warning("[claude_backtest] Fear & Greed history fetch failed — will use neutral fallback")
        return {}
    history: dict[str, dict] = {}
    for entry in data["data"]:
        ts = int(entry.get("timestamp", 0))
        if ts == 0:
            continue
        date_str = datetime.utcfromtimestamp(ts).strftime("%Y-%m-%d")
        history[date_str] = {
            "value": int(entry.get("value", 50)),
            "value_classification": entry.get("value_classification", "Neutral"),
        }
    return history


def _lookup_fear_greed(history: dict[str, dict], date_str: str) -> dict:
    """Find the Fear & Greed value for a date, or nearest prior date."""
    if date_str in history:
        return history[date_str]
    target = pd.Timestamp(date_str)
    best_date, best_val = None, None
    for d in sorted(history.keys(), reverse=True):
        if pd.Timestamp(d) <= target:
            best_date = d
            best_val = history[d]
            break
    return best_val or {"value": 50, "value_classification": "Neutral"}


def _build_crypto_context(symbol: str, row: pd.Series, fear_greed: dict | None = None) -> dict:
    return {
        "identifier":     symbol,
        "current_price":  float(row["close"]),
        "change_24h":     round(float(row["change_1d"]), 2) if pd.notna(row.get("change_1d")) else None,
        "technical_indicators": {
            "rsi_14":       round(float(row["_rsi"]), 2)       if pd.notna(row.get("_rsi")) else None,
            "macd_line":    round(float(row["_macd_line"]), 4) if pd.notna(row.get("_macd_line")) else None,
            "macd_signal":  round(float(row["_macd_sig"]), 4)  if pd.notna(row.get("_macd_sig")) else None,
            "macd_hist":    round(float(row["_macd_hist"]), 4) if pd.notna(row.get("_macd_hist")) else None,
            "volume_ratio": round(float(row["volume_ratio"]), 2) if pd.notna(row.get("volume_ratio")) else None,
            "volume_24h":   None,
        },
        "fear_greed":    fear_greed or {"value": 50, "value_classification": "Neutral"},
        "market_cap":    None,
        "news_headlines": [],
    }


# ─── Regime filters ────────────────────────────────────────────────────────

def _spy_regime_bearish(benchmark_data: dict, date_str: str) -> bool:
    """Return True if SPY is below its SMA-50 on this date — bearish regime."""
    spy_df = benchmark_data.get("SPY")
    if spy_df is None:
        return False
    target = pd.Timestamp(date_str)
    idx = spy_df.index.get_indexer([target], method="ffill")[0]
    if idx < 0:
        return False
    row = spy_df.iloc[idx]
    sma50 = row.get("sma_50")
    if pd.isna(sma50) or sma50 is None:
        return False
    return float(row["close"]) < float(sma50)


def _btc_regime_bearish(crypto_data: dict, date_str: str) -> bool:
    """Return True if BTC MACD histogram is negative and deepening — bearish regime.
    Used to gate alt-crypto longs."""
    btc_df = crypto_data.get("BTC")
    if btc_df is None:
        return False
    target = pd.Timestamp(date_str)
    idx = btc_df.index.get_indexer([target], method="ffill")[0]
    if idx < 1:
        return False
    row = btc_df.iloc[idx]
    prev = btc_df.iloc[idx - 1]
    hist = row.get("_macd_hist")
    prev_hist = prev.get("_macd_hist")
    if pd.isna(hist) or pd.isna(prev_hist):
        return False
    return float(hist) < 0 and float(hist) < float(prev_hist)


# ─── Core: call Claude on a historical data point ───────────────────────────

_recent_errors: list[str] = []

def _score_with_claude(
    asset_type: str,
    identifier: str,
    context: dict,
    claude_client,
) -> StockSignal | CryptoSignal | None:
    try:
        if asset_type == "stock":
            return claude_client.chat.completions.create(
                model=MODEL,
                max_tokens=MAX_TOKENS,
                system=stocks_prompt.SYSTEM_PROMPT,
                messages=[{"role": "user", "content": stocks_prompt.build_user_prompt(context)}],
                response_model=StockSignal,
            )
        elif asset_type == "crypto":
            return claude_client.chat.completions.create(
                model=MODEL,
                max_tokens=MAX_TOKENS,
                system=crypto_prompt.SYSTEM_PROMPT,
                messages=[{"role": "user", "content": crypto_prompt.build_user_prompt(context)}],
                response_model=CryptoSignal,
            )
    except Exception as e:
        import traceback
        err_detail = f"{asset_type}/{identifier}: {type(e).__name__}: {str(e)[:300]}"
        logger.error("Claude scoring failed — {}", err_detail)
        if len(_recent_errors) < 10:
            _recent_errors.append(err_detail)
        return None


# ─── Evaluate outcome against actual future prices ──────────────────────────

CATASTROPHIC_STOP = {
    ("stock", "intraday"):  0.06,
    ("stock", "swing"):     0.10,
    ("stock", "longterm"):  0.15,
    # Crypto is far more volatile and we only have 4-day candle H/L (see
    # _fetch_crypto_ohlc_candles), so these are deliberately WIDE — they cut
    # only genuine disasters, not normal crypto chop, to avoid stopping winners.
    ("crypto", "intraday"): 0.12,
    ("crypto", "swing"):    0.22,
    ("crypto", "longterm"): 0.32,
}

# Stocks: real OHLC from FMP/Massive — supports intraday high/low stop checks.
STOCK_WINDOWS = {"intraday": 2, "swing": 8, "longterm": 20}

# Crypto: daily closes + volume come from market_chart/range (close-only). Real
# high/low ranges come separately from the /ohlc endpoint (4-day candles on the
# free tier) and are used ONLY for catastrophic-stop checks. Crypto trades 24/7
# and moves fast, so windows are shorter and the win/loss dead zone is wider
# (1.5% vs 0.5%) to ignore noise.
CRYPTO_WINDOWS = {"intraday": 1, "swing": 6, "longterm": 14}
CRYPTO_DEAD_ZONE = 0.015

# ─── Win-rate levers ───────────────────────────────────────────────────────
CONVICTION_FLOOR = 68  # Ignore signals below this confidence

# Extended windows for high-conviction longterm calls ("let winners run")
EXTENDED_STOCK_LONGTERM = 30   # was 20
EXTENDED_CRYPTO_LONGTERM = 21  # was 14

# Portfolio-level circuit breaker: exit all positions if cumulative
# drawdown from peak exceeds this threshold.
PORTFOLIO_CIRCUIT_BREAKER_PCT = 15.0


def _evaluate_claude_signal(
    signal: ClaudeSignalResult,
    df: pd.DataFrame,
    sample_idx: int,
    hl_df: pd.DataFrame | None = None,
) -> ClaudeSignalResult:
    """Dispatch to asset-specific evaluation — stocks and crypto have
    fundamentally different data quality and market behavior. `hl_df` carries
    real high/low candles for crypto (from the /ohlc endpoint)."""
    if signal.direction == "HOLD":
        signal.outcome = "HOLD"
        return signal
    if signal.asset_class == "crypto":
        return _evaluate_crypto_signal(signal, df, sample_idx, hl_df=hl_df)
    return _evaluate_stock_signal(signal, df, sample_idx)


def _evaluate_stock_signal(
    signal: ClaudeSignalResult,
    df: pd.DataFrame,
    sample_idx: int,
) -> ClaudeSignalResult:
    """
    Stock eval: real OHLC data. Check price at end of window, exit early only
    on a catastrophic intraday move (real high/low data supports this).
    High-conviction longterm calls get extended windows to let winners run.
    """
    max_days = STOCK_WINDOWS.get(signal.time_horizon, 8)
    if signal.time_horizon == "longterm" and signal.confidence >= 75:
        max_days = EXTENDED_STOCK_LONGTERM
    end_idx = min(sample_idx + max_days, len(df) - 1)

    if end_idx <= sample_idx:
        signal.outcome = "PENDING"
        return signal

    entry = signal.entry_price
    cat_stop = CATASTROPHIC_STOP.get((signal.asset_class, signal.time_horizon), 0.10)

    max_favorable = 0.0
    max_adverse = 0.0
    stopped_out = False

    for i in range(sample_idx + 1, end_idx + 1):
        high = float(df.iloc[i]["high"])
        low = float(df.iloc[i]["low"])

        if signal.direction == "BUY":
            max_favorable = max(max_favorable, (high - entry) / entry)
            max_adverse = max(max_adverse, (entry - low) / entry)
            if (entry - low) / entry >= cat_stop:
                signal.exit_price = round(entry * (1 - cat_stop), 4)
                signal.return_pct = round(-cat_stop * 100, 2)
                signal.outcome = "LOSS"
                signal.exit_reason = f"catastrophic_stop at -{cat_stop*100:.0f}%"
                stopped_out = True
                break
        else:
            max_favorable = max(max_favorable, (entry - low) / entry)
            max_adverse = max(max_adverse, (high - entry) / entry)
            if (high - entry) / entry >= cat_stop:
                signal.exit_price = round(entry * (1 + cat_stop), 4)
                signal.return_pct = round(-cat_stop * 100, 2)
                signal.outcome = "LOSS"
                signal.exit_reason = f"catastrophic_stop at -{cat_stop*100:.0f}%"
                stopped_out = True
                break

    if not stopped_out:
        exit_close = float(df.iloc[end_idx]["close"])
        signal.exit_price = exit_close
        if signal.direction == "BUY":
            pnl = (exit_close - entry) / entry
        else:
            pnl = (entry - exit_close) / entry
        signal.return_pct = round(pnl * 100, 2)
        signal.exit_reason = f"window_{max_days}d"

        if pnl > 0.005:
            signal.outcome = "WIN"
        elif pnl < -0.005:
            signal.outcome = "LOSS"
        else:
            signal.outcome = "NEUTRAL"

    signal.max_favorable = round(max_favorable * 100, 2)
    signal.max_adverse = round(max_adverse * 100, 2)
    return signal


def _evaluate_crypto_signal(
    signal: ClaudeSignalResult,
    df: pd.DataFrame,
    sample_idx: int,
    hl_df: pd.DataFrame | None = None,
) -> ClaudeSignalResult:
    """
    Crypto eval. Daily closes (entry, window-end grade) come from `df`
    (market_chart/range). If real high/low candles are available via `hl_df`
    (the /ohlc endpoint), we additionally check for a catastrophic intraday
    breach and cut the loss early — same asymmetry protection stocks get.
    Stops are wide (see CATASTROPHIC_STOP) and candles are 4-day on the free
    tier, so only genuine disasters trip them. Falls back to pure close-to-close
    grading when no real candles exist. Shorter windows, wider dead zone.
    """
    max_days = CRYPTO_WINDOWS.get(signal.time_horizon, 6)
    if signal.time_horizon == "longterm" and signal.confidence >= 75:
        max_days = EXTENDED_CRYPTO_LONGTERM
    end_idx = min(sample_idx + max_days, len(df) - 1)

    if end_idx <= sample_idx:
        signal.outcome = "PENDING"
        return signal

    entry = signal.entry_price
    entry_date = df.index[sample_idx]
    end_date = df.index[end_idx]

    max_favorable = 0.0
    max_adverse = 0.0
    stopped_out = False

    # ── Real high/low overlay: catastrophic stop check (if /ohlc data exists) ──
    cat_stop = CATASTROPHIC_STOP.get((signal.asset_class, signal.time_horizon))
    if hl_df is not None and not hl_df.empty and cat_stop is not None:
        window = hl_df[(hl_df.index >= entry_date) & (hl_df.index <= end_date)]
        for _, candle in window.iterrows():
            high = float(candle["high"])
            low = float(candle["low"])
            if signal.direction == "BUY":
                max_favorable = max(max_favorable, (high - entry) / entry)
                max_adverse = max(max_adverse, (entry - low) / entry)
                if (entry - low) / entry >= cat_stop:
                    signal.exit_price = round(entry * (1 - cat_stop), 6)
                    signal.return_pct = round(-cat_stop * 100, 2)
                    signal.outcome = "LOSS"
                    signal.exit_reason = f"catastrophic_stop at -{cat_stop*100:.0f}%"
                    stopped_out = True
                    break
            else:
                max_favorable = max(max_favorable, (entry - low) / entry)
                max_adverse = max(max_adverse, (high - entry) / entry)
                if (high - entry) / entry >= cat_stop:
                    signal.exit_price = round(entry * (1 + cat_stop), 6)
                    signal.return_pct = round(-cat_stop * 100, 2)
                    signal.outcome = "LOSS"
                    signal.exit_reason = f"catastrophic_stop at -{cat_stop*100:.0f}%"
                    stopped_out = True
                    break

    if not stopped_out:
        # Close-to-close excursion (real-candle fallback / analytics).
        for i in range(sample_idx + 1, end_idx + 1):
            close_i = float(df.iloc[i]["close"])
            if signal.direction == "BUY":
                max_favorable = max(max_favorable, (close_i - entry) / entry)
                max_adverse = max(max_adverse, (entry - close_i) / entry)
            else:
                max_favorable = max(max_favorable, (entry - close_i) / entry)
                max_adverse = max(max_adverse, (close_i - entry) / entry)

        exit_close = float(df.iloc[end_idx]["close"])
        signal.exit_price = exit_close
        if signal.direction == "BUY":
            pnl = (exit_close - entry) / entry
        else:
            pnl = (entry - exit_close) / entry
        signal.return_pct = round(pnl * 100, 2)
        suffix = "_realhl" if (hl_df is not None and not hl_df.empty) else ""
        signal.exit_reason = f"window_{max_days}d_close{suffix}"

        if pnl > CRYPTO_DEAD_ZONE:
            signal.outcome = "WIN"
        elif pnl < -CRYPTO_DEAD_ZONE:
            signal.outcome = "LOSS"
        else:
            signal.outcome = "NEUTRAL"

    signal.max_favorable = round(max_favorable * 100, 2)
    signal.max_adverse = round(max_adverse * 100, 2)
    return signal


# ─── Main runner ─────────────────────────────────────────────────────────────

def run_claude_backtest(
    stocks: list[str] | None = None,
    crypto: list[tuple[str, str]] | None = None,
    sample_dates: list[str] | None = None,
    output_dir: str | None = None,
) -> dict:
    stocks       = SAMPLE_STOCKS if stocks is None else stocks
    crypto       = CRYPTO_ASSETS if crypto is None else crypto
    sample_dates = SAMPLE_DATES if sample_dates is None else sample_dates
    output_dir   = output_dir or "/tmp/claude_backtest"
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        return {"error": "ANTHROPIC_API_KEY not set"}

    _anthropic = anthropic.Anthropic(api_key=api_key)
    claude_client = instructor.from_anthropic(_anthropic)

    _recent_errors.clear()

    results: list[ClaudeSignalResult] = []
    api_calls = 0
    errors = 0

    logger.info(
        "[claude_backtest] Starting — {} stocks, {} crypto, {} sample dates, DATE_FROM={}",
        len(stocks), len(crypto), len(sample_dates), DATE_FROM,
    )

    # ── Stocks ───────────────────────────────────────────────────────────────
    stock_data: dict[str, pd.DataFrame] = {}
    for ticker in stocks:
        logger.info("[claude_backtest] Fetching stock data: {}", ticker)
        df = _fetch_stock_ohlcv(ticker)
        if df is not None and not df.empty:
            stock_data[ticker] = _compute_indicators(df)
            logger.info("[claude_backtest] {} → {} rows ({} to {})", ticker, len(df), df.index[0].date(), df.index[-1].date())
        else:
            logger.warning("[claude_backtest] {} → no data returned from any source", ticker)
        time.sleep(0.3)

    benchmark_data: dict[str, pd.DataFrame] = {}
    for bm_ticker in ("SPY", "QQQ"):
        if bm_ticker not in stock_data:
            logger.info("[claude_backtest] Fetching benchmark: {}", bm_ticker)
            df = _fetch_stock_ohlcv(bm_ticker)
            if df is not None and not df.empty:
                benchmark_data[bm_ticker] = _compute_indicators(df)
            time.sleep(0.3)
        else:
            benchmark_data[bm_ticker] = stock_data[bm_ticker]

    def _get_benchmarks_for_date(date_str: str) -> dict:
        bm: dict = {}
        for sym, bdf in benchmark_data.items():
            target = pd.Timestamp(date_str)
            bidx = bdf.index.get_indexer([target], method="ffill")[0]
            if bidx >= 0:
                brow = bdf.iloc[bidx]
                entry = {
                    "price": round(float(brow["close"]), 2),
                    "change_24h": round(float(brow["change_1d"]), 2) if pd.notna(brow.get("change_1d")) else None,
                }
                if pd.notna(brow.get("price_vs_sma50")):
                    entry["vs_sma50_pct"] = round(float(brow["price_vs_sma50"]), 2)
                bm[sym] = entry
        return bm

    regime_filtered = 0
    conviction_filtered = 0

    for ticker, df in stock_data.items():
        for date_str in sample_dates:
            try:
                target = pd.Timestamp(date_str)
                idx = df.index.get_indexer([target], method="ffill")[0]
                if idx < 0 or idx < 50:
                    logger.debug("[claude_backtest] Skipping {}/{}: idx={} (need >= 50 for indicators)", ticker, date_str, idx)
                    continue

                row = df.iloc[idx]
                actual_date = str(df.index[idx].date())
                benchmarks = _get_benchmarks_for_date(actual_date)
                context = _build_stock_context(ticker, row, df, benchmarks=benchmarks)

                logger.info("[claude_backtest] Scoring {}/{} on {}", "stock", ticker, actual_date)
                signal = _score_with_claude("stock", ticker, context, claude_client)
                api_calls += 1

                if signal is None:
                    errors += 1
                    continue

                # ── Conviction floor: skip low-confidence signals ──
                if signal.direction != "HOLD" and signal.confidence < CONVICTION_FLOOR:
                    conviction_filtered += 1
                    logger.info("[claude_backtest] {} {} filtered: confidence {} < floor {}",
                                ticker, actual_date, signal.confidence, CONVICTION_FLOOR)
                    continue

                # ── SPY regime gate: suppress BUY in bearish regime ──
                if signal.direction == "BUY" and _spy_regime_bearish(benchmark_data, actual_date):
                    regime_filtered += 1
                    logger.info("[claude_backtest] {} {} BUY suppressed: SPY below SMA-50 (bearish regime)",
                                ticker, actual_date)
                    signal.direction = "HOLD"

                sl_tp = {"intraday": (3.0, 6.0), "swing": (7.0, 16.0), "longterm": (10.0, 25.0)}
                sl_pct, tp_pct = sl_tp.get(signal.time_horizon, (7.0, 16.0))
                if signal.confidence >= 75:
                    tp_pct *= 1.5
                    sl_pct *= 1.2

                weight = 1.0
                if signal.confidence >= 75:
                    weight = 2.0
                elif signal.confidence >= 68:
                    weight = 1.5

                result = ClaudeSignalResult(
                    ticker=ticker,
                    asset_class="stock",
                    sample_date=actual_date,
                    direction=signal.direction,
                    confidence=signal.confidence,
                    time_horizon=signal.time_horizon,
                    reasoning=signal.reasoning,
                    entry_price=float(row["close"]),
                    stop_loss_pct=sl_pct,
                    take_profit_pct=tp_pct,
                    position_weight=weight,
                    rsi=round(float(row["_rsi"]), 2)       if pd.notna(row.get("_rsi")) else None,
                    macd_hist=round(float(row["_macd_hist"]), 4) if pd.notna(row.get("_macd_hist")) else None,
                    volume_ratio=round(float(row["volume_ratio"]), 2) if pd.notna(row.get("volume_ratio")) else None,
                    change_24h=round(float(row["change_1d"]), 2) if pd.notna(row.get("change_1d")) else None,
                )
                result = _evaluate_claude_signal(result, df, idx)
                results.append(result)

                time.sleep(0.5)
            except Exception as e:
                err = f"stock/{ticker}/{date_str}: {type(e).__name__}: {str(e)[:200]}"
                logger.error("[claude_backtest] {}", err)
                if len(_recent_errors) < 10:
                    _recent_errors.append(err)
                errors += 1

    # ── Crypto ───────────────────────────────────────────────────────────────
    crypto_data: dict[str, pd.DataFrame] = {}
    crypto_hl: dict[str, pd.DataFrame] = {}
    for symbol, cg_id in crypto:
        logger.info("[claude_backtest] Fetching crypto data: {}", symbol)
        df = _crypto_alpaca(symbol)
        used_alpaca = df is not None and len(df) >= MIN_ROWS_FOR_SOLE_SOURCE
        if not used_alpaca:
            logger.warning(
                "[claude_backtest] {} — Alpaca insufficient ({} rows), falling back to CoinGecko",
                symbol, len(df) if df is not None else 0,
            )
            df = _fetch_crypto_ohlcv_coingecko(cg_id)

        if df is not None and not df.empty:
            crypto_data[symbol] = _compute_indicators(df)
            if used_alpaca:
                # Alpaca bars are genuine daily OHLC — use directly as the hl
                # overlay instead of CoinGecko's coarser 4-day /ohlc candles.
                crypto_hl[symbol] = df[["open", "high", "low", "close"]]
                logger.info("[claude_backtest] {} — Alpaca real OHLC ({} rows) used as hl overlay", symbol, len(df))
            else:
                hl = _fetch_crypto_ohlc_candles(cg_id)
                if hl is not None and not hl.empty:
                    crypto_hl[symbol] = hl
                    logger.info("[claude_backtest] {} — real OHLC candles: {} rows ({} to {})",
                                symbol, len(hl), hl.index[0].date(), hl.index[-1].date())
                else:
                    logger.info("[claude_backtest] {} — no real OHLC candles (using close-only fallback)", symbol)

    fg_history = _fetch_fear_greed_history() if crypto_data else {}

    btc_gated = 0

    for symbol, df in crypto_data.items():
        for date_str in sample_dates:
            try:
                target = pd.Timestamp(date_str)
                idx = df.index.get_indexer([target], method="ffill")[0]
                if idx < 0 or idx < 50:
                    continue

                row = df.iloc[idx]
                actual_date = str(df.index[idx].date())
                fg = _lookup_fear_greed(fg_history, actual_date)
                context = _build_crypto_context(symbol, row, fear_greed=fg)

                logger.info("[claude_backtest] Scoring {}/{} on {}", "crypto", symbol, actual_date)
                signal = _score_with_claude("crypto", symbol, context, claude_client)
                api_calls += 1

                if signal is None:
                    errors += 1
                    continue

                # ── Conviction floor ──
                if signal.direction != "HOLD" and signal.confidence < CONVICTION_FLOOR:
                    conviction_filtered += 1
                    logger.info("[claude_backtest] {} {} filtered: confidence {} < floor {}",
                                symbol, actual_date, signal.confidence, CONVICTION_FLOOR)
                    continue

                # ── BTC regime gate: suppress alt BUYs when BTC is breaking down ──
                if symbol != "BTC" and signal.direction == "BUY" and _btc_regime_bearish(crypto_data, actual_date):
                    btc_gated += 1
                    logger.info("[claude_backtest] {} {} BUY suppressed: BTC bearish regime",
                                symbol, actual_date)
                    signal.direction = "HOLD"

                weight = 1.0
                if signal.confidence >= 75:
                    weight = 2.0
                elif signal.confidence >= 68:
                    weight = 1.5

                result = ClaudeSignalResult(
                    ticker=symbol,
                    asset_class="crypto",
                    sample_date=actual_date,
                    direction=signal.direction,
                    confidence=signal.confidence,
                    time_horizon=signal.time_horizon,
                    reasoning=signal.reasoning,
                    entry_price=float(row["close"]),
                    stop_loss_pct=6.0,
                    take_profit_pct=12.0,
                    position_weight=weight,
                    rsi=round(float(row["_rsi"]), 2)       if pd.notna(row.get("_rsi")) else None,
                    macd_hist=round(float(row["_macd_hist"]), 4) if pd.notna(row.get("_macd_hist")) else None,
                    volume_ratio=round(float(row["volume_ratio"]), 2) if pd.notna(row.get("volume_ratio")) else None,
                    change_24h=round(float(row["change_1d"]), 2) if pd.notna(row.get("change_1d")) else None,
                )
                result = _evaluate_claude_signal(result, df, idx, hl_df=crypto_hl.get(symbol))
                results.append(result)

                time.sleep(0.5)
            except Exception as e:
                err = f"crypto/{symbol}/{date_str}: {type(e).__name__}: {str(e)[:200]}"
                logger.error("[claude_backtest] {}", err)
                if len(_recent_errors) < 10:
                    _recent_errors.append(err)
                errors += 1

    # ── Aggregate results ────────────────────────────────────────────────────
    agg = _aggregate_claude_results(results, api_calls, errors)
    agg["filters"] = {
        "conviction_floor": CONVICTION_FLOOR,
        "signals_below_floor": conviction_filtered,
        "spy_regime_suppressed": regime_filtered,
        "btc_regime_suppressed": btc_gated,
    }
    agg["crypto_real_candles"] = {
        "symbols_with_real_ohlc": sorted(crypto_hl.keys()),
        "count": len(crypto_hl),
    }
    if _recent_errors:
        agg["error_samples"] = list(_recent_errors)

    json_path = str(Path(output_dir) / "claude_backtest_results.json")
    with open(json_path, "w") as f:
        json.dump(agg, f, indent=2, default=str)
    agg["json_path"] = json_path

    logger.info("[claude_backtest] Complete — {} signals, {} API calls", len(results), api_calls)
    return agg


def _aggregate_claude_results(
    results: list[ClaudeSignalResult],
    api_calls: int,
    errors: int,
) -> dict:
    actionable = [r for r in results if r.direction != "HOLD"]
    evaluated  = [r for r in actionable if r.outcome in ("WIN", "LOSS", "NEUTRAL")]

    wins    = [r for r in evaluated if r.outcome == "WIN"]
    losses  = [r for r in evaluated if r.outcome == "LOSS"]
    neutral = [r for r in evaluated if r.outcome == "NEUTRAL"]
    holds   = [r for r in results   if r.direction == "HOLD"]

    decided = [r for r in evaluated if r.outcome in ("WIN", "LOSS")]
    win_rate = len(wins) / len(decided) * 100 if decided else 0

    returns = [r.return_pct for r in actionable if r.return_pct is not None]
    avg_return = float(np.mean(returns)) if returns else 0

    stock_decided = [r for r in decided if r.asset_class == "stock"]
    crypto_decided = [r for r in decided if r.asset_class == "crypto"]
    stock_wins = [r for r in stock_decided if r.outcome == "WIN"]
    crypto_wins = [r for r in crypto_decided if r.outcome == "WIN"]

    by_horizon = {}
    for h in ["intraday", "swing", "longterm"]:
        h_decided = [r for r in decided if r.time_horizon == h]
        h_wins = [r for r in h_decided if r.outcome == "WIN"]
        by_horizon[h] = {
            "signals":  len(h_decided),
            "win_rate": round(len(h_wins) / len(h_decided) * 100, 1) if h_decided else None,
        }

    avg_win = float(np.mean([r.return_pct for r in wins])) if wins else 0
    avg_loss = float(np.mean([abs(r.return_pct) for r in losses])) if losses else 0
    profit_factor = round(sum(r.return_pct for r in wins) / abs(sum(r.return_pct for r in losses)), 2) if losses else 999.0

    portfolio_sim = _simulate_portfolio(actionable)

    signal_details = []
    for r in results:
        signal_details.append({
            "ticker":          r.ticker,
            "asset_class":     r.asset_class,
            "date":            r.sample_date,
            "direction":       r.direction,
            "confidence":      r.confidence,
            "time_horizon":    r.time_horizon,
            "entry_price":     r.entry_price,
            "exit_price":      r.exit_price,
            "return_pct":      r.return_pct,
            "outcome":         r.outcome,
            "exit_reason":     r.exit_reason,
            "stop_loss_pct":   r.stop_loss_pct,
            "take_profit_pct": r.take_profit_pct,
            "max_favorable":   r.max_favorable,
            "max_adverse":     r.max_adverse,
            "position_weight": r.position_weight,
            "reasoning":       r.reasoning[:200],
            "rsi":             r.rsi,
            "macd_hist":       r.macd_hist,
        })

    return {
        "backtest_type":    "claude_sampled",
        "model":            MODEL,
        "date_range":       f"{DATE_FROM} → {DATE_TO}",
        "sample_dates":     SAMPLE_DATES,
        "api_calls":        api_calls,
        "errors":           errors,
        "total_signals":    len(results),
        "actionable":       len(actionable),
        "holds":            len(holds),
        "evaluated":        len(evaluated),
        "wins":             len(wins),
        "losses":           len(losses),
        "neutral":          len(neutral),
        "win_rate":         round(win_rate, 1),
        "avg_return_pct":   round(avg_return, 3),
        "avg_win_pct":      round(avg_win, 2),
        "avg_loss_pct":     round(avg_loss, 2),
        "profit_factor":    profit_factor,
        "hold_rate":        round(len(holds) / len(results) * 100, 1) if results else 0,
        "portfolio_sim":    portfolio_sim,
        "by_asset_class": {
            "stocks": {
                "decided":  len(stock_decided),
                "win_rate": round(len(stock_wins) / len(stock_decided) * 100, 1) if stock_decided else None,
            },
            "crypto": {
                "decided":  len(crypto_decided),
                "win_rate": round(len(crypto_wins) / len(crypto_decided) * 100, 1) if crypto_decided else None,
            },
        },
        "by_time_horizon": by_horizon,
        "signals": signal_details,
    }


def _simulate_portfolio(
    actionable: list[ClaudeSignalResult],
    starting_balance: float = 1000.0,
    base_position_pct: float = 0.15,
) -> dict:
    """Simulate a $1k portfolio using confidence-weighted position sizing.
    Includes a circuit breaker: if drawdown from peak exceeds the threshold,
    stop taking new positions (go to cash)."""
    balance = starting_balance
    peak_balance = starting_balance
    max_drawdown = 0.0
    circuit_breaker_hit = False
    trade_log: list[dict] = []

    by_date: dict[str, list[ClaudeSignalResult]] = {}
    for r in actionable:
        by_date.setdefault(r.sample_date, []).append(r)

    for date_str in sorted(by_date.keys()):
        trades = by_date[date_str]
        for t in trades:
            if t.return_pct is None:
                continue

            current_dd = (peak_balance - balance) / peak_balance * 100 if peak_balance > 0 else 0
            if current_dd >= PORTFOLIO_CIRCUIT_BREAKER_PCT:
                circuit_breaker_hit = True
                trade_log.append({
                    "date": date_str,
                    "ticker": t.ticker,
                    "direction": "SKIP",
                    "confidence": t.confidence,
                    "weight": 0,
                    "position_size": 0,
                    "return_pct": 0,
                    "pnl": 0,
                    "balance": round(balance, 2),
                    "exit_reason": f"circuit_breaker_{PORTFOLIO_CIRCUIT_BREAKER_PCT}%_dd",
                })
                continue

            position_size = balance * base_position_pct * t.position_weight
            pnl = position_size * (t.return_pct / 100.0)
            balance += pnl
            peak_balance = max(peak_balance, balance)
            dd = (peak_balance - balance) / peak_balance * 100
            max_drawdown = max(max_drawdown, dd)

            trade_log.append({
                "date": date_str,
                "ticker": t.ticker,
                "direction": t.direction,
                "confidence": t.confidence,
                "weight": t.position_weight,
                "position_size": round(position_size, 2),
                "return_pct": t.return_pct,
                "pnl": round(pnl, 2),
                "balance": round(balance, 2),
                "exit_reason": t.exit_reason,
            })

    total_return = (balance - starting_balance) / starting_balance * 100

    return {
        "starting_balance": starting_balance,
        "final_balance": round(balance, 2),
        "total_return_pct": round(total_return, 2),
        "max_drawdown_pct": round(max_drawdown, 2),
        "circuit_breaker_triggered": circuit_breaker_hit,
        "total_trades": len(trade_log),
        "trade_log": trade_log,
    }


# ─── CLI entrypoint ──────────────────────────────────────────────────────────
# Run locally:
#   python -m analysis.claude_backtest --diag           # free: data check only
#   python -m analysis.claude_backtest --stocks-only    # ~$0.50: stocks via Claude
#   python -m analysis.claude_backtest                  # full: stocks + crypto

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Plebs Claude backtest")
    parser.add_argument("--diag", action="store_true",
                        help="Free data-source check only — no Claude calls, no cost")
    parser.add_argument("--stocks-only", action="store_true",
                        help="Backtest stocks only (skip crypto)")
    parser.add_argument("--tickers", default="",
                        help="Comma-separated tickers to override the default sample")
    args = parser.parse_args()

    override = [t.strip().upper() for t in args.tickers.split(",") if t.strip()] or None

    if args.diag:
        out = diagnose_stock_sources(override)
    else:
        out = run_claude_backtest(
            stocks=override,
            crypto=[] if args.stocks_only else None,
        )

    print(json.dumps(out, indent=2, default=str))
