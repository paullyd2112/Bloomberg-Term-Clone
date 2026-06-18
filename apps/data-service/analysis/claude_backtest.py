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

load_dotenv()

MODEL      = "claude-sonnet-4-6"
MAX_TOKENS = 1024

FMP_KEY     = os.environ.get("FMP_API_KEY", "")
AV_KEY      = os.environ.get("ALPHA_VANTAGE_API_KEY", "")
CG_KEY      = os.environ.get("COINGECKO_API_KEY", "")
FINNHUB_KEY = os.environ.get("FINNHUB_API_KEY", "")
FMP_BASE    = "https://financialmodelingprep.com/api/v3"
CG_BASE     = "https://api.coingecko.com/api/v3"
FINNHUB_CANDLE = "https://finnhub.io/api/v1/stock/candle"
AV_URL         = "https://www.alphavantage.co/query"

DATE_FROM = "2026-02-01"
DATE_TO   = "2026-06-16"

SAMPLE_DATES = ["2026-05-05", "2026-05-14", "2026-05-27", "2026-06-04"]

SAMPLE_STOCKS = ["AAPL", "NVDA", "TSLA", "PLTR", "AMD",
                 "META", "GOOGL", "COIN", "SOFI", "HOOD"]

CRYPTO_ASSETS = [
    ("BTC", "bitcoin"),
    ("ETH", "ethereum"),
    ("SOL", "solana"),
    ("DOGE", "dogecoin"),
    ("PEPE", "pepe"),
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
    ticker:       str
    asset_class:  str
    sample_date:  str
    direction:    str
    confidence:   int
    time_horizon: str
    reasoning:    str
    entry_price:  float
    exit_price:   float | None = None
    return_pct:   float | None = None
    outcome:      str = "PENDING"
    rsi:          float | None = None
    macd_hist:    float | None = None
    volume_ratio: float | None = None
    change_24h:   float | None = None


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


def _stock_yfinance(ticker: str) -> pd.DataFrame | None:
    try:
        import yfinance as yf
        df = yf.download(ticker, period="6mo", interval="1d",
                         auto_adjust=True, progress=False)
        return _normalize_ohlcv(df)
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
    try:
        url = (f"{FMP_BASE}/historical-price-full/{ticker}"
               f"?from={DATE_FROM}&to={DATE_TO}&apikey={FMP_KEY}")
        data = _get_json(url)
        hist = (data or {}).get("historical", [])
        if not hist:
            return None
        df = pd.DataFrame(hist)
        df["date"] = pd.to_datetime(df["date"])
        df = df.set_index("date")
        return _normalize_ohlcv(df)
    except Exception as e:
        logger.debug("[claude_backtest] {} FMP failed — {}", ticker, e)
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


def _fetch_stock_ohlcv(ticker: str) -> pd.DataFrame | None:
    """Fetch from ALL 4 sources, merge for best date coverage."""
    sources = [
        ("yfinance",      _stock_yfinance),
        ("Finnhub",       _stock_finnhub),
        ("FMP",           _stock_fmp),
        ("Alpha Vantage", _stock_alphavantage),
    ]
    frames: list[pd.DataFrame] = []
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
        logger.warning("[claude_backtest] {} — ALL 4 sources returned no data", ticker)
        return None

    merged = frames[0]
    for extra in frames[1:]:
        new_dates = extra.index.difference(merged.index)
        if len(new_dates) > 0:
            merged = pd.concat([merged, extra.loc[new_dates]]).sort_index()
            logger.info("[claude_backtest] {} — filled {} gap dates from additional source", ticker, len(new_dates))

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
        ("yfinance",      _stock_yfinance),
        ("finnhub",       _stock_finnhub),
        ("fmp",           _stock_fmp),
        ("alpha_vantage", _stock_alphavantage),
    ]

    report: dict = {
        "date_range": f"{DATE_FROM} → {DATE_TO}",
        "keys_present": {
            "finnhub":       bool(FINNHUB_KEY),
            "fmp":           bool(FMP_KEY),
            "alpha_vantage": bool(AV_KEY),
        },
        "tickers": {},
    }

    ticker_0 = tickers[0]
    raw_tests: dict = {}

    try:
        import yfinance as yf
        df = yf.download(ticker_0, start=DATE_FROM, end=DATE_TO, interval="1d",
                         auto_adjust=True, progress=False)
        raw_tests["yfinance"] = f"returned {len(df)} rows, cols={list(df.columns)}" if not df.empty else "empty DataFrame"
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
            url = f"{FMP_BASE}/historical-price-full/{ticker_0}?from={DATE_FROM}&to={DATE_TO}&apikey={FMP_KEY}"
            resp = httpx.get(url, timeout=15.0)
            raw_tests["fmp"] = f"http_status={resp.status_code}, body={resp.text[:300]}"
        except Exception as e:
            raw_tests["fmp"] = f"ERROR: {type(e).__name__}: {str(e)[:200]}"

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


def _fetch_crypto_ohlcv(cg_id: str) -> pd.DataFrame | None:
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
    return {
        "identifier":     ticker,
        "current_price":  float(row["close"]),
        "change_24h":     round(float(row["change_1d"]), 2) if pd.notna(row.get("change_1d")) else None,
        "technical_indicators": {
            "rsi_14":            round(float(row["_rsi"]), 2)       if pd.notna(row.get("_rsi")) else None,
            "macd_line":         round(float(row["_macd_line"]), 4) if pd.notna(row.get("_macd_line")) else None,
            "macd_signal":       round(float(row["_macd_sig"]), 4)  if pd.notna(row.get("_macd_sig")) else None,
            "macd_hist":         round(float(row["_macd_hist"]), 4) if pd.notna(row.get("_macd_hist")) else None,
            "bb_upper":          round(float(row["_bb_upper"]), 2)  if pd.notna(row.get("_bb_upper")) else None,
            "bb_middle":         round(float(row["_bb_middle"]), 2) if pd.notna(row.get("_bb_middle")) else None,
            "bb_lower":          round(float(row["_bb_lower"]), 2)  if pd.notna(row.get("_bb_lower")) else None,
            "price_vs_sma50_pct": round(float(row["price_vs_sma50"]), 2) if pd.notna(row.get("price_vs_sma50")) else None,
            "volume_ratio":      round(float(row["volume_ratio"]), 2)    if pd.notna(row.get("volume_ratio")) else None,
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


# ─── Core: call Claude on a historical data point ───────────────────────────

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
        logger.error("Claude scoring failed for {}/{}: {}", asset_type, identifier, e)
        return None


# ─── Evaluate outcome against actual future prices ──────────────────────────

def _evaluate_claude_signal(
    signal: ClaudeSignalResult,
    df: pd.DataFrame,
    sample_idx: int,
) -> ClaudeSignalResult:
    if signal.direction == "HOLD":
        signal.outcome = "HOLD"
        return signal

    eval_days = EVAL_WINDOWS.get(signal.time_horizon, 5)
    exit_idx = min(sample_idx + eval_days, len(df) - 1)

    if exit_idx <= sample_idx:
        signal.outcome = "PENDING"
        return signal

    exit_price = float(df.iloc[exit_idx]["close"])
    signal.exit_price = exit_price

    pct_change = (exit_price - signal.entry_price) / signal.entry_price
    signal.return_pct = round(pct_change * 100, 4)

    key = (signal.asset_class, signal.time_horizon)
    win_thresh  = WIN_THRESHOLDS.get(key, 0.02)
    loss_thresh = LOSS_THRESHOLDS.get(key, 0.05)

    if signal.direction == "BUY":
        if pct_change >= win_thresh:
            signal.outcome = "WIN"
        elif pct_change <= -loss_thresh:
            signal.outcome = "LOSS"
        else:
            signal.outcome = "NEUTRAL"
    elif signal.direction == "SELL":
        if pct_change <= -win_thresh:
            signal.outcome = "WIN"
        elif pct_change >= loss_thresh:
            signal.outcome = "LOSS"
        else:
            signal.outcome = "NEUTRAL"

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
                bm[sym] = {
                    "price": round(float(brow["close"]), 2),
                    "change_24h": round(float(brow["change_1d"]), 2) if pd.notna(brow.get("change_1d")) else None,
                }
        return bm

    for ticker, df in stock_data.items():
        for date_str in sample_dates:
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

            result = ClaudeSignalResult(
                ticker=ticker,
                asset_class="stock",
                sample_date=actual_date,
                direction=signal.direction,
                confidence=signal.confidence,
                time_horizon=signal.time_horizon,
                reasoning=signal.reasoning,
                entry_price=float(row["close"]),
                rsi=round(float(row["_rsi"]), 2)       if pd.notna(row.get("_rsi")) else None,
                macd_hist=round(float(row["_macd_hist"]), 4) if pd.notna(row.get("_macd_hist")) else None,
                volume_ratio=round(float(row["volume_ratio"]), 2) if pd.notna(row.get("volume_ratio")) else None,
                change_24h=round(float(row["change_1d"]), 2) if pd.notna(row.get("change_1d")) else None,
            )
            result = _evaluate_claude_signal(result, df, idx)
            results.append(result)

            time.sleep(0.5)

    # ── Crypto ───────────────────────────────────────────────────────────────
    crypto_data: dict[str, pd.DataFrame] = {}
    for symbol, cg_id in crypto:
        logger.info("[claude_backtest] Fetching crypto data: {}", symbol)
        df = _fetch_crypto_ohlcv(cg_id)
        if df is not None and not df.empty:
            crypto_data[symbol] = _compute_indicators(df)

    fg_history = _fetch_fear_greed_history() if crypto_data else {}

    for symbol, df in crypto_data.items():
        for date_str in sample_dates:
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

            result = ClaudeSignalResult(
                ticker=symbol,
                asset_class="crypto",
                sample_date=actual_date,
                direction=signal.direction,
                confidence=signal.confidence,
                time_horizon=signal.time_horizon,
                reasoning=signal.reasoning,
                entry_price=float(row["close"]),
                rsi=round(float(row["_rsi"]), 2)       if pd.notna(row.get("_rsi")) else None,
                macd_hist=round(float(row["_macd_hist"]), 4) if pd.notna(row.get("_macd_hist")) else None,
                volume_ratio=round(float(row["volume_ratio"]), 2) if pd.notna(row.get("volume_ratio")) else None,
                change_24h=round(float(row["change_1d"]), 2) if pd.notna(row.get("change_1d")) else None,
            )
            result = _evaluate_claude_signal(result, df, idx)
            results.append(result)

            time.sleep(0.5)

    # ── Aggregate results ────────────────────────────────────────────────────
    agg = _aggregate_claude_results(results, api_calls, errors)

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

    signal_details = []
    for r in results:
        signal_details.append({
            "ticker":       r.ticker,
            "asset_class":  r.asset_class,
            "date":         r.sample_date,
            "direction":    r.direction,
            "confidence":   r.confidence,
            "time_horizon": r.time_horizon,
            "entry_price":  r.entry_price,
            "exit_price":   r.exit_price,
            "return_pct":   r.return_pct,
            "outcome":      r.outcome,
            "reasoning":    r.reasoning[:200],
            "rsi":          r.rsi,
            "macd_hist":    r.macd_hist,
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
        "hold_rate":        round(len(holds) / len(results) * 100, 1) if results else 0,
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
