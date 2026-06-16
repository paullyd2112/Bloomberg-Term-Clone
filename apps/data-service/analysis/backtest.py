"""
Historical backtest — rules-based simulation of the live scoring engine.

Applies the same technical indicators + circuit breaker logic used in
scoring/engine.py, but over 2 years of historical OHLCV data instead of
calling Claude for each bar.  This lets us estimate signal accuracy and
return characteristics *before* we have months of live signal history.

Run standalone:
    cd apps/data-service
    python -m analysis.backtest

Or import and call:
    from analysis.backtest import run_backtest
    results = run_backtest()
"""

from __future__ import annotations

import json
import os
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

import numpy as np
import pandas as pd
import pandas_ta_classic as ta
import yfinance as yf
from loguru import logger

# ─── Constants ────────────────────────────────────────────────────────────────

LOOKBACK_PERIOD   = "2y"          # yfinance period string
HOLD_DAYS         = 5             # trading days to measure outcome
CIRCUIT_BREAKER   = 8.0           # % gap that triggers HOLD override
MIN_CONFIDENCE    = 60            # below this → HOLD, no signal counted
RSI_OVERSOLD      = 30
RSI_OVERBOUGHT    = 70
VOLUME_CONFIRM    = 1.5           # volume_ratio threshold to confirm move

# Stocks Plebs covers — matches ingestion/stocks.py DEFAULT_WATCHLIST
DEFAULT_STOCKS = [
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

    # Sector ETFs
    "SPY", "QQQ", "ARKK", "SOXX", "XBI",
]

# Crypto — yfinance tickers (mapped from Plebs identifiers, top coins + mid-caps)
DEFAULT_CRYPTO = [
    # Large cap
    "BTC-USD", "ETH-USD", "BNB-USD", "SOL-USD", "XRP-USD",
    # Mid cap momentum
    "DOGE-USD", "ADA-USD", "AVAX-USD", "LINK-USD", "DOT-USD",
    "MATIC-USD", "UNI-USD", "LTC-USD", "ATOM-USD",
    # High-vol / narrative plays
    "PEPE-USD", "WIF-USD", "SHIB-USD", "APT-USD", "SUI-USD",
]

DEFAULT_TICKERS = DEFAULT_STOCKS + DEFAULT_CRYPTO


# ─── Data classes ─────────────────────────────────────────────────────────────

@dataclass
class SignalRecord:
    ticker:     str
    date:       str
    direction:  Literal["BUY", "SELL", "HOLD"]
    confidence: int
    price:      float
    rsi:        float | None
    macd_hist:  float | None
    vol_ratio:  float | None
    change_1d:  float | None
    circuit_breaker_fired: bool = False
    forward_return_5d: float | None = None
    outcome: Literal["WIN", "LOSS", "HOLD", "PENDING"] = "PENDING"


@dataclass
class TickerStats:
    ticker:      str
    total:       int = 0
    buys:        int = 0
    sells:       int = 0
    holds:       int = 0
    wins:        int = 0
    losses:      int = 0
    returns:     list[float] = field(default_factory=list)

    @property
    def actionable(self) -> int:
        return self.buys + self.sells

    @property
    def win_rate(self) -> float | None:
        return self.wins / self.actionable if self.actionable else None

    @property
    def avg_return_pct(self) -> float | None:
        return float(np.mean(self.returns)) if self.returns else None

    @property
    def sharpe(self) -> float | None:
        if len(self.returns) < 2:
            return None
        r = np.array(self.returns)
        std = r.std(ddof=1)
        return float(r.mean() / std * np.sqrt(252 / HOLD_DAYS)) if std > 0 else None


# ─── Indicator computation ────────────────────────────────────────────────────

def _compute_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """Compute same indicators as ingestion/stocks.py, returning enriched DataFrame."""
    df = df.copy()
    df.columns = [c.lower() for c in df.columns]

    df.ta.rsi(length=14, append=True)
    df.ta.macd(fast=12, slow=26, signal=9, append=True)
    df.ta.bbands(length=20, std=2, append=True)

    df["volume_sma_20"]    = df["volume"].rolling(20).mean()
    df["sma_50"]           = df["close"].rolling(50).mean()
    df["price_vs_sma50"]   = (df["close"] - df["sma_50"]) / df["sma_50"] * 100
    df["change_1d"]        = df["close"].pct_change() * 100
    df["volume_ratio"]     = df["volume"] / df["volume_sma_20"]

    # Resolve pandas-ta column names (include params in name)
    def _find(prefix: str) -> str | None:
        matches = [c for c in df.columns if c.startswith(prefix.lower())]
        return matches[0] if matches else None

    df["_rsi"]       = df.get(_find("rsi_"))
    df["_macd_line"] = df.get(_find("macd_"))
    df["_macd_sig"]  = df.get(_find("macds_"))
    df["_macd_hist"] = df.get(_find("macdh_"))

    return df


# ─── Rules-based signal generation ───────────────────────────────────────────

def _generate_signal(row: pd.Series, prev_row: pd.Series) -> tuple[Literal["BUY", "SELL", "HOLD"], int]:
    """
    Deterministic rules approximating what the Claude scoring prompt does.
    Returns (direction, confidence).
    """
    rsi        = row.get("_rsi")
    macd_hist  = row.get("_macd_hist")
    prev_hist  = prev_row.get("_macd_hist") if prev_row is not None else None
    vol_ratio  = row.get("volume_ratio")
    sma50_pct  = row.get("price_vs_sma50")
    change_1d  = row.get("change_1d")

    bullish_score = 0
    bearish_score = 0

    # RSI signals
    if pd.notna(rsi):
        if rsi < RSI_OVERSOLD:
            bullish_score += 30
        elif rsi > RSI_OVERBOUGHT:
            bearish_score += 30
        elif rsi < 45:
            bullish_score += 10
        elif rsi > 55:
            bearish_score += 10

    # MACD crossover (histogram turning positive/negative)
    if pd.notna(macd_hist) and pd.notna(prev_hist):
        if prev_hist < 0 and macd_hist > 0:
            bullish_score += 25   # bullish crossover
        elif prev_hist > 0 and macd_hist < 0:
            bearish_score += 25   # bearish crossover
        elif macd_hist > 0:
            bullish_score += 10
        elif macd_hist < 0:
            bearish_score += 10

    # SMA-50 position
    if pd.notna(sma50_pct):
        if sma50_pct > 5:
            bearish_score += 8    # extended above SMA — mean-reversion risk
        elif sma50_pct < -5:
            bullish_score += 8    # below SMA — potential bounce
        elif sma50_pct > 0:
            bullish_score += 4
        else:
            bearish_score += 4

    # Volume confirmation
    vol_boost = 0
    if pd.notna(vol_ratio) and vol_ratio > VOLUME_CONFIRM:
        vol_boost = 10

    # Determine direction and raw confidence
    if bullish_score > bearish_score:
        raw_conf = min(50 + bullish_score + vol_boost, 100)
        direction: Literal["BUY", "SELL", "HOLD"] = "BUY"
    elif bearish_score > bullish_score:
        raw_conf = min(50 + bearish_score + vol_boost, 100)
        direction = "SELL"
    else:
        return "HOLD", 50

    # Circuit breaker — mirrors scoring/engine.py
    if pd.notna(change_1d):
        if change_1d >= CIRCUIT_BREAKER and direction == "SELL":
            return "HOLD", min(raw_conf, 45)
        if change_1d <= -CIRCUIT_BREAKER and direction == "BUY":
            return "HOLD", min(raw_conf, 45)

    # Below confidence floor → HOLD
    if raw_conf < MIN_CONFIDENCE:
        return "HOLD", raw_conf

    return direction, raw_conf


# ─── Outcome evaluation ───────────────────────────────────────────────────────

def _evaluate_outcome(
    direction: Literal["BUY", "SELL", "HOLD"],
    signal_price: float,
    future_price: float | None,
) -> tuple[Literal["WIN", "LOSS", "HOLD", "PENDING"], float | None]:
    if direction == "HOLD" or future_price is None:
        return "HOLD", None

    fwd_return = (future_price - signal_price) / signal_price * 100

    if direction == "BUY":
        outcome = "WIN" if fwd_return > 0 else "LOSS"
    else:  # SELL
        outcome = "WIN" if fwd_return < 0 else "LOSS"
        fwd_return = -fwd_return  # positive = we were right

    return outcome, round(fwd_return, 4)


# ─── Per-ticker backtest ──────────────────────────────────────────────────────

def _backtest_ticker(ticker: str) -> tuple[list[SignalRecord], TickerStats]:
    logger.info("Backtesting {}", ticker)

    try:
        raw = yf.download(
            ticker,
            period=LOOKBACK_PERIOD,
            interval="1d",
            auto_adjust=True,
            progress=False,
        )
    except Exception as e:
        logger.error("{}: download failed — {}", ticker, e)
        return [], TickerStats(ticker=ticker)

    if raw is None or raw.empty:
        logger.warning("{}: empty data", ticker)
        return [], TickerStats(ticker=ticker)

    # Flatten MultiIndex columns (yfinance single-ticker quirk)
    if isinstance(raw.columns, pd.MultiIndex):
        raw.columns = raw.columns.get_level_values(0)

    df = _compute_indicators(raw)

    records: list[SignalRecord] = []
    stats = TickerStats(ticker=ticker)

    # Need at least 51 rows to have valid SMA-50 + previous bar
    start_idx = 51
    # Leave HOLD_DAYS at the end so we can measure outcomes
    end_idx = len(df) - HOLD_DAYS

    if end_idx <= start_idx:
        logger.warning("{}: not enough data ({} rows)", ticker, len(df))
        return [], stats

    for i in range(start_idx, end_idx):
        row      = df.iloc[i]
        prev_row = df.iloc[i - 1]

        direction, confidence = _generate_signal(row, prev_row)

        signal_price  = float(row["close"])
        future_price  = float(df.iloc[i + HOLD_DAYS]["close"])
        fwd_return: float | None
        outcome, fwd_return = _evaluate_outcome(direction, signal_price, future_price)

        circuit_fired = (
            pd.notna(row.get("change_1d")) and (
                (float(row["change_1d"]) >= CIRCUIT_BREAKER) or
                (float(row["change_1d"]) <= -CIRCUIT_BREAKER)
            )
        ) and direction == "HOLD" and confidence <= 45

        rec = SignalRecord(
            ticker=ticker,
            date=str(df.index[i].date()),
            direction=direction,
            confidence=confidence,
            price=signal_price,
            rsi=float(row["_rsi"]) if pd.notna(row.get("_rsi")) else None,
            macd_hist=float(row["_macd_hist"]) if pd.notna(row.get("_macd_hist")) else None,
            vol_ratio=float(row["volume_ratio"]) if pd.notna(row.get("volume_ratio")) else None,
            change_1d=float(row["change_1d"]) if pd.notna(row.get("change_1d")) else None,
            circuit_breaker_fired=circuit_fired,
            forward_return_5d=fwd_return,
            outcome=outcome,
        )
        records.append(rec)

        stats.total += 1
        if direction == "BUY":
            stats.buys += 1
        elif direction == "SELL":
            stats.sells += 1
        else:
            stats.holds += 1

        if outcome == "WIN":
            stats.wins += 1
            if fwd_return is not None:
                stats.returns.append(fwd_return)
        elif outcome == "LOSS":
            stats.losses += 1
            if fwd_return is not None:
                stats.returns.append(fwd_return)

    return records, stats


# ─── Aggregate statistics ─────────────────────────────────────────────────────

def _aggregate(all_stats: list[TickerStats], all_records: list[SignalRecord]) -> dict:
    total_signals  = sum(s.total for s in all_stats)
    total_buys     = sum(s.buys for s in all_stats)
    total_sells    = sum(s.sells for s in all_stats)
    total_holds    = sum(s.holds for s in all_stats)
    total_wins     = sum(s.wins for s in all_stats)
    total_losses   = sum(s.losses for s in all_stats)
    all_returns    = [r for s in all_stats for r in s.returns]

    actionable = total_buys + total_sells
    win_rate   = total_wins / actionable if actionable else 0

    avg_return = float(np.mean(all_returns)) if all_returns else 0.0
    sharpe: float | None = None
    if len(all_returns) >= 2:
        r   = np.array(all_returns)
        std = r.std(ddof=1)
        sharpe = float(r.mean() / std * np.sqrt(252 / HOLD_DAYS)) if std > 0 else None

    # Best / worst individual trades
    sorted_rec = sorted(
        [r for r in all_records if r.forward_return_5d is not None],
        key=lambda r: r.forward_return_5d or 0,
    )
    best  = sorted_rec[-10:][::-1] if sorted_rec else []
    worst = sorted_rec[:10] if sorted_rec else []

    # Win rate breakdown by direction
    buy_wins  = sum(1 for r in all_records if r.direction == "BUY"  and r.outcome == "WIN")
    sell_wins = sum(1 for r in all_records if r.direction == "SELL" and r.outcome == "WIN")
    buy_wr    = buy_wins  / total_buys  if total_buys  else None
    sell_wr   = sell_wins / total_sells if total_sells else None

    # Crypto vs stock breakdown
    crypto_tickers = set(DEFAULT_CRYPTO)
    crypto_stats = [s for s in all_stats if s.ticker in crypto_tickers]
    stock_stats  = [s for s in all_stats if s.ticker not in crypto_tickers]

    def _group_stats(group: list[TickerStats]) -> dict:
        g_wins = sum(s.wins for s in group)
        g_act  = sum(s.actionable for s in group)
        g_rets = [r for s in group for r in s.returns]
        return {
            "actionable": g_act,
            "win_rate":   round(g_wins / g_act * 100, 1) if g_act else None,
            "avg_return": round(float(np.mean(g_rets)), 3) if g_rets else None,
        }

    return {
        "total_bars_evaluated": total_signals,
        "actionable_signals":   actionable,
        "buys":     total_buys,
        "sells":    total_sells,
        "holds":    total_holds,
        "wins":     total_wins,
        "losses":   total_losses,
        "win_rate": round(win_rate * 100, 1),
        "buy_win_rate":  round(buy_wr  * 100, 1) if buy_wr  is not None else None,
        "sell_win_rate": round(sell_wr * 100, 1) if sell_wr is not None else None,
        "avg_return_pct": round(avg_return, 3),
        "sharpe_ratio":   round(sharpe, 3) if sharpe is not None else None,
        "by_asset_class": {
            "stocks": _group_stats(stock_stats),
            "crypto": _group_stats(crypto_stats),
        },
        "best_trades": [
            {"ticker": r.ticker, "date": r.date, "direction": r.direction,
             "return_pct": r.forward_return_5d}
            for r in best
        ],
        "worst_trades": [
            {"ticker": r.ticker, "date": r.date, "direction": r.direction,
             "return_pct": r.forward_return_5d}
            for r in worst
        ],
        "per_ticker": [
            {
                "ticker":        s.ticker,
                "asset_class":   "crypto" if s.ticker in crypto_tickers else "stock",
                "signals":       s.actionable,
                "win_rate":      round(s.win_rate * 100, 1) if s.win_rate is not None else None,
                "avg_return":    round(s.avg_return_pct, 3) if s.avg_return_pct is not None else None,
                "sharpe":        round(s.sharpe, 3) if s.sharpe is not None else None,
            }
            for s in sorted(all_stats, key=lambda s: s.win_rate or 0, reverse=True)
        ],
    }


# ─── CSV export ───────────────────────────────────────────────────────────────

def _export_csv(records: list[SignalRecord], path: str) -> None:
    rows = [
        {
            "ticker":    r.ticker,
            "date":      r.date,
            "direction": r.direction,
            "confidence": r.confidence,
            "price":     r.price,
            "rsi":       r.rsi,
            "macd_hist": r.macd_hist,
            "vol_ratio": r.vol_ratio,
            "change_1d": r.change_1d,
            "circuit_breaker": r.circuit_breaker_fired,
            "forward_return_5d": r.forward_return_5d,
            "outcome":   r.outcome,
        }
        for r in records
    ]
    pd.DataFrame(rows).to_csv(path, index=False)
    logger.info("Signal log exported → {}", path)


# ─── Supabase writer (optional) ──────────────────────────────────────────────

def _write_to_supabase(records: list[SignalRecord]) -> int:
    """Write backtest signals to Supabase with is_backtest=True. Returns rows inserted."""
    try:
        from supabase_client import supabase
    except ImportError:
        logger.warning("supabase_client not available — skipping DB write")
        return 0

    rows = [
        {
            "asset_type":      "stock",
            "identifier":      r.ticker,
            "direction":       r.direction,
            "confidence":      r.confidence,
            "reasoning":       (
                f"[Backtest {r.date}] RSI={r.rsi:.1f}, MACD_hist={r.macd_hist:.4f}, "
                f"vol_ratio={r.vol_ratio:.2f}"
                if r.rsi and r.macd_hist and r.vol_ratio else f"[Backtest {r.date}]"
            ),
            "time_horizon":    "swing",
            "price_at_signal": r.price,
            "is_backtest":     True,
            "outcome":         r.outcome if r.outcome != "PENDING" else "PENDING",
            "news_context":    [],
        }
        for r in records
        if r.direction != "HOLD"
    ]

    inserted = 0
    batch_size = 100
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        try:
            supabase.table("signals").insert(batch).execute()
            inserted += len(batch)
        except Exception as e:
            logger.error("Supabase batch write failed (batch {}): {}", i // batch_size, e)

    logger.info("Wrote {} backtest signals to Supabase", inserted)
    return inserted


# ─── Main entry point ─────────────────────────────────────────────────────────

def run_backtest(
    tickers: list[str] | None = None,
    export_csv: bool = True,
    write_db: bool = False,
    output_dir: str | None = None,
) -> dict:
    """
    Run historical backtest over `tickers` (defaults to DEFAULT_TICKERS).

    Args:
        tickers:    list of ticker symbols, or None for default watchlist
        export_csv: write per-signal log to CSV
        write_db:   write backtest signals to Supabase (is_backtest=True)
        output_dir: directory for output files (default: current dir)

    Returns:
        Aggregate statistics dict.
    """
    tickers    = tickers or DEFAULT_TICKERS
    output_dir = output_dir or str(Path.cwd())
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    all_records: list[SignalRecord] = []
    all_stats:   list[TickerStats]  = []

    logger.info("Starting backtest: {} tickers, {} lookback, {}-day hold",
                len(tickers), LOOKBACK_PERIOD, HOLD_DAYS)

    for i, ticker in enumerate(tickers):
        records, stats = _backtest_ticker(ticker)
        all_records.extend(records)
        all_stats.append(stats)
        if i < len(tickers) - 1:
            time.sleep(0.3)   # be polite to yfinance

    agg = _aggregate(all_stats, all_records)

    if export_csv:
        csv_path = str(Path(output_dir) / "backtest_signals.csv")
        _export_csv(all_records, csv_path)
        agg["csv_path"] = csv_path

    if write_db:
        agg["db_rows_inserted"] = _write_to_supabase(all_records)

    json_path = str(Path(output_dir) / "backtest_results.json")
    with open(json_path, "w") as f:
        json.dump(agg, f, indent=2)
    logger.info("Results JSON → {}", json_path)
    agg["json_path"] = json_path

    return agg


def _print_report(agg: dict) -> None:
    sep = "─" * 60
    print(f"\n{sep}")
    print("  PLEBS HISTORICAL BACKTEST REPORT")
    print(f"  {LOOKBACK_PERIOD} lookback · {HOLD_DAYS}-day hold")
    print(f"  {len(DEFAULT_STOCKS)} stocks · {len(DEFAULT_CRYPTO)} crypto · {len(DEFAULT_TICKERS)} total")
    print(sep)
    print(f"  Bars evaluated:    {agg['total_bars_evaluated']:,}")
    print(f"  Actionable signals:{agg['actionable_signals']:,}")
    print(f"    BUYs:            {agg['buys']:,}")
    print(f"    SELLs:           {agg['sells']:,}")
    print(f"    HOLDs:           {agg['holds']:,}")
    print(f"\n  Overall win rate:  {agg['win_rate']}%")
    if agg.get("buy_win_rate") is not None:
        print(f"  BUY win rate:      {agg['buy_win_rate']}%")
    if agg.get("sell_win_rate") is not None:
        print(f"  SELL win rate:     {agg['sell_win_rate']}%")
    print(f"\n  Avg return/signal: {agg['avg_return_pct']:+.3f}%")
    if agg.get("sharpe_ratio") is not None:
        print(f"  Sharpe ratio:      {agg['sharpe_ratio']:.3f} (annualized)")

    by_class = agg.get("by_asset_class", {})
    if by_class:
        print(f"\n  ── By asset class ──")
        for cls, stats in by_class.items():
            wr = f"{stats['win_rate']:.1f}%" if stats.get("win_rate") is not None else "N/A"
            ar = f"{stats['avg_return']:+.3f}%" if stats.get("avg_return") is not None else "N/A"
            print(f"  {cls.upper():8s}  signals={stats['actionable']:4d}  wr={wr:6s}  avg={ar}")

    print(f"\n{sep}")
    print("  TOP 10 TRADES")
    for t in agg.get("best_trades", []):
        print(f"  {t['ticker']:8s} {t['date']}  {t['direction']:4s}  {t['return_pct']:+.2f}%")
    print(f"\n  WORST 10 TRADES")
    for t in agg.get("worst_trades", []):
        print(f"  {t['ticker']:8s} {t['date']}  {t['direction']:4s}  {t['return_pct']:+.2f}%")
    print(f"\n{sep}")
    print("  WIN RATE BY TICKER")
    for s in agg.get("per_ticker", []):
        wr = f"{s['win_rate']:.1f}%" if s["win_rate"] is not None else "  N/A "
        ar = f"{s['avg_return']:+.2f}%" if s["avg_return"] is not None else "  N/A "
        cls = "crypto" if s.get("asset_class") == "crypto" else "stock "
        print(f"  [{cls}] {s['ticker']:8s}  signals={s['signals']:3d}  wr={wr}  avg={ar}")
    print(sep)
    if agg.get("csv_path"):
        print(f"\n  Signals log  → {agg['csv_path']}")
    if agg.get("json_path"):
        print(f"  Full results → {agg['json_path']}")
    print()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Plebs historical backtest")
    parser.add_argument("--tickers", nargs="*", help="Override default ticker list")
    parser.add_argument("--write-db",  action="store_true", help="Write signals to Supabase")
    parser.add_argument("--no-csv",    action="store_true", help="Skip CSV export")
    parser.add_argument("--output-dir", default=".", help="Output directory for files")
    args = parser.parse_args()

    agg = run_backtest(
        tickers=args.tickers,
        export_csv=not args.no_csv,
        write_db=args.write_db,
        output_dir=args.output_dir,
    )
    _print_report(agg)
