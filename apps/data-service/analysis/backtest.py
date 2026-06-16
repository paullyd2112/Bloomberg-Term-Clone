"""
Historical backtest — Feb 1 2026 → Jun 16 2026.

Data sources (in priority order):
  Stocks : FMP historical daily  → Alpha Vantage daily (fallback)
  Crypto : Binance via CCXT      → Messari OHLCV (fallback)

Applies the same RSI / MACD / volume rules as the live scoring engine,
then runs a paper-trading simulation starting from $1 000.

Run standalone:
    cd apps/data-service
    python -m analysis.backtest [--write-db] [--no-csv] [--output-dir PATH]

Or import:
    from analysis.backtest import run_backtest
    results = run_backtest()
"""

from __future__ import annotations

import json
import os
import time
import urllib.request
import urllib.parse
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

import numpy as np
import pandas as pd
import pandas_ta_classic as ta
from loguru import logger
from dotenv import load_dotenv

load_dotenv()

# ─── Date range ───────────────────────────────────────────────────────────────

DATE_FROM = "2026-02-01"
DATE_TO   = "2026-06-16"

# ─── Signal constants ─────────────────────────────────────────────────────────

HOLD_DAYS              = 10     # trading days — capture more of the move
CIRCUIT_BREAKER        = 8.0    # % single-day gap that overrides signal
MIN_CONFIDENCE         = 65
PAPER_MIN_CONFIDENCE   = 65
RSI_ENTRY_MAX          = 60     # don't enter BUY if RSI already above 60
RSI_OVERSOLD_BOOST     = 35     # extra conviction when RSI is oversold
VOLUME_CONFIRM         = 1.5    # volume ratio threshold for confirmation
SIGNAL_COOLDOWN_BARS   = 8      # min bars between signals for the same ticker
TRAILING_STOP_PCT      = 5.0    # exit if price drops 5% from peak during hold
LONG_ONLY              = True   # no shorts — align with bull market regime

# ─── Paper trading ────────────────────────────────────────────────────────────

INITIAL_CAPITAL   = 1_000.0
POSITION_SIZE_PCT = 0.10    # 10 % of portfolio per trade
MAX_POSITIONS     = 8       # max concurrent open positions

# ─── API keys ─────────────────────────────────────────────────────────────────

FMP_KEY   = os.environ.get("FMP_API_KEY", "")
AV_KEY    = os.environ.get("ALPHA_VANTAGE_API_KEY", "")
CG_KEY    = os.environ.get("COINGECKO_API_KEY", "")    # Demo key header
FMP_BASE  = "https://financialmodelingprep.com/api/v3"
AV_BASE   = "https://www.alphavantage.co/query"
CG_BASE   = "https://api.coingecko.com/api/v3"

# ─── Ticker universes ─────────────────────────────────────────────────────────

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

# Crypto: (display_id, coingecko_id, binance_pair_fallback)
# CoinGecko is primary — matches live ingestion. Binance is last-resort fallback.
CRYPTO_ASSETS: list[tuple[str, str, str]] = [
    ("BTC",   "bitcoin",        "BTC/USDT"),
    ("ETH",   "ethereum",       "ETH/USDT"),
    ("BNB",   "binancecoin",    "BNB/USDT"),
    ("SOL",   "solana",         "SOL/USDT"),
    ("XRP",   "ripple",         "XRP/USDT"),
    ("DOGE",  "dogecoin",       "DOGE/USDT"),
    ("ADA",   "cardano",        "ADA/USDT"),
    ("AVAX",  "avalanche-2",    "AVAX/USDT"),
    ("LINK",  "chainlink",      "LINK/USDT"),
    ("DOT",   "polkadot",       "DOT/USDT"),
    ("MATIC", "matic-network",  "MATIC/USDT"),
    ("UNI",   "uniswap",        "UNI/USDT"),
    ("LTC",   "litecoin",       "LTC/USDT"),
    ("ATOM",  "cosmos",         "ATOM/USDT"),
    ("PEPE",  "pepe",           "PEPE/USDT"),
    ("WIF",   "dogwifcoin",     "WIF/USDT"),
    ("SHIB",  "shiba-inu",      "SHIB/USDT"),
    ("APT",   "aptos",          "APT/USDT"),
    ("SUI",   "sui",            "SUI/USDT"),
]

CRYPTO_IDS = [c[0] for c in CRYPTO_ASSETS]


# ─── Data classes ─────────────────────────────────────────────────────────────

@dataclass
class SignalRecord:
    ticker:     str
    asset_class: Literal["stock", "crypto"]
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
    asset_class: str = "stock"
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


@dataclass
class Trade:
    ticker:      str
    asset_class: str
    direction:   str
    entry_date:  str
    exit_date:   str
    entry_price: float
    exit_price:  float
    invested:    float
    pnl:         float
    return_pct:  float
    outcome:     str


# ─── Data fetching ────────────────────────────────────────────────────────────

def _get_json(url: str) -> dict | None:
    try:
        with urllib.request.urlopen(url, timeout=15) as r:
            return json.loads(r.read())
    except Exception as e:
        logger.debug("HTTP fetch failed: {} — {}", url[:80], e)
        return None


def _fetch_fmp_ohlcv(ticker: str) -> pd.DataFrame | None:
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


def _fetch_av_ohlcv(ticker: str) -> pd.DataFrame | None:
    """Alpha Vantage daily adjusted — fallback for stocks."""
    if not AV_KEY:
        return None
    url = (
        f"{AV_BASE}?function=TIME_SERIES_DAILY_ADJUSTED"
        f"&symbol={ticker}&outputsize=compact&apikey={AV_KEY}"
    )
    data = _get_json(url)
    if not data:
        return None
    ts = data.get("Time Series (Daily)", {})
    if not ts:
        logger.debug("{}: Alpha Vantage returned no data (rate limit?)", ticker)
        return None
    rows = []
    for date_str, vals in ts.items():
        dt = pd.Timestamp(date_str)
        if pd.Timestamp(DATE_FROM) <= dt <= pd.Timestamp(DATE_TO):
            rows.append({
                "date":   dt,
                "open":   float(vals["1. open"]),
                "high":   float(vals["2. high"]),
                "low":    float(vals["3. low"]),
                "close":  float(vals["5. adjusted close"]),
                "volume": float(vals["6. volume"]),
            })
    if not rows:
        return None
    df = pd.DataFrame(rows).sort_values("date").set_index("date")
    return df[["open", "high", "low", "close", "volume"]]


def _fetch_stock_ohlcv(ticker: str) -> pd.DataFrame | None:
    """FMP primary, Alpha Vantage fallback."""
    df = _fetch_fmp_ohlcv(ticker)
    if df is not None and not df.empty:
        return df
    logger.debug("{}: FMP miss — trying Alpha Vantage", ticker)
    time.sleep(0.5)
    return _fetch_av_ohlcv(ticker)


def _fetch_coingecko_ohlcv(cg_id: str) -> pd.DataFrame | None:
    """
    CoinGecko market_chart — daily close + volume.
    Primary source for crypto, matching the live ingestion.
    """
    import time as _time
    from datetime import datetime as _dt

    start_ts = int(_dt.strptime(DATE_FROM, "%Y-%m-%d").timestamp())
    end_ts   = int(_dt.strptime(DATE_TO,   "%Y-%m-%d").timestamp())
    url = (
        f"{CG_BASE}/coins/{cg_id}/market_chart/range"
        f"?vs_currency=usd&from={start_ts}&to={end_ts}"
    )
    headers: dict = {}
    if CG_KEY:
        headers["x-cg-demo-api-key"] = CG_KEY

    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=15) as r:
            data = json.loads(r.read())
    except Exception as e:
        logger.debug("{}: CoinGecko fetch failed — {}", cg_id, e)
        return None

    prices  = data.get("prices", [])
    volumes = data.get("total_volumes", [])
    if not prices:
        return None

    price_map  = {int(ts): p for ts, p in prices}
    volume_map = {int(ts): v for ts, v in volumes}

    rows = []
    for ts, price in prices:
        vol = volume_map.get(int(ts), 0.0)
        rows.append({
            "timestamp": pd.Timestamp(ts, unit="ms", tz="UTC").tz_localize(None),
            "open":   price,    # CoinGecko market_chart gives close only;
            "high":   price,    # we fill OHLC with close — RSI/MACD only need close
            "low":    price,
            "close":  price,
            "volume": vol,
        })

    df = pd.DataFrame(rows).sort_values("timestamp").set_index("timestamp")
    df = df[(df.index >= pd.Timestamp(DATE_FROM)) & (df.index <= pd.Timestamp(DATE_TO))]
    _time.sleep(1.2)   # CoinGecko free-tier rate limit
    return df[["open", "high", "low", "close", "volume"]].astype(float)


def _fetch_binance_ohlcv_fallback(symbol: str, pair: str) -> pd.DataFrame | None:
    """Binance via CCXT — only used if CoinGecko is unavailable."""
    try:
        import ccxt
        exchange = ccxt.binance({"enableRateLimit": True})
        since = exchange.parse8601(f"{DATE_FROM}T00:00:00Z")
        raw = exchange.fetch_ohlcv(pair, "1d", since=since, limit=200)
        if not raw:
            return None
        df = pd.DataFrame(raw, columns=["timestamp", "open", "high", "low", "close", "volume"])
        df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms", utc=True).dt.tz_localize(None)
        df = df.sort_values("timestamp").set_index("timestamp")
        df = df[(df.index >= pd.Timestamp(DATE_FROM)) & (df.index <= pd.Timestamp(DATE_TO))]
        return df[["open", "high", "low", "close", "volume"]].astype(float)
    except Exception as e:
        logger.debug("{}: Binance fallback failed — {}", symbol, e)
        return None


def _fetch_crypto_ohlcv(symbol: str, cg_id: str, pair: str) -> pd.DataFrame | None:
    """CoinGecko primary (matches live ingestion), Binance last-resort fallback."""
    df = _fetch_coingecko_ohlcv(cg_id)
    if df is not None and not df.empty:
        return df
    logger.debug("{}: CoinGecko miss — falling back to Binance", symbol)
    return _fetch_binance_ohlcv_fallback(symbol, pair)


# ─── Indicator computation ────────────────────────────────────────────────────

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
        m = [c for c in df.columns if c.startswith(prefix.lower())]
        return m[0] if m else None

    df["_rsi"]       = df.get(_find("rsi_"))
    df["_macd_line"] = df.get(_find("macd_"))
    df["_macd_sig"]  = df.get(_find("macds_"))
    df["_macd_hist"] = df.get(_find("macdh_"))

    return df


# ─── Signal generation ────────────────────────────────────────────────────────

def _generate_signal(
    row: pd.Series, prev_row: pd.Series
) -> tuple[Literal["BUY", "SELL", "HOLD"], int]:
    """
    MACD-crossover-first signal generator. Long-only in bull regime.

    Core philosophy:
    - The ONLY high-quality entry signal is a MACD bullish crossover (histogram neg→pos).
    - RSI is a FILTER, not a signal generator. Don't enter overbought (>60).
    - RSI oversold (<35) BOOSTS conviction on crossover entries.
    - SMA50 confirms trend direction — above = green light, below = caution.
    - Volume spike confirms institutional participation.
    - No short selling — in a bull market, shorts bleed you dry.
    """
    rsi       = row.get("_rsi")
    macd_hist = row.get("_macd_hist")
    prev_hist = prev_row.get("_macd_hist") if prev_row is not None else None
    vol_ratio = row.get("volume_ratio")
    sma50_pct = row.get("price_vs_sma50")
    change_1d = row.get("change_1d")

    # ── Gate: MACD crossover is REQUIRED for entry ───────────────────────────
    # No crossover = no trade. This is the single most important filter.
    has_bullish_crossover = (
        pd.notna(macd_hist) and pd.notna(prev_hist)
        and prev_hist < 0 and macd_hist > 0
    )
    has_bearish_crossover = (
        pd.notna(macd_hist) and pd.notna(prev_hist)
        and prev_hist > 0 and macd_hist < 0
    )

    if not has_bullish_crossover and not has_bearish_crossover:
        return "HOLD", 50

    # ── Long-only mode: skip all SELL signals ────────────────────────────────
    if LONG_ONLY and has_bearish_crossover and not has_bullish_crossover:
        return "HOLD", 50

    if has_bullish_crossover:
        direction: Literal["BUY", "SELL", "HOLD"] = "BUY"
    else:
        direction = "SELL"

    # ── Build confidence from confluence ─────────────────────────────────────
    confidence = 55  # base: crossover alone is decent

    # RSI filter: don't buy overbought
    if direction == "BUY" and pd.notna(rsi):
        if rsi > RSI_ENTRY_MAX:
            return "HOLD", 50  # already extended, crossover is late
        if rsi < RSI_OVERSOLD_BOOST:
            confidence += 20   # oversold + crossover = best setup
        elif rsi < 50:
            confidence += 10   # RSI has room to run

    # SMA50 trend alignment
    if pd.notna(sma50_pct):
        if direction == "BUY":
            if sma50_pct > 0:    confidence += 10   # uptrend confirmation
            elif sma50_pct < -8: confidence -= 10   # deep downtrend, risky entry
        elif direction == "SELL":
            if sma50_pct < 0:    confidence += 10
            elif sma50_pct > 5:  return "HOLD", 50  # don't short uptrends

    # Volume confirmation
    if pd.notna(vol_ratio) and vol_ratio > VOLUME_CONFIRM:
        confidence += 10   # institutional participation

    # ── Circuit breaker ──────────────────────────────────────────────────────
    if pd.notna(change_1d):
        if abs(change_1d) >= CIRCUIT_BREAKER:
            return "HOLD", min(confidence, 45)

    confidence = min(confidence, 100)

    if confidence < MIN_CONFIDENCE:
        return "HOLD", confidence

    return direction, confidence


# ─── Outcome evaluation ───────────────────────────────────────────────────────

def _evaluate_outcome(
    direction: str, signal_price: float, future_price: float | None
) -> tuple[Literal["WIN", "LOSS", "HOLD", "PENDING"], float | None]:
    if direction == "HOLD" or future_price is None:
        return "HOLD", None
    fwd = (future_price - signal_price) / signal_price * 100
    if direction == "BUY":
        outcome = "WIN" if fwd > 0 else "LOSS"
    else:
        outcome = "WIN" if fwd < 0 else "LOSS"
        fwd = -fwd
    return outcome, round(fwd, 4)


# ─── Per-ticker backtest ──────────────────────────────────────────────────────

def _backtest_ticker(
    ticker: str,
    asset_class: Literal["stock", "crypto"],
    df: pd.DataFrame,
) -> tuple[list[SignalRecord], TickerStats]:
    df = _compute_indicators(df)
    records: list[SignalRecord] = []
    stats = TickerStats(ticker=ticker, asset_class=asset_class)

    start_idx = 51
    end_idx   = len(df) - HOLD_DAYS
    if end_idx <= start_idx:
        logger.warning("{}: not enough data ({} bars)", ticker, len(df))
        return [], stats

    last_signal_bar = -SIGNAL_COOLDOWN_BARS  # allow first signal immediately

    for i in range(start_idx, end_idx):
        row      = df.iloc[i]
        prev_row = df.iloc[i - 1]
        direction, confidence = _generate_signal(row, prev_row)

        # Per-ticker cooldown: suppress signals within SIGNAL_COOLDOWN_BARS of last one.
        # Prevents re-entering the same setup 5 days in a row when the first one already failed.
        if direction != "HOLD" and (i - last_signal_bar) < SIGNAL_COOLDOWN_BARS:
            direction  = "HOLD"
            confidence = min(confidence, 55)
        elif direction != "HOLD":
            last_signal_bar = i

        signal_price = float(row["close"])

        # Trailing stop evaluation: check each bar in the hold period.
        # Exit at the trailing stop if price drops 5% from peak, otherwise
        # exit at HOLD_DAYS.
        exit_price = float(df.iloc[i + HOLD_DAYS]["close"])  # default: end of hold
        if direction == "BUY":
            peak = signal_price
            for k in range(1, HOLD_DAYS + 1):
                if i + k >= len(df):
                    break
                bar_close = float(df.iloc[i + k]["close"])
                peak = max(peak, bar_close)
                drop_from_peak = (peak - bar_close) / peak * 100
                if drop_from_peak >= TRAILING_STOP_PCT:
                    exit_price = bar_close
                    break
            else:
                exit_price = float(df.iloc[i + HOLD_DAYS]["close"])

        future_price = exit_price
        outcome, fwd_return = _evaluate_outcome(direction, signal_price, future_price)

        circuit_fired = (
            pd.notna(row.get("change_1d")) and (
                abs(float(row["change_1d"])) >= CIRCUIT_BREAKER
            )
        ) and direction == "HOLD" and confidence <= 45

        rec = SignalRecord(
            ticker=ticker,
            asset_class=asset_class,
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
        if direction == "BUY":    stats.buys += 1
        elif direction == "SELL": stats.sells += 1
        else:                     stats.holds += 1

        if outcome == "WIN":
            stats.wins += 1
            if fwd_return is not None: stats.returns.append(fwd_return)
        elif outcome == "LOSS":
            stats.losses += 1
            if fwd_return is not None: stats.returns.append(fwd_return)

    return records, stats


# ─── Paper trading simulation ─────────────────────────────────────────────────

def _run_paper_sim(all_records: list[SignalRecord]) -> dict:
    """
    Chronological simulation starting with INITIAL_CAPITAL.
    Only actionable signals (BUY / SELL). Position size = 10% of portfolio.
    Exit after HOLD_DAYS trading days (using the recorded forward return).
    Short selling is included (SELL signals = short position).
    """
    # Sort by date — only high-conviction actionable signals make it to paper trading.
    # PAPER_MIN_CONFIDENCE > MIN_CONFIDENCE means we surface setups, not every blip.
    signals = sorted(
        [r for r in all_records
         if r.direction != "HOLD"
         and r.forward_return_5d is not None
         and r.confidence >= PAPER_MIN_CONFIDENCE],
        key=lambda r: r.date,
    )

    portfolio  = INITIAL_CAPITAL
    peak       = INITIAL_CAPITAL
    max_dd     = 0.0
    open_pos: list[dict] = []   # {exit_date, pnl_pct, direction, invested}
    completed: list[Trade] = []

    # We'll process day-by-day using the signal dates
    all_dates = sorted({r.date for r in signals})

    for today in all_dates:
        # Close positions that exit on or before today
        still_open = []
        for pos in open_pos:
            if pos["exit_date"] <= today:
                pnl_pct = pos["pnl_pct"]
                invested = pos["invested"]
                pnl = invested * pnl_pct / 100
                portfolio += invested + pnl
                peak = max(peak, portfolio)
                drawdown = (peak - portfolio) / peak * 100
                max_dd = max(max_dd, drawdown)
                completed.append(Trade(
                    ticker=pos["ticker"],
                    asset_class=pos["asset_class"],
                    direction=pos["direction"],
                    entry_date=pos["entry_date"],
                    exit_date=pos["exit_date"],
                    entry_price=pos["entry_price"],
                    exit_price=pos["exit_price"],
                    invested=invested,
                    pnl=round(pnl, 2),
                    return_pct=round(pnl_pct, 2),
                    outcome="WIN" if pnl > 0 else "LOSS",
                ))
            else:
                still_open.append(pos)
        open_pos = still_open

        # Open new positions from today's signals
        todays = [r for r in signals if r.date == today]
        # Sort by confidence descending — highest conviction first
        todays.sort(key=lambda r: r.confidence, reverse=True)

        for sig in todays:
            if len(open_pos) >= MAX_POSITIONS:
                break
            # Don't double-dip same ticker
            if any(p["ticker"] == sig.ticker for p in open_pos):
                continue

            invest = portfolio * POSITION_SIZE_PCT
            if invest < 1:
                continue

            portfolio -= invest  # capital locked in position

            # For SELL (short): win means price went down, fwd_return already flipped positive
            pnl_pct = sig.forward_return_5d  # already sign-corrected in _evaluate_outcome

            # Approximate exit date (10 trading days ≈ 14 calendar days)
            from datetime import datetime, timedelta
            entry_dt = datetime.strptime(sig.date, "%Y-%m-%d")
            exit_dt  = entry_dt + timedelta(days=14)
            exit_date = exit_dt.strftime("%Y-%m-%d")

            exit_price = sig.price * (1 + (sig.forward_return_5d or 0) / 100) if sig.direction == "BUY" \
                         else sig.price * (1 - (sig.forward_return_5d or 0) / 100)

            open_pos.append({
                "ticker":      sig.ticker,
                "asset_class": sig.asset_class,
                "direction":   sig.direction,
                "entry_date":  sig.date,
                "exit_date":   exit_date,
                "entry_price": sig.price,
                "exit_price":  round(exit_price, 4),
                "invested":    invest,
                "pnl_pct":     pnl_pct or 0.0,
            })

    # Close any remaining open positions at last known return
    for pos in open_pos:
        pnl_pct = pos["pnl_pct"]
        invested = pos["invested"]
        pnl = invested * pnl_pct / 100
        portfolio += invested + pnl
        completed.append(Trade(
            ticker=pos["ticker"],
            asset_class=pos["asset_class"],
            direction=pos["direction"],
            entry_date=pos["entry_date"],
            exit_date=pos["exit_date"],
            entry_price=pos["entry_price"],
            exit_price=pos["exit_price"],
            invested=invested,
            pnl=round(pnl, 2),
            return_pct=round(pnl_pct, 2),
            outcome="WIN" if pnl > 0 else "LOSS",
        ))

    final   = round(portfolio, 2)
    total_r = round((final - INITIAL_CAPITAL) / INITIAL_CAPITAL * 100, 2)
    wins    = [t for t in completed if t.outcome == "WIN"]
    losses  = [t for t in completed if t.outcome == "LOSS"]
    best    = sorted(completed, key=lambda t: t.return_pct, reverse=True)[:5]
    worst   = sorted(completed, key=lambda t: t.return_pct)[:5]

    buy_trades  = [t for t in completed if t.direction == "BUY"]
    sell_trades = [t for t in completed if t.direction == "SELL"]
    buy_wins    = [t for t in buy_trades  if t.outcome == "WIN"]
    sell_wins   = [t for t in sell_trades if t.outcome == "WIN"]

    def _safe_wr(wins_list: list, total_list: list) -> float | None:
        return round(len(wins_list) / len(total_list) * 100, 1) if total_list else None

    def _safe_avg(trades: list) -> float | None:
        return round(sum(t.return_pct for t in trades) / len(trades), 2) if trades else None

    return {
        "starting_capital": INITIAL_CAPITAL,
        "final_portfolio":  final,
        "total_return_pct": total_r,
        "total_pnl":        round(final - INITIAL_CAPITAL, 2),
        "max_drawdown_pct": round(max_dd, 2),
        "trades_taken":     len(completed),
        "wins":             len(wins),
        "losses":           len(losses),
        "paper_win_rate":   round(len(wins) / len(completed) * 100, 1) if completed else 0,
        "by_direction": {
            "BUY":  {
                "trades":    len(buy_trades),
                "wins":      len(buy_wins),
                "win_rate":  _safe_wr(buy_wins, buy_trades),
                "avg_return": _safe_avg(buy_trades),
            },
            "SELL": {
                "trades":    len(sell_trades),
                "wins":      len(sell_wins),
                "win_rate":  _safe_wr(sell_wins, sell_trades),
                "avg_return": _safe_avg(sell_trades),
            },
        },
        "best_trades": [
            {"ticker": t.ticker, "direction": t.direction, "date": t.entry_date,
             "return_pct": t.return_pct, "pnl": t.pnl}
            for t in best
        ],
        "worst_trades": [
            {"ticker": t.ticker, "direction": t.direction, "date": t.entry_date,
             "return_pct": t.return_pct, "pnl": t.pnl}
            for t in worst
        ],
    }


# ─── Aggregate statistics ─────────────────────────────────────────────────────

def _aggregate(
    all_stats: list[TickerStats], all_records: list[SignalRecord]
) -> dict:
    total_signals = sum(s.total for s in all_stats)
    total_buys    = sum(s.buys for s in all_stats)
    total_sells   = sum(s.sells for s in all_stats)
    total_holds   = sum(s.holds for s in all_stats)
    total_wins    = sum(s.wins for s in all_stats)
    total_losses  = sum(s.losses for s in all_stats)
    all_returns   = [r for s in all_stats for r in s.returns]

    actionable = total_buys + total_sells
    win_rate   = total_wins / actionable if actionable else 0

    avg_return = float(np.mean(all_returns)) if all_returns else 0.0
    sharpe: float | None = None
    if len(all_returns) >= 2:
        r   = np.array(all_returns)
        std = r.std(ddof=1)
        sharpe = float(r.mean() / std * np.sqrt(252 / HOLD_DAYS)) if std > 0 else None

    sorted_rec = sorted(
        [r for r in all_records if r.forward_return_5d is not None],
        key=lambda r: r.forward_return_5d or 0,
    )
    best  = sorted_rec[-10:][::-1]
    worst = sorted_rec[:10]

    buy_wins  = sum(1 for r in all_records if r.direction == "BUY"  and r.outcome == "WIN")
    sell_wins = sum(1 for r in all_records if r.direction == "SELL" and r.outcome == "WIN")
    buy_wr    = buy_wins  / total_buys  if total_buys  else None
    sell_wr   = sell_wins / total_sells if total_sells else None

    crypto_set = set(CRYPTO_IDS)

    def _group(stats_list: list[TickerStats]) -> dict:
        g_wins = sum(s.wins for s in stats_list)
        g_act  = sum(s.actionable for s in stats_list)
        g_rets = [r for s in stats_list for r in s.returns]
        return {
            "actionable": g_act,
            "win_rate":   round(g_wins / g_act * 100, 1) if g_act else None,
            "avg_return": round(float(np.mean(g_rets)), 3) if g_rets else None,
        }

    return {
        "date_range":           f"{DATE_FROM} → {DATE_TO}",
        "total_bars_evaluated": total_signals,
        "actionable_signals":   actionable,
        "buys":       total_buys,
        "sells":      total_sells,
        "holds":      total_holds,
        "wins":       total_wins,
        "losses":     total_losses,
        "win_rate":   round(win_rate * 100, 1),
        "buy_win_rate":  round(buy_wr  * 100, 1) if buy_wr  is not None else None,
        "sell_win_rate": round(sell_wr * 100, 1) if sell_wr is not None else None,
        "avg_return_pct": round(avg_return, 3),
        "sharpe_ratio":   round(sharpe, 3) if sharpe is not None else None,
        "by_asset_class": {
            "stocks": _group([s for s in all_stats if s.asset_class == "stock"]),
            "crypto": _group([s for s in all_stats if s.asset_class == "crypto"]),
        },
        "best_individual_signals": [
            {"ticker": r.ticker, "date": r.date, "direction": r.direction,
             "return_pct": r.forward_return_5d, "asset_class": r.asset_class}
            for r in best
        ],
        "worst_individual_signals": [
            {"ticker": r.ticker, "date": r.date, "direction": r.direction,
             "return_pct": r.forward_return_5d, "asset_class": r.asset_class}
            for r in worst
        ],
        "per_ticker": [
            {
                "ticker":      s.ticker,
                "asset_class": s.asset_class,
                "signals":     s.actionable,
                "win_rate":    round(s.win_rate * 100, 1) if s.win_rate is not None else None,
                "avg_return":  round(s.avg_return_pct, 3) if s.avg_return_pct is not None else None,
                "sharpe":      round(s.sharpe, 3) if s.sharpe is not None else None,
            }
            for s in sorted(all_stats, key=lambda s: s.win_rate or 0, reverse=True)
            if s.actionable > 0
        ],
    }


# ─── CSV export ───────────────────────────────────────────────────────────────

def _export_csv(records: list[SignalRecord], path: str) -> None:
    rows = [
        {
            "ticker": r.ticker, "asset_class": r.asset_class, "date": r.date,
            "direction": r.direction, "confidence": r.confidence, "price": r.price,
            "rsi": r.rsi, "macd_hist": r.macd_hist, "vol_ratio": r.vol_ratio,
            "change_1d": r.change_1d, "circuit_breaker": r.circuit_breaker_fired,
            "forward_return_5d": r.forward_return_5d, "outcome": r.outcome,
        }
        for r in records
    ]
    pd.DataFrame(rows).to_csv(path, index=False)
    logger.info("Signal log → {}", path)


# ─── Supabase writer ──────────────────────────────────────────────────────────

def _write_to_supabase(records: list[SignalRecord]) -> int:
    try:
        from supabase_client import supabase
    except ImportError:
        logger.warning("supabase_client not available — skipping DB write")
        return 0

    rows = [
        {
            "asset_type":      r.asset_class,
            "identifier":      r.ticker,
            "direction":       r.direction,
            "confidence":      r.confidence,
            "reasoning":       (
                f"[Backtest {r.date}] RSI={r.rsi:.1f}, MACD_hist={r.macd_hist:.4f}"
                if r.rsi and r.macd_hist else f"[Backtest {r.date}]"
            ),
            "time_horizon":    "swing",
            "price_at_signal": r.price,
            "is_backtest":     True,
            "outcome":         r.outcome,
            "news_context":    [],
        }
        for r in records
        if r.direction != "HOLD"
    ]

    inserted = 0
    for i in range(0, len(rows), 100):
        batch = rows[i:i + 100]
        try:
            supabase.table("signals").insert(batch).execute()
            inserted += len(batch)
        except Exception as e:
            logger.error("Supabase batch write failed: {}", e)

    logger.info("Wrote {} backtest signals to Supabase", inserted)
    return inserted


# ─── Main ─────────────────────────────────────────────────────────────────────

def run_backtest(
    stocks:     list[str] | None = None,
    export_csv: bool = True,
    write_db:   bool = False,
    output_dir: str | None = None,
) -> dict:
    stocks     = stocks or DEFAULT_STOCKS
    output_dir = output_dir or str(Path.cwd())
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    if not FMP_KEY and not AV_KEY:
        logger.error("No data source keys set. Set FMP_API_KEY or ALPHA_VANTAGE_API_KEY.")

    all_records: list[SignalRecord] = []
    all_stats:   list[TickerStats]  = []

    logger.info("Backtest: {} stocks + {} crypto | {} → {}",
                len(stocks), len(CRYPTO_ASSETS), DATE_FROM, DATE_TO)

    # ── Stocks ────────────────────────────────────────────────────────────────
    for i, ticker in enumerate(stocks):
        logger.info("[stock {}/{}] {}", i + 1, len(stocks), ticker)
        df = _fetch_stock_ohlcv(ticker)
        if df is None or df.empty:
            logger.warning("{}: no data — skipping", ticker)
            all_stats.append(TickerStats(ticker=ticker, asset_class="stock"))
            time.sleep(0.3)
            continue
        recs, stats = _backtest_ticker(ticker, "stock", df)
        all_records.extend(recs)
        all_stats.append(stats)
        time.sleep(0.3)

    # ── Crypto ────────────────────────────────────────────────────────────────
    for j, (symbol, cg_id, pair) in enumerate(CRYPTO_ASSETS):
        logger.info("[crypto {}/{}] {}", j + 1, len(CRYPTO_ASSETS), symbol)
        df = _fetch_crypto_ohlcv(symbol, cg_id, pair)
        if df is None or df.empty:
            logger.warning("{}: no data — skipping", symbol)
            all_stats.append(TickerStats(ticker=symbol, asset_class="crypto"))
            time.sleep(0.5)
            continue
        recs, stats = _backtest_ticker(symbol, "crypto", df)
        all_records.extend(recs)
        all_stats.append(stats)
        time.sleep(0.5)

    agg = _aggregate(all_stats, all_records)

    # Paper trading sim
    paper = _run_paper_sim(all_records)
    agg["paper_trading"] = paper

    if export_csv:
        csv_path = str(Path(output_dir) / "backtest_signals.csv")
        _export_csv(all_records, csv_path)
        agg["csv_path"] = csv_path

    if write_db:
        agg["db_rows_inserted"] = _write_to_supabase(all_records)

    json_path = str(Path(output_dir) / "backtest_results.json")
    with open(json_path, "w") as f:
        json.dump(agg, f, indent=2)
    logger.info("Results → {}", json_path)
    agg["json_path"] = json_path

    return agg


# ─── Report printer ───────────────────────────────────────────────────────────

def _print_report(agg: dict) -> None:
    sep = "─" * 64
    pt  = agg.get("paper_trading", {})

    print(f"\n{sep}")
    print("  PLEBS BACKTEST REPORT")
    print(f"  {agg.get('date_range', '')}")
    print(f"  {len(DEFAULT_STOCKS)} stocks · {len(CRYPTO_ASSETS)} crypto")
    print(sep)

    # Paper trading headline
    start = pt.get("starting_capital", INITIAL_CAPITAL)
    final = pt.get("final_portfolio", 0)
    ret   = pt.get("total_return_pct", 0)
    pnl   = pt.get("total_pnl", 0)
    print(f"\n  💰 PAPER TRADING (${start:,.0f} starting, ≥{PAPER_MIN_CONFIDENCE}% confidence only)")
    print(f"     Final portfolio : ${final:,.2f}")
    print(f"     Total return    : {ret:+.2f}%  (${pnl:+,.2f})")
    print(f"     Trades taken    : {pt.get('trades_taken', 0)}")
    print(f"     Win rate        : {pt.get('paper_win_rate', 0):.1f}%  "
          f"({pt.get('wins',0)}W / {pt.get('losses',0)}L)")
    print(f"     Max drawdown    : -{pt.get('max_drawdown_pct', 0):.2f}%")
    by_dir = pt.get("by_direction", {})
    if by_dir:
        for d, s in by_dir.items():
            wr  = f"{s['win_rate']:.1f}%" if s.get("win_rate") is not None else "N/A"
            avg = f"{s['avg_return']:+.2f}%" if s.get("avg_return") is not None else "N/A"
            print(f"     {d:4s} trades     : {s['trades']:3d}  wr={wr}  avg={avg}")

    print(f"\n{sep}")
    print(f"  SIGNAL ACCURACY  (raw signals, all tickers)")
    print(f"  Actionable signals : {agg['actionable_signals']:,}")
    print(f"  Overall win rate   : {agg['win_rate']}%")
    if agg.get("buy_win_rate") is not None:
        print(f"  BUY win rate       : {agg['buy_win_rate']}%")
    if agg.get("sell_win_rate") is not None:
        print(f"  SELL win rate      : {agg['sell_win_rate']}%")
    print(f"  Avg return/signal  : {agg['avg_return_pct']:+.3f}%")
    if agg.get("sharpe_ratio") is not None:
        print(f"  Sharpe ratio       : {agg['sharpe_ratio']:.3f} (annualized)")

    by = agg.get("by_asset_class", {})
    if by:
        print(f"\n  ── By asset class ──")
        for cls, s in by.items():
            wr = f"{s['win_rate']:.1f}%" if s.get("win_rate") is not None else "N/A"
            ar = f"{s['avg_return']:+.3f}%" if s.get("avg_return") is not None else "N/A"
            print(f"  {cls.upper():8s}  signals={s['actionable']:5,}  wr={wr:6s}  avg={ar}")

    print(f"\n{sep}")
    print("  BEST PAPER TRADES")
    for t in pt.get("best_trades", []):
        print(f"  {t['ticker']:8s}  {t['date']}  {t['direction']:4s}  "
              f"{t['return_pct']:+.2f}%  (${t['pnl']:+.2f})")
    print(f"\n  WORST PAPER TRADES")
    for t in pt.get("worst_trades", []):
        print(f"  {t['ticker']:8s}  {t['date']}  {t['direction']:4s}  "
              f"{t['return_pct']:+.2f}%  (${t['pnl']:+.2f})")

    print(f"\n{sep}")
    print("  WIN RATE BY TICKER  (top 20)")
    for s in agg.get("per_ticker", [])[:20]:
        wr  = f"{s['win_rate']:.1f}%" if s["win_rate"] is not None else "  N/A "
        ar  = f"{s['avg_return']:+.2f}%" if s["avg_return"] is not None else "  N/A "
        cls = "crypto" if s["asset_class"] == "crypto" else "stock "
        print(f"  [{cls}] {s['ticker']:8s}  sigs={s['signals']:3d}  wr={wr}  avg={ar}")
    print(sep)

    if agg.get("csv_path"):
        print(f"\n  Signals log  → {agg['csv_path']}")
    if agg.get("json_path"):
        print(f"  Full results → {agg['json_path']}")
    print()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Plebs backtest — Feb→Jun 2026")
    parser.add_argument("--stocks",    nargs="*", help="Override stock ticker list")
    parser.add_argument("--write-db",  action="store_true", help="Write signals to Supabase")
    parser.add_argument("--no-csv",    action="store_true", help="Skip CSV export")
    parser.add_argument("--output-dir", default=".", help="Output directory")
    args = parser.parse_args()

    agg = run_backtest(
        stocks=args.stocks,
        export_csv=not args.no_csv,
        write_db=args.write_db,
        output_dir=args.output_dir,
    )
    _print_report(agg)
