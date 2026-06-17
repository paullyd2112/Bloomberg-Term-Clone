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
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

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

FMP_KEY  = os.environ.get("FMP_API_KEY", "")
AV_KEY   = os.environ.get("ALPHA_VANTAGE_API_KEY", "")
CG_KEY   = os.environ.get("COINGECKO_API_KEY", "")
FMP_BASE = "https://financialmodelingprep.com/api/v3"
CG_BASE  = "https://api.coingecko.com/api/v3"

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
        req = urllib.request.Request(url, headers=headers or {})
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except Exception as e:
        logger.debug("HTTP fetch failed: {} — {}", url[:80], e)
        return None


def _fetch_stock_ohlcv(ticker: str) -> pd.DataFrame | None:
    if not FMP_KEY:
        return None
    url = (
        f"{FMP_BASE}/historical-price-full/{ticker}"
        f"?from={DATE_FROM}&to={DATE_TO}&apikey={FMP_KEY}"
    )
    data = _get_json(url)
    if not data:
        return None
    hist = data.get("historical", [])
    if not hist:
        return None
    df = pd.DataFrame(hist)
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values("date").set_index("date")
    needed = {"open", "high", "low", "close", "volume"}
    if not needed.issubset(df.columns):
        return None
    return df[list(needed)].astype(float)


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

    return df


# ─── Build context for Claude (mirrors live engine) ─────────────────────────

def _build_stock_context(ticker: str, row: pd.Series, df: pd.DataFrame) -> dict:
    return {
        "identifier":     ticker,
        "current_price":  float(row["close"]),
        "change_24h":     round(float(row["change_1d"]), 2) if pd.notna(row.get("change_1d")) else None,
        "technical_indicators": {
            "rsi_14":            round(float(row["_rsi"]), 2)       if pd.notna(row.get("_rsi")) else None,
            "macd_line":         round(float(row["_macd_line"]), 4) if pd.notna(row.get("_macd_line")) else None,
            "macd_signal":       round(float(row["_macd_sig"]), 4)  if pd.notna(row.get("_macd_sig")) else None,
            "macd_hist":         round(float(row["_macd_hist"]), 4) if pd.notna(row.get("_macd_hist")) else None,
            "bb_upper":          None,
            "bb_middle":         None,
            "bb_lower":          None,
            "price_vs_sma50_pct": round(float(row["price_vs_sma50"]), 2) if pd.notna(row.get("price_vs_sma50")) else None,
            "volume_ratio":      round(float(row["volume_ratio"]), 2)    if pd.notna(row.get("volume_ratio")) else None,
        },
        "news_headlines": [],
    }


def _build_crypto_context(symbol: str, row: pd.Series) -> dict:
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
        "fear_greed":    {"value": 50, "value_classification": "Neutral"},
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

    win_thresh = WIN_THRESHOLDS.get(
        (signal.asset_class, signal.time_horizon), 0.02
    )

    if signal.direction == "BUY":
        if pct_change >= win_thresh:
            signal.outcome = "WIN"
        elif pct_change <= -win_thresh:
            signal.outcome = "LOSS"
        else:
            signal.outcome = "NEUTRAL"
    elif signal.direction == "SELL":
        if pct_change <= -win_thresh:
            signal.outcome = "WIN"
        elif pct_change >= win_thresh:
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
    stocks       = stocks or SAMPLE_STOCKS
    crypto       = crypto or CRYPTO_ASSETS
    sample_dates = sample_dates or SAMPLE_DATES
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

    # ── Stocks ───────────────────────────────────────────────────────────────
    stock_data: dict[str, pd.DataFrame] = {}
    for ticker in stocks:
        logger.info("[claude_backtest] Fetching stock data: {}", ticker)
        df = _fetch_stock_ohlcv(ticker)
        if df is not None and not df.empty:
            stock_data[ticker] = _compute_indicators(df)
            logger.info("[claude_backtest] {} → {} rows ({} to {})", ticker, len(df), df.index[0].date(), df.index[-1].date())
        else:
            logger.warning("[claude_backtest] {} → no data returned from FMP", ticker)
        time.sleep(0.3)

    for ticker, df in stock_data.items():
        for date_str in sample_dates:
            target = pd.Timestamp(date_str)
            idx = df.index.get_indexer([target], method="ffill")[0]
            if idx < 0 or idx < 50:
                logger.debug("[claude_backtest] Skipping {}/{}: idx={} (need >= 50 for indicators)", ticker, date_str, idx)
                continue

            row = df.iloc[idx]
            actual_date = str(df.index[idx].date())
            context = _build_stock_context(ticker, row, df)

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

    for symbol, df in crypto_data.items():
        for date_str in sample_dates:
            target = pd.Timestamp(date_str)
            idx = df.index.get_indexer([target], method="ffill")[0]
            if idx < 0 or idx < 50:
                continue

            row = df.iloc[idx]
            actual_date = str(df.index[idx].date())
            context = _build_crypto_context(symbol, row)

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
