"""
Crypto ingestion — Alpaca (primary OHLCV) + CoinGecko (market data + fallback) +
Messari (enrichment) + CCXT/Binance (OHLCV fallback) + Fear & Greed + Finnhub news.
Runs every 60 minutes all hours via scheduler.
"""

import os
import time
from datetime import datetime, timezone

import ccxt
import httpx
import numpy as np
import pandas as pd
import pandas_ta_classic as ta
import sentry_sdk
from loguru import logger
from dotenv import load_dotenv

from supabase_client import supabase
from ingestion.trusted_sources import is_trusted_source
from ingestion.alpaca_client import fetch_crypto_bars
from ingestion.crypto_news import ingest_crypto_news_rss

load_dotenv()

FINNHUB_KEY    = os.environ.get("FINNHUB_API_KEY", "")
COINGECKO_KEY  = os.environ.get("COINGECKO_API_KEY", "")
MESSARI_KEY    = os.environ.get("MESSARI_API_KEY", "")

COINGECKO_URL  = "https://api.coingecko.com/api/v3/coins/markets"
MESSARI_URL    = "https://data.messari.io/api/v1/assets"
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

def _coingecko_headers() -> dict:
    """Return auth headers if Demo API key is set, empty dict otherwise."""
    if COINGECKO_KEY:
        return {"x-cg-demo-api-key": COINGECKO_KEY}
    return {}


def _fetch_coingecko_markets() -> list[dict]:
    """Fetch top 100 coins by market cap. Uses Demo key if available."""
    all_coins: list[dict] = []
    headers = _coingecko_headers()

    if COINGECKO_KEY:
        logger.debug("CoinGecko: using Demo API key")
    else:
        logger.warning("COINGECKO_API_KEY not set — using keyless tier (rate limits apply)")

    with httpx.Client(timeout=REQUEST_TIMEOUT, headers=headers) as client:
        for page in (1, 2):
            try:
                resp = client.get(
                    COINGECKO_URL,
                    params={
                        "vs_currency":             "usd",
                        "order":                   "market_cap_desc",
                        "per_page":                50,
                        "page":                    page,
                        "sparkline":               "false",
                        "price_change_percentage": "24h",
                    },
                )
                resp.raise_for_status()
                all_coins.extend(resp.json())
                time.sleep(COINGECKO_DELAY)
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 429:
                    logger.warning("CoinGecko 429 on page {} — backing off 60s", page)
                    time.sleep(60)
                    try:
                        resp = client.get(e.request.url)
                        resp.raise_for_status()
                        all_coins.extend(resp.json())
                    except Exception as retry_e:
                        logger.error("CoinGecko retry failed: {}", retry_e)
                else:
                    logger.warning("CoinGecko page {} error: {}", page, e)
                break
            except Exception as e:
                logger.warning("CoinGecko page {} fetch error: {}", page, e)
                break

    logger.info("CoinGecko: fetched {} coins", len(all_coins))
    return all_coins


def _coingecko_to_symbol(coin: dict) -> str:
    return coin.get("symbol", "").upper()


# ─── Messari enrichment ───────────────────────────────────────────────────────

# CoinGecko symbol → Messari slug
_MESSARI_SLUGS: dict[str, str] = {
    "BTC": "bitcoin", "ETH": "ethereum", "SOL": "solana", "BNB": "binancecoin",
    "XRP": "xrp", "ADA": "cardano", "DOGE": "dogecoin", "AVAX": "avalanche",
    "LINK": "chainlink", "DOT": "polkadot", "MATIC": "polygon", "UNI": "uniswap",
    "LTC": "litecoin", "ATOM": "cosmos", "PEPE": "pepe", "SHIB": "shiba-inu",
    "APT": "aptos", "SUI": "sui",
}


def _fetch_messari_metrics(symbol: str) -> dict | None:
    """
    Fetch Messari asset metrics — developer activity, token supply, ROI.
    Returns a dict of extra metadata to merge into the coin record.
    Messari free tier works without a key; key increases rate limits.
    """
    slug = _MESSARI_SLUGS.get(symbol.upper())
    if not slug:
        return None

    headers: dict = {}
    if MESSARI_KEY:
        headers["x-messari-api-key"] = MESSARI_KEY

    try:
        with httpx.Client(timeout=REQUEST_TIMEOUT, headers=headers) as client:
            resp = client.get(f"{MESSARI_URL}/{slug}/metrics")
            if resp.status_code == 429:
                logger.debug("Messari rate limit hit for {}", symbol)
                return None
            resp.raise_for_status()
            data = resp.json().get("data", {})
    except Exception as e:
        logger.debug("{}: Messari fetch failed — {}", symbol, e)
        return None

    market = data.get("market_data", {})
    supply = data.get("supply", {})
    roi    = data.get("roi_data", {})
    dev    = data.get("developer_activity", {})

    return {
        "messari_real_volume_24h":    market.get("real_volume_last_24_hours"),
        "messari_liquid_supply_pct":  supply.get("liquid") and supply.get("max") and
                                      round(supply["liquid"] / supply["max"] * 100, 2),
        "messari_roi_30d":            roi.get("percent_change_last_1_month"),
        "messari_roi_90d":            roi.get("percent_change_last_3_months"),
        "messari_dev_commits_30d":    dev.get("commit_count_30_days"),
    }


# ─── CCXT / Binance OHLCV ────────────────────────────────────────────────────

_binance = ccxt.binance({"enableRateLimit": True})
_kraken  = ccxt.kraken({"enableRateLimit": True})

# Finnhub uses its own crypto symbol format: BINANCE:BTCUSDT
_FINNHUB_CRYPTO_SYMBOLS: dict[str, str] = {
    "BTC": "BINANCE:BTCUSDT", "ETH": "BINANCE:ETHUSDT",
    "SOL": "BINANCE:SOLUSDT", "BNB": "BINANCE:BNBUSDT",
    "XRP": "BINANCE:XRPUSDT", "DOGE": "BINANCE:DOGEUSDT",
    "ADA": "BINANCE:ADAUSDT", "AVAX": "BINANCE:AVAXUSDT",
    "LINK": "BINANCE:LINKUSDT", "DOT": "BINANCE:DOTUSDT",
    "MATIC": "BINANCE:MATICUSDT", "UNI": "BINANCE:UNIUSDT",
    "LTC": "BINANCE:LTCUSDT", "ATOM": "BINANCE:ATOMUSDT",
}

# Kraken uses different pair names for some coins
_KRAKEN_PAIR_MAP: dict[str, str] = {
    "BTC": "BTC/USD", "ETH": "ETH/USD", "SOL": "SOL/USD",
    "XRP": "XRP/USD", "DOGE": "DOGE/USD", "ADA": "ADA/USD",
    "AVAX": "AVAX/USD", "LINK": "LINK/USD", "DOT": "DOT/USD",
    "LTC": "LTC/USD", "ATOM": "ATOM/USD", "UNI": "UNI/USD",
}

# CoinGecko symbol → CoinGecko ID for /ohlc endpoint
_CG_IDS: dict[str, str] = {
    "BTC": "bitcoin", "ETH": "ethereum", "SOL": "solana",
    "BNB": "binancecoin", "XRP": "ripple", "DOGE": "dogecoin",
    "ADA": "cardano", "AVAX": "avalanche-2", "LINK": "chainlink",
    "DOT": "polkadot", "MATIC": "matic-network", "UNI": "uniswap",
    "LTC": "litecoin", "ATOM": "cosmos", "PEPE": "pepe",
    "SHIB": "shiba-inu", "APT": "aptos", "SUI": "sui",
    "NEAR": "near", "ARB": "arbitrum", "OP": "optimism",
}


def _fetch_ohlcv_binance(symbol: str) -> pd.DataFrame | None:
    """Binance via CCXT — 1h resolution, 7 days."""
    pair = CCXT_SYMBOL_MAP.get(symbol, f"{symbol}/USDT")
    try:
        raw = _binance.fetch_ohlcv(pair, timeframe="1h", limit=168)
        if not raw:
            return None
        df = pd.DataFrame(raw, columns=["timestamp", "open", "high", "low", "close", "volume"])
        df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms", utc=True)
        df = df.set_index("timestamp").astype(float)
        return df
    except Exception as e:
        logger.debug("{}: Binance OHLCV failed — {}", symbol, e)
        return None


def _fetch_ohlcv_kraken(symbol: str) -> pd.DataFrame | None:
    """Kraken via CCXT — 1h resolution, 7 days. No API key needed."""
    pair = _KRAKEN_PAIR_MAP.get(symbol)
    if not pair:
        return None
    try:
        raw = _kraken.fetch_ohlcv(pair, timeframe="1h", limit=168)
        if not raw:
            return None
        df = pd.DataFrame(raw, columns=["timestamp", "open", "high", "low", "close", "volume"])
        df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms", utc=True)
        df = df.set_index("timestamp").astype(float)
        return df
    except Exception as e:
        logger.debug("{}: Kraken OHLCV failed — {}", symbol, e)
        return None


def _fetch_ohlcv_finnhub_crypto(symbol: str) -> pd.DataFrame | None:
    """Finnhub crypto candles — 1h resolution, 7 days."""
    if not FINNHUB_KEY:
        return None
    fh_symbol = _FINNHUB_CRYPTO_SYMBOLS.get(symbol.upper())
    if not fh_symbol:
        return None
    try:
        import time as _time
        end   = int(_time.time())
        start = end - 7 * 24 * 3600
        resp = httpx.get(
            "https://finnhub.io/api/v1/crypto/candle",
            params={"symbol": fh_symbol, "resolution": "60",
                    "from": start, "to": end, "token": FINNHUB_KEY},
            timeout=REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
        if data.get("s") != "ok" or not data.get("t"):
            return None
        df = pd.DataFrame({
            "timestamp": pd.to_datetime(data["t"], unit="s", utc=True),
            "open": data["o"], "high": data["h"],
            "low":  data["l"], "close": data["c"], "volume": data["v"],
        }).set_index("timestamp").sort_index()
        return df
    except Exception as e:
        logger.debug("{}: Finnhub crypto candle failed — {}", symbol, e)
        return None


def _fetch_ohlcv_coingecko(symbol: str) -> pd.DataFrame | None:
    """CoinGecko /ohlc — daily resolution fallback. Free tier gives 4-day candles
    for 7d+ lookback but still useful as last resort for price data."""
    cg_id = _CG_IDS.get(symbol.upper())
    if not cg_id:
        return None
    try:
        headers = _coingecko_headers()
        resp = httpx.get(
            f"https://api.coingecko.com/api/v3/coins/{cg_id}/ohlc",
            params={"vs_currency": "usd", "days": "7"},
            headers=headers,
            timeout=REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
        if not data:
            return None
        df = pd.DataFrame(data, columns=["timestamp", "open", "high", "low", "close"])
        df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms", utc=True)
        df["volume"] = 0.0
        df = df.set_index("timestamp").sort_index().astype(float)
        return df
    except Exception as e:
        logger.debug("{}: CoinGecko OHLC failed — {}", symbol, e)
        return None


def _fetch_ohlcv_alpaca(symbol: str) -> pd.DataFrame | None:
    """Alpaca crypto bars — primary source."""
    df = fetch_crypto_bars(symbol, days=90)
    if df is None:
        return None
    df.index = df.index.tz_localize(None) if df.index.tz is None else df.index.tz_convert("UTC").tz_localize(None)
    return df


def _fetch_ohlcv(symbol: str) -> pd.DataFrame | None:
    """Fetch from ALL sources, merge into one DataFrame for best coverage.
    Alpaca is primary; exchanges and CoinGecko fill gaps."""
    sources = [
        ("Alpaca",        _fetch_ohlcv_alpaca),
        ("Binance",       _fetch_ohlcv_binance),
        ("Kraken",        _fetch_ohlcv_kraken),
        ("Finnhub",       _fetch_ohlcv_finnhub_crypto),
        ("CoinGecko",     _fetch_ohlcv_coingecko),
    ]
    frames: list[pd.DataFrame] = []
    for name, fn in sources:
        try:
            df = fn(symbol)
            if df is not None and not df.empty:
                df.columns = [c.lower() for c in df.columns]
                logger.debug("{}: {} returned {} rows", symbol, name, len(df))
                frames.append(df[["open", "high", "low", "close", "volume"]])
            else:
                logger.debug("{}: {} — no data", symbol, name)
        except Exception as e:
            logger.debug("{}: {} — error: {}", symbol, name, e)

    if not frames:
        logger.warning("{}: ALL crypto sources returned no data", symbol)
        return None

    for i, f in enumerate(frames):
        if f.index.tz is not None:
            frames[i] = f.set_index(f.index.tz_convert("UTC").tz_localize(None))

    merged = frames[0]
    for extra in frames[1:]:
        new_ts = extra.index.difference(merged.index)
        if len(new_ts) > 0:
            merged = pd.concat([merged, extra.loc[new_ts]]).sort_index()
            logger.debug("{}: filled {} gap timestamps from additional source", symbol, len(new_ts))

    logger.info("{}: merged OHLCV — {} rows from {} sources", symbol, len(merged), len(frames))
    return merged


# ─── Technical indicators ─────────────────────────────────────────────────────

def _compute_crypto_indicators(df: pd.DataFrame) -> dict:
    df = df.copy()

    # RSI 14
    df.ta.rsi(length=14, append=True)

    # MACD (12, 26, 9)
    df.ta.macd(fast=12, slow=26, signal=9, append=True)

    # ATR 14 — volatility-adaptive stop input. Stocks have carried this since
    # day one; crypto never did, so crypto stops fell back to a flat default.
    # Computed on the same (1h) candles the rest of these indicators use.
    df.ta.atr(length=14, append=True)

    # Volume anomaly — ratio vs 7-day (168h) average
    volume_avg = df["volume"].mean()
    latest_vol = float(df["volume"].iloc[-1])
    volume_ratio = round(latest_vol / volume_avg, 2) if volume_avg else None

    latest = df.iloc[-1]
    prev   = df.iloc[-2] if len(df) >= 2 else None

    def _col(prefix: str) -> float | None:
        match = [c for c in df.columns if c.lower().startswith(prefix.lower())]
        val = latest[match[0]] if match else None
        return float(val) if val is not None and not np.isnan(val) else None

    def _prev_col(prefix: str) -> float | None:
        if prev is None:
            return None
        match = [c for c in df.columns if c.lower().startswith(prefix.lower())]
        val = prev[match[0]] if match else None
        return float(val) if val is not None and not np.isnan(val) else None

    return {
        "rsi_14":       _col("rsi_"),
        "macd_line":    _col("macd_"),
        "macd_signal":  _col("macds_"),
        "macd_hist":    _col("macdh_"),
        # Needed by the BTC regime gate (bearish = negative AND deepening
        # vs previous bar) and crypto prompt's crossover callouts — stocks
        # have carried this since day one, crypto never did, which made the
        # BTC regime gate unable to ever fire.
        "prev_macd_hist": _prev_col("macdh_"),
        "atr_14":       _col("atr"),       # feeds the risk engine's 1.5x-ATR stop
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
        for a in articles[:15]
        if a.get("headline") and is_trusted_source(a.get("source", ""))
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

    ohlcv_sources: list[str] = []

    # Enrich with multi-source OHLCV + Pandas-TA indicators
    df = _fetch_ohlcv(symbol)
    if df is not None:
        try:
            indicators = _compute_crypto_indicators(df)
            record["metadata"].update(indicators)
            ohlcv_sources.append("ohlcv_merged")

            # If CoinGecko spot price is missing, use latest OHLCV close
            if record["price"] is None and indicators.get("close"):
                record["price"] = indicators["close"]
                record["metadata"]["price_source"] = "ohlcv_fallback"
                logger.info("{}: CoinGecko price missing, using OHLCV close: {}",
                            symbol, indicators["close"])
        except Exception as e:
            logger.warning("{}: indicator computation failed — {}", symbol, e)

    # Enrich with Messari metrics (developer activity, real volume, ROI)
    messari = _fetch_messari_metrics(symbol)
    if messari:
        record["metadata"].update(messari)
        ohlcv_sources.append("messari")

    record["metadata"]["sources"] = "+".join(["coingecko"] + ohlcv_sources) if ohlcv_sources else "coingecko"

    try:
        supabase.table("raw_prices").insert(record).execute()
        return True
    except Exception as e:
        logger.error("{}: raw_prices insert failed — {}", symbol, e)
        sentry_sdk.capture_exception(e)
        return False


# ─── Main ingestion function ───────────────────────────────────────────────────

def _ingest_coin_ohlcv_only(symbol: str) -> bool:
    """Fallback: ingest a coin using only exchange OHLCV data (no CoinGecko)."""
    df = _fetch_ohlcv(symbol)
    if df is None:
        return False

    try:
        indicators = _compute_crypto_indicators(df)
    except Exception as e:
        logger.warning("{}: indicator computation failed (ohlcv-only) — {}", symbol, e)
        return False

    record = {
        "asset_type": "crypto",
        "identifier": symbol,
        "price":      indicators["close"],
        "volume":     indicators.get("volume_24h"),
        "change_24h": None,
        "metadata": {
            "source":       "ohlcv_only",
            "price_source": "exchange_close",
            **indicators,
        },
    }

    try:
        supabase.table("raw_prices").insert(record).execute()
        logger.info("{}: ingested via OHLCV-only fallback (price={})", symbol, indicators["close"])
        return True
    except Exception as e:
        logger.error("{}: raw_prices insert failed (ohlcv-only) — {}", symbol, e)
        return False


def ingest_crypto() -> str:
    """
    Fetch top 50 CoinGecko coins + priority list, enrich with multi-source
    OHLCV indicators (Binance, Kraken, Finnhub, CoinGecko),
    store Fear & Greed, fetch crypto news.
    If CoinGecko is down, priority coins still get ingested via exchange data.
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
                headers=_coingecko_headers(),
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

    # If CoinGecko failed entirely, ingest priority coins via exchange data alone
    ingested_symbols = {_coingecko_to_symbol(c) for c in unique}
    ohlcv_fallback = 0
    if len(unique) == 0:
        logger.warning("CoinGecko returned 0 coins — falling back to OHLCV-only for priority symbols")
        for sym in PRIORITY_SYMBOLS:
            if sym not in ingested_symbols:
                try:
                    if _ingest_coin_ohlcv_only(sym):
                        ohlcv_fallback += 1
                        success += 1
                    else:
                        failed += 1
                except Exception as e:
                    logger.error("{}: OHLCV-only fallback failed — {}", sym, e)
                    failed += 1

    # General crypto news — Finnhub (broad) + named RSS outlets (CoinDesk, Decrypt, The Block)
    news_count = _fetch_and_store_crypto_news()
    try:
        ingest_crypto_news_rss()
    except Exception as e:
        logger.warning("Crypto RSS news ingestion failed: {}", e)

    summary = (
        f"{success} coins ingested, {failed} failed, "
        f"{news_count} news items, "
        f"F&G={fg['value'] if fg else 'N/A'}"
    )
    if ohlcv_fallback:
        summary += f", {ohlcv_fallback} via OHLCV fallback"
    logger.info("Crypto ingestion complete — {}", summary)
    return summary
