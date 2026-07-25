"""
Whale Sentinel — tracks large Polymarket trades.

Polls the Polymarket data API for recent trades exceeding $500 USD value,
stores them in the whale_alerts table (with wallet addresses for profiling),
and exposes them via the /whale-alerts API endpoint. Runs every 5 min.
"""

from datetime import datetime, timezone

import httpx
from loguru import logger

from supabase_client import supabase
from scoring.token_direction import resolve_token_direction

DATA_API = "https://data-api.polymarket.com"
MIN_USD_VALUE = 500
FETCH_LIMIT = 500

def _fetch_recent_trades() -> list[dict]:
    """Fetch recent trades from Polymarket data API (public, no auth)."""
    try:
        resp = httpx.get(
            f"{DATA_API}/trades",
            params={"limit": FETCH_LIMIT},
            timeout=15,
        )
        if resp.status_code != 200:
            logger.warning("whale_sentinel: data-api trades returned {}", resp.status_code)
            return []
        data = resp.json()
        return data if isinstance(data, list) else []
    except Exception as e:
        logger.error("whale_sentinel: failed to fetch trades — {}", e)
        return []


def _parse_whale_trades(trades: list[dict]) -> list[dict]:
    """Filter and parse trades above the USD threshold."""
    whales = []
    for trade in trades:
        try:
            price = float(trade.get("price", 0))
            size = float(trade.get("size", 0))
            usd_value = price * size

            if usd_value < MIN_USD_VALUE:
                continue

            condition_id = trade.get("conditionId", trade.get("condition_id", ""))
            asset_id = trade.get("asset", trade.get("asset_id", ""))
            market_title = trade.get("title", condition_id)

            side = trade.get("side", "")
            outcome_raw = trade.get("outcome", "")
            if outcome_raw and outcome_raw.upper() in ("YES", "NO"):
                outcome = outcome_raw.upper()
            else:
                outcome = resolve_token_direction(str(asset_id), condition_id, side, price)

            tx_hash = trade.get("transactionHash", trade.get("transaction_hash", None))
            wallet = trade.get("proxyWallet", None)

            whales.append({
                "market_title": market_title[:500] if market_title else "",
                "asset_id": str(condition_id or asset_id)[:200],
                "outcome": outcome[:50],
                "price": round(price, 4),
                "size": round(size, 4),
                "usd_value": round(usd_value, 2),
                "tx_hash": str(tx_hash)[:200] if tx_hash else None,
                "maker_address": str(wallet)[:200] if wallet else None,
                "taker_address": None,
            })
        except (ValueError, TypeError, KeyError) as e:
            logger.debug("whale_sentinel: skipping malformed trade — {}", e)
            continue

    return whales


def _store_whale_alerts(whales: list[dict]) -> int:
    """Insert whale alerts into Supabase, deduplicating by tx_hash."""
    if not whales:
        return 0

    inserted = 0
    for whale in whales:
        try:
            tx_hash = whale.get("tx_hash")
            if not tx_hash:
                continue

            existing = (
                supabase.table("whale_alerts")
                .select("id")
                .eq("tx_hash", tx_hash)
                .limit(1)
                .execute()
            )
            if existing.data:
                continue

            supabase.table("whale_alerts").insert(whale).execute()
            inserted += 1
        except Exception as e:
            logger.debug("whale_sentinel: insert failed — {}", e)

    return inserted


def ingest_whale_alerts() -> str:
    """Main entry point — fetch, filter, store whale trades."""
    trades = _fetch_recent_trades()
    if not trades:
        return "0 trades fetched"

    whales = _parse_whale_trades(trades)
    if not whales:
        return f"{len(trades)} trades checked, 0 whales (threshold: ${MIN_USD_VALUE})"

    inserted = _store_whale_alerts(whales)
    return f"{len(trades)} trades checked, {len(whales)} whales found, {inserted} new alerts stored"


def get_whale_cluster(condition_id: str, hours: int = 4) -> dict | None:
    """Check for whale trade clusters on a specific market in the last N hours.

    Returns cluster data if 3+ whale trades on the same side, else None.
    """
    try:
        from datetime import datetime, timedelta, timezone as tz
        cutoff = (datetime.now(tz.utc) - timedelta(hours=hours)).isoformat()
        result = (
            supabase.table("whale_alerts")
            .select("outcome, usd_value, maker_win_rate")
            .eq("asset_id", condition_id)
            .gte("created_at", cutoff)
            .execute()
        )
        if not result.data or len(result.data) < 3:
            return None

        yes_count = 0
        no_count = 0
        total_usd = 0.0
        win_rates = []
        for row in result.data:
            total_usd += float(row.get("usd_value", 0))
            if row.get("maker_win_rate"):
                win_rates.append(float(row["maker_win_rate"]))
            if row["outcome"] == "YES":
                yes_count += 1
            else:
                no_count += 1

        dominant = "YES" if yes_count > no_count else "NO" if no_count > yes_count else "MIXED"
        dominant_count = max(yes_count, no_count)
        if dominant_count < 3:
            return None

        return {
            "direction": dominant,
            "whale_count": len(result.data),
            "total_usd": round(total_usd, 2),
            "avg_win_rate": round(sum(win_rates) / len(win_rates), 4) if win_rates else None,
            "breakdown": {"YES": yes_count, "NO": no_count},
        }
    except Exception as e:
        logger.debug("whale_sentinel: cluster check failed for {} — {}", condition_id, e)
        return None


def format_whale_cluster_context(cluster: dict) -> str:
    """Format whale cluster data for the scoring prompt."""
    wr_part = f", avg whale win rate {cluster['avg_win_rate']:.0%}" if cluster.get("avg_win_rate") else ""
    return (
        f"WHALE ACTIVITY: {cluster['whale_count']} whale trades (>${MIN_USD_VALUE:,} each) "
        f"on {cluster['direction']} side in last 4h, "
        f"total ${cluster['total_usd']:,.0f}{wr_part}."
    )


def get_recent_whale_alerts(limit: int = 20) -> list[dict]:
    """Fetch recent whale alerts for the API endpoint."""
    try:
        result = (
            supabase.table("whale_alerts")
            .select("market_title, asset_id, outcome, price, size, usd_value, tx_hash, created_at")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data or []
    except Exception as e:
        logger.error("whale_sentinel: fetch alerts failed — {}", e)
        return []
