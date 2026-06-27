"""
Crypto momentum screener — catches pumps and breakouts that aren't in the
fixed watchlist. Scans CoinGecko for coins with abnormal 24h moves,
auto-ingests their price data, and triggers scoring.

Runs every 2 hours via scheduler so we don't miss another VELVET-style 100%+ pump.
"""

import os
import time
from datetime import datetime, timezone

import httpx
import sentry_sdk
from loguru import logger
from dotenv import load_dotenv

from supabase_client import supabase

load_dotenv()

COINGECKO_KEY = os.environ.get("COINGECKO_API_KEY", "")
COINGECKO_URL = "https://api.coingecko.com/api/v3/coins/markets"
REQUEST_TIMEOUT = 15.0

MIN_CHANGE_24H = 15.0       # minimum 15% move to flag
MIN_MARKET_CAP = 5_000_000  # filter out ultra-microcaps (< $5M)
MAX_COINS = 500             # scan top 500 by market cap
PAGES = 5                   # 100 per page


def _coingecko_headers() -> dict:
    if COINGECKO_KEY:
        return {"x-cg-demo-api-key": COINGECKO_KEY}
    return {}


def scan_momentum() -> list[dict]:
    """
    Scan CoinGecko for coins with large 24h price moves.
    Returns list of coins that pass the momentum filter.
    """
    headers = _coingecko_headers()
    all_coins: list[dict] = []

    with httpx.Client(timeout=REQUEST_TIMEOUT, headers=headers) as client:
        for page in range(1, PAGES + 1):
            try:
                resp = client.get(
                    COINGECKO_URL,
                    params={
                        "vs_currency": "usd",
                        "order": "market_cap_desc",
                        "per_page": 100,
                        "page": page,
                        "sparkline": "false",
                        "price_change_percentage": "24h",
                    },
                )
                resp.raise_for_status()
                all_coins.extend(resp.json())
                time.sleep(1.5)
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 429:
                    logger.warning("crypto_momentum: CoinGecko 429 on page {} — stopping", page)
                    break
                logger.warning("crypto_momentum: page {} error: {}", page, e)
                break
            except Exception as e:
                logger.warning("crypto_momentum: page {} fetch error: {}", page, e)
                break

    movers = []
    for coin in all_coins:
        symbol = (coin.get("symbol") or "").upper()
        change = coin.get("price_change_percentage_24h") or 0
        mcap = coin.get("market_cap") or 0
        price = coin.get("current_price") or 0

        if abs(change) < MIN_CHANGE_24H:
            continue
        if mcap < MIN_MARKET_CAP:
            continue
        if not symbol or not price:
            continue

        movers.append({
            "symbol": symbol,
            "price": price,
            "change_24h": round(change, 2),
            "market_cap": mcap,
            "volume_24h": coin.get("total_volume") or 0,
            "ath": coin.get("ath"),
            "ath_change_percentage": coin.get("ath_change_percentage"),
        })

    movers.sort(key=lambda x: abs(x["change_24h"]), reverse=True)
    logger.info("crypto_momentum: scanned {} coins, {} with >{}% move",
                len(all_coins), len(movers), MIN_CHANGE_24H)
    return movers


def _get_existing_symbols() -> set[str]:
    """Get symbols that already have recent price data."""
    try:
        result = (
            supabase.table("raw_prices")
            .select("identifier")
            .eq("asset_type", "crypto")
            .execute()
        )
        return {r["identifier"] for r in (result.data or [])}
    except Exception:
        return set()


def _ingest_mover(coin: dict) -> bool:
    """Ingest a momentum coin's price data into raw_prices."""
    try:
        supabase.table("raw_prices").upsert({
            "asset_type": "crypto",
            "identifier": coin["symbol"],
            "price": coin["price"],
            "change_24h": coin["change_24h"],
            "volume": coin["volume_24h"],
            "metadata": {
                "market_cap": coin["market_cap"],
                "ath": coin["ath"],
                "ath_change_pct": coin["ath_change_percentage"],
                "source": "momentum_screener",
            },
            "captured_at": datetime.now(timezone.utc).isoformat(),
        }, on_conflict="asset_type,identifier").execute()
        return True
    except Exception as e:
        logger.warning("crypto_momentum: failed to ingest {}: {}", coin["symbol"], e)
        return False


def ingest_momentum_coins() -> str:
    """
    Full pipeline: scan for momentum, ingest new coins, score them.
    Returns summary string.
    """
    movers = scan_momentum()
    if not movers:
        return "0 momentum coins found"

    existing = _get_existing_symbols()
    ingested = 0
    scored = 0

    for coin in movers:
        # Always update price data for momentum coins
        if _ingest_mover(coin):
            ingested += 1

        # Only score if this is a new discovery or a big mover
        is_new = coin["symbol"] not in existing
        is_major_move = abs(coin["change_24h"]) >= 30.0

        if is_new or is_major_move:
            try:
                from scoring.engine import score_asset
                result = score_asset("crypto", coin["symbol"])
                if result:
                    scored += 1
                    logger.info(
                        "crypto_momentum: scored {} — {} {}% (change: {:.1f}%)",
                        coin["symbol"], result.get("direction"),
                        result.get("confidence"), coin["change_24h"],
                    )
            except Exception as e:
                logger.warning("crypto_momentum: scoring {} failed: {}", coin["symbol"], e)
                sentry_sdk.capture_exception(e)

    summary = (
        f"{len(movers)} momentum coins found, "
        f"{ingested} ingested, {scored} scored"
    )
    logger.info("crypto_momentum: {}", summary)
    return summary
