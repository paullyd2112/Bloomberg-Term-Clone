"""
Factor discovery — empirical, model-free study of which technical-indicator
states actually predicted forward returns over the past ~10 months.

This is deliberately NOT another scoring engine. It doesn't assign weights,
pick a direction, or use pre-baked archetype logic (that's what
analysis/backtest.py's _generate_signal does, and it's long-only and
hand-tuned, not empirically derived). Instead: bucket every historical
(ticker, day) observation by its raw indicator state, and measure the
*actual* forward-return distribution in each bucket -- split into a train
period and a held-out test period, so a bucket only counts as "real edge"
if it holds up on data it wasn't derived from.

Usage:
    from analysis.factor_discovery import run_factor_discovery
    results = run_factor_discovery()

Or via scheduler endpoint:
    POST /factor-discovery
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
from loguru import logger

from analysis.backtest import DEFAULT_STOCKS, DATE_FROM, DATE_TO, _fetch_stock_ohlcv, _compute_indicators

# ~6.5 months train / ~3.5 months test, out of the Sept 2025 - July 2026 range.
TRAIN_TEST_SPLIT = "2026-03-15"
FORWARD_DAYS = [3, 5, 10]

# Robustness bar: a bucket only counts as real signal if train AND test both
# clear this margin away from a 50/50 coin flip, with enough test-period
# observations that the number isn't just noise.
EDGE_THRESHOLD_PCT = 55.0   # % positive (or negative) days needed, each side
MIN_TEST_N = 20


def _bucket_rsi(rsi: float | None) -> str | None:
    if rsi is None or pd.isna(rsi):
        return None
    if rsi < 30:  return "rsi<30"
    if rsi < 45:  return "rsi_30-45"
    if rsi < 55:  return "rsi_45-55"
    if rsi < 70:  return "rsi_55-70"
    return "rsi>70"


def _bucket_macd(hist: float | None, prev_hist: float | None) -> str | None:
    if hist is None or prev_hist is None or pd.isna(hist) or pd.isna(prev_hist):
        return None
    if prev_hist <= 0 < hist:
        return "macd_cross_up"
    if prev_hist >= 0 > hist:
        return "macd_cross_down"
    if hist > 0:
        return "macd_pos_expanding" if hist > prev_hist else "macd_pos_contracting"
    return "macd_neg_deepening" if hist < prev_hist else "macd_neg_recovering"


def _bucket_volume(ratio: float | None) -> str | None:
    if ratio is None or pd.isna(ratio):
        return None
    if ratio > 1.5: return "vol>1.5x"
    if ratio > 1.0: return "vol_1-1.5x"
    return "vol<1x"


def _bucket_sma50(pct: float | None) -> str | None:
    if pct is None or pd.isna(pct):
        return None
    if pct > 15:  return "sma50>+15%"
    if pct > 5:   return "sma50_+5-15%"
    if pct > 0:   return "sma50_0-5%"
    if pct > -5:  return "sma50_-5-0%"
    return "sma50<-5%"


def _collect_observations(stocks: list[str]) -> pd.DataFrame:
    """One row per (ticker, day) with bucketed indicator state + forward
    returns at each horizon in FORWARD_DAYS. No direction, no scoring --
    just what happened next, unconditionally."""
    rows: list[dict] = []

    for ticker in stocks:
        try:
            df = _fetch_stock_ohlcv(ticker)
        except Exception as e:
            logger.warning("factor_discovery: {} fetch failed — {}", ticker, e)
            continue
        if df is None or df.empty:
            logger.warning("factor_discovery: {} — no data", ticker)
            continue

        df = _compute_indicators(df)
        n = len(df)
        if n < 60:
            continue

        for i in range(51, n):
            row  = df.iloc[i]
            prev = df.iloc[i - 1]
            date = df.index[i]
            close = float(row["close"])

            rec = {
                "ticker":      ticker,
                "date":        str(date.date()),
                "rsi_bucket":  _bucket_rsi(row.get("_rsi")),
                "macd_bucket": _bucket_macd(row.get("_macd_hist"), prev.get("_macd_hist")),
                "vol_bucket":  _bucket_volume(row.get("volume_ratio")),
                "sma50_bucket": _bucket_sma50(row.get("price_vs_sma50")),
            }
            for h in FORWARD_DAYS:
                if i + h < n:
                    fwd_close = float(df.iloc[i + h]["close"])
                    rec[f"fwd_ret_{h}d"] = (fwd_close - close) / close * 100
                else:
                    rec[f"fwd_ret_{h}d"] = None
            rows.append(rec)

        logger.info("factor_discovery: {} — {} observations", ticker, n - 51)

    return pd.DataFrame(rows)


def _summarize_bucket(sub: pd.DataFrame, horizon: int) -> dict:
    col = f"fwd_ret_{horizon}d"
    rets = sub[col].dropna()
    n = len(rets)
    if n == 0:
        return {"n": 0, "pct_positive": None, "avg_return": None}
    return {
        "n":            n,
        "pct_positive": round(float((rets > 0).mean() * 100), 1),
        "avg_return":   round(float(rets.mean()), 3),
    }


def _analyze_factor(data: pd.DataFrame, bucket_col: str, horizon: int) -> dict:
    out = {}
    for period in ("train", "test"):
        sub = data[data["period"] == period]
        for bucket_val in sorted(sub[bucket_col].dropna().unique()):
            b = sub[sub[bucket_col] == bucket_val]
            out.setdefault(bucket_val, {})[period] = _summarize_bucket(b, horizon)
    return out


def _analyze_combo(data: pd.DataFrame, cols: list[str], horizon: int, min_n: int = 15) -> dict:
    """Two-factor combinations, matching the 'confluence requirement'
    concept already in the live prompts -- single-factor edges are often
    weaker/noisier than confirmed combinations."""
    out = {}
    for period in ("train", "test"):
        sub = data[data["period"] == period].dropna(subset=cols)
        grouped = sub.groupby(cols)
        for key, g in grouped:
            if len(g) < min_n and period == "train":
                continue
            label = " + ".join(f"{c}={v}" for c, v in zip(cols, key if isinstance(key, tuple) else (key,)))
            out.setdefault(label, {})[period] = _summarize_bucket(g, horizon)
    return out


def _flag_robust(bucket_results: dict) -> dict:
    """A bucket only counts as real, out-of-sample edge if train AND test
    both clear EDGE_THRESHOLD_PCT on the SAME side (both bullish or both
    bearish), with enough test observations to trust the number."""
    robust = {}
    for label, periods in bucket_results.items():
        train = periods.get("train")
        test  = periods.get("test")
        if not train or not test or train["n"] == 0 or test["n"] == 0:
            continue
        if test["n"] < MIN_TEST_N:
            continue
        train_pct, test_pct = train["pct_positive"], test["pct_positive"]
        bullish = train_pct >= EDGE_THRESHOLD_PCT and test_pct >= EDGE_THRESHOLD_PCT
        bearish = train_pct <= (100 - EDGE_THRESHOLD_PCT) and test_pct <= (100 - EDGE_THRESHOLD_PCT)
        if bullish or bearish:
            robust[label] = {
                "direction": "BUY-favorable" if bullish else "SELL-favorable",
                "train": train,
                "test": test,
            }
    return robust


def run_factor_discovery(stocks: list[str] | None = None, output_dir: str | None = None) -> dict:
    stocks = stocks or DEFAULT_STOCKS
    output_dir = output_dir or "/tmp/factor_discovery"
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    logger.info("[factor_discovery] Starting — {} stocks, {} to {}, split at {}",
                len(stocks), DATE_FROM, DATE_TO, TRAIN_TEST_SPLIT)

    data = _collect_observations(stocks)
    if data.empty:
        return {"error": "no observations collected"}

    data["period"] = np.where(data["date"] < TRAIN_TEST_SPLIT, "train", "test")

    train_n = int((data["period"] == "train").sum())
    test_n  = int((data["period"] == "test").sum())

    results: dict = {
        "date_range":   f"{DATE_FROM} → {DATE_TO}",
        "train_test_split": TRAIN_TEST_SPLIT,
        "tickers":      len(data["ticker"].unique()),
        "total_observations": len(data),
        "train_observations": train_n,
        "test_observations":  test_n,
        "by_horizon": {},
    }

    single_factor_cols = ["rsi_bucket", "macd_bucket", "vol_bucket", "sma50_bucket"]
    combo_pairs = [
        ("rsi_bucket", "macd_bucket"),
        ("macd_bucket", "sma50_bucket"),
        ("macd_bucket", "vol_bucket"),
        ("rsi_bucket", "sma50_bucket"),
    ]

    for horizon in FORWARD_DAYS:
        single_factor_results: dict = {}
        for col in single_factor_cols:
            single_factor_results.update(_analyze_factor(data, col, horizon))

        combo_results: dict = {}
        for cols in combo_pairs:
            combo_results.update(_analyze_combo(data, list(cols), horizon))

        all_buckets = {**single_factor_results, **combo_results}
        robust = _flag_robust(all_buckets)

        results["by_horizon"][f"{horizon}d"] = {
            "single_factor": single_factor_results,
            "combos":        combo_results,
            "robust_out_of_sample": robust,
        }

    json_path = f"{output_dir}/factor_discovery_results.json"
    with open(json_path, "w") as f:
        json.dump(results, f, indent=2, default=str)
    results["json_path"] = json_path

    n_robust = sum(len(results["by_horizon"][f"{h}d"]["robust_out_of_sample"]) for h in FORWARD_DAYS)
    logger.info("[factor_discovery] Complete — {} observations, {} robust out-of-sample buckets found",
                len(data), n_robust)

    return results


if __name__ == "__main__":
    out = run_factor_discovery()
    print(json.dumps({k: v for k, v in out.items() if k != "by_horizon"}, indent=2))
    for h, r in out.get("by_horizon", {}).items():
        print(f"\n=== {h} robust out-of-sample buckets ===")
        print(json.dumps(r["robust_out_of_sample"], indent=2))
