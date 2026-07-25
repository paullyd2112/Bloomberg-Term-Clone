"""
Whale Sentinel — two-tier trade tracking for Polymarket.

Tier 1 (Discovery): captures trades >= $250 to feed wallet discovery
and profiling. These are NOT whales — they're candidates for analysis.

Tier 2 (Whale): trades >= $5,000, or any trade from a qualified wallet
(win rate >= 55%, 20+ trades, positive PnL). Only these surface in the
API, scoring prompts, and cluster detection.

Polls every 5 min via scheduler. Wallet qualification comes from
wallet_profiles (computed by polymarket_wallets.py daily).
"""

from datetime import datetime, timedelta, timezone

import httpx
from loguru import logger

from supabase_client import supabase
from scoring.token_direction import resolve_token_direction

DATA_API = "https://data-api.polymarket.com"
FETCH_LIMIT = 500

DISCOVERY_MIN_USD = 250
WHALE_MIN_USD = 5_000

QUALIFIED_MIN_WIN_RATE = 0.55
QUALIFIED_MIN_TRADES = 20


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


def _parse_trades(trades: list[dict]) -> list[dict]:
    """Filter trades above the discovery threshold ($250)."""
    parsed = []
    for trade in trades:
        try:
            price = float(trade.get("price", 0))
            size = float(trade.get("size", 0))
            usd_value = price * size

            if usd_value < DISCOVERY_MIN_USD:
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

            parsed.append({
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

    return parsed


def _store_alerts(trades: list[dict]) -> int:
    """Insert trade alerts into Supabase, deduplicating by tx_hash."""
    if not trades:
        return 0

    inserted = 0
    for trade in trades:
        try:
            tx_hash = trade.get("tx_hash")
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

            supabase.table("whale_alerts").insert(trade).execute()
            inserted += 1
        except Exception as e:
            logger.debug("whale_sentinel: insert failed — {}", e)

    return inserted


_qualified_wallets_cache: dict[str, bool] | None = None
_qualified_wallets_ts: float = 0


def _get_qualified_wallets() -> dict[str, bool]:
    """Load wallets that meet the quality bar from wallet_profiles.
    Cached for 10 minutes to avoid hammering Supabase every 5-min run."""
    global _qualified_wallets_cache, _qualified_wallets_ts
    import time
    now = time.time()
    if _qualified_wallets_cache is not None and now - _qualified_wallets_ts < 600:
        return _qualified_wallets_cache

    try:
        result = (
            supabase.table("wallet_profiles")
            .select("address")
            .gte("win_rate", QUALIFIED_MIN_WIN_RATE)
            .gte("total_trades", QUALIFIED_MIN_TRADES)
            .gt("realized_pnl_usd", 0)
            .execute()
        )
        qualified = {r["address"]: True for r in (result.data or [])}
        _qualified_wallets_cache = qualified
        _qualified_wallets_ts = now
        return qualified
    except Exception as e:
        logger.debug("whale_sentinel: failed to load qualified wallets — {}", e)
        return _qualified_wallets_cache or {}


def _is_whale_trade(trade: dict) -> bool:
    """A trade qualifies as a whale alert if:
    1. USD value >= $5,000 (big trade from anyone), OR
    2. From a qualified wallet (proven win rate + PnL)
    """
    if trade.get("usd_value", 0) >= WHALE_MIN_USD:
        return True

    wallet = trade.get("maker_address")
    if wallet:
        qualified = _get_qualified_wallets()
        if qualified.get(wallet.lower()):
            return True

    return False


def ingest_whale_alerts() -> str:
    """Main entry point — fetch, filter, store trades for discovery.
    All trades >= $250 are stored (for wallet discovery).
    The whale/non-whale distinction happens at read time."""
    trades = _fetch_recent_trades()
    if not trades:
        return "0 trades fetched"

    parsed = _parse_trades(trades)
    if not parsed:
        return f"{len(trades)} trades checked, 0 above ${DISCOVERY_MIN_USD} discovery threshold"

    inserted = _store_alerts(parsed)

    whale_count = sum(1 for t in parsed if _is_whale_trade(t))
    return (
        f"{len(trades)} trades checked, {len(parsed)} stored (>=${DISCOVERY_MIN_USD}), "
        f"{whale_count} whale-grade (>=${WHALE_MIN_USD} or qualified wallet), "
        f"{inserted} new"
    )


def get_whale_cluster(condition_id: str, hours: int = 4) -> dict | None:
    """Check for whale trade clusters on a specific market in the last N hours.

    Only counts trades that are whale-grade: >= $5K or from qualified wallets.
    Returns cluster data if 3+ whale trades on the same side, else None.
    """
    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
        result = (
            supabase.table("whale_alerts")
            .select("outcome, usd_value, maker_win_rate, maker_address")
            .eq("asset_id", condition_id)
            .gte("created_at", cutoff)
            .execute()
        )
        if not result.data:
            return None

        qualified = _get_qualified_wallets()

        yes_count = 0
        no_count = 0
        total_usd = 0.0
        win_rates = []

        for row in result.data:
            usd = float(row.get("usd_value", 0))
            wallet = (row.get("maker_address") or "").lower()
            if usd < WHALE_MIN_USD and not qualified.get(wallet):
                continue

            total_usd += usd
            if row.get("maker_win_rate"):
                win_rates.append(float(row["maker_win_rate"]))
            if row["outcome"] == "YES":
                yes_count += 1
            else:
                no_count += 1

        total_whale = yes_count + no_count
        if total_whale < 3:
            return None

        dominant = "YES" if yes_count > no_count else "NO" if no_count > yes_count else "MIXED"
        dominant_count = max(yes_count, no_count)
        if dominant_count < 3:
            return None

        return {
            "direction": dominant,
            "whale_count": total_whale,
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
        f"WHALE ACTIVITY: {cluster['whale_count']} whale trades "
        f"(>=${WHALE_MIN_USD:,} or qualified wallet) "
        f"on {cluster['direction']} side in last 4h, "
        f"total ${cluster['total_usd']:,.0f}{wr_part}."
    )


def get_recent_whale_alerts(limit: int = 20) -> list[dict]:
    """Fetch recent whale-grade alerts for the API endpoint.
    Only returns trades >= $5K or from qualified wallets."""
    try:
        result = (
            supabase.table("whale_alerts")
            .select("market_title, asset_id, outcome, price, size, usd_value, tx_hash, maker_address, created_at")
            .order("created_at", desc=True)
            .limit(limit * 5)
            .execute()
        )

        if not result.data:
            return []

        qualified = _get_qualified_wallets()
        whales = []
        for row in result.data:
            usd = float(row.get("usd_value", 0))
            wallet = (row.get("maker_address") or "").lower()
            if usd >= WHALE_MIN_USD or qualified.get(wallet):
                whales.append(row)
                if len(whales) >= limit:
                    break

        return whales
    except Exception as e:
        logger.error("whale_sentinel: fetch alerts failed — {}", e)
        return []
