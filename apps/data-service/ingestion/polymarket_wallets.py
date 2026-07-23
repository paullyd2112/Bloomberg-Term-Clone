"""Wallet Profiling — discovers top Polymarket wallets from whale alerts,
backfills their trade history via the CLOB API, and computes per-wallet
statistics (PnL, win rate, category specialization).

Runs daily at 4:00 AM ET via scheduler. Initial backfill may take several
minutes; subsequent runs are incremental.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone

import httpx
from loguru import logger

from supabase_client import supabase
from scoring.prediction_filters import infer_category

CLOB_BASE = "https://clob.polymarket.com"
GAMMA_API = "https://gamma-api.polymarket.com"

TRADES_PER_PAGE = 100
REQUEST_DELAY_S = 1.0
MIN_TRADES_FOR_STATS = 5


def discover_wallets() -> int:
    """Extract unique wallet addresses from whale_alerts and insert new ones
    into wallet_profiles."""
    try:
        result = (
            supabase.table("whale_alerts")
            .select("maker_address, taker_address")
            .not_.is_("maker_address", "null")
            .order("created_at", desc=True)
            .limit(1000)
            .execute()
        )
    except Exception as e:
        logger.error("discover_wallets: failed to query whale_alerts — {}", e)
        return 0

    addresses: set[str] = set()
    for row in result.data or []:
        if row.get("maker_address"):
            addresses.add(row["maker_address"].lower())
        if row.get("taker_address"):
            addresses.add(row["taker_address"].lower())

    if not addresses:
        return 0

    existing = set()
    try:
        for batch_start in range(0, len(addresses), 50):
            batch = list(addresses)[batch_start:batch_start + 50]
            resp = (
                supabase.table("wallet_profiles")
                .select("address")
                .in_("address", batch)
                .execute()
            )
            existing.update(r["address"] for r in (resp.data or []))
    except Exception as e:
        logger.error("discover_wallets: failed to check existing profiles — {}", e)

    new_addresses = addresses - existing
    inserted = 0
    for addr in new_addresses:
        try:
            supabase.table("wallet_profiles").insert({
                "address": addr,
                "first_seen_at": datetime.now(timezone.utc).isoformat(),
            }).execute()
            inserted += 1
        except Exception as e:
            logger.debug("discover_wallets: insert failed for {} — {}", addr[:10], e)

    return inserted


def _fetch_wallet_trades(address: str, after_cursor: str | None = None) -> list[dict]:
    """Fetch a page of trades from the CLOB API for a specific wallet."""
    params: dict = {"maker": address, "limit": TRADES_PER_PAGE}
    if after_cursor:
        params["after"] = after_cursor

    try:
        resp = httpx.get(
            f"{CLOB_BASE}/trades",
            params=params,
            timeout=15,
        )
        if resp.status_code != 200:
            logger.warning("wallet trades: CLOB returned {} for {}", resp.status_code, address[:10])
            return []
        data = resp.json()
        return data if isinstance(data, list) else []
    except Exception as e:
        logger.error("wallet trades: fetch failed for {} — {}", address[:10], e)
        return []


_title_cache: dict[str, str] = {}


def _resolve_title(condition_id: str) -> str:
    if condition_id in _title_cache:
        return _title_cache[condition_id]
    try:
        resp = httpx.get(
            f"{GAMMA_API}/markets",
            params={"condition_id": condition_id, "limit": 1},
            timeout=8,
        )
        if resp.status_code == 200:
            markets = resp.json()
            if markets:
                title = markets[0].get("question", markets[0].get("title", condition_id))
                _title_cache[condition_id] = title
                return title
    except Exception:
        pass
    _title_cache[condition_id] = condition_id
    return condition_id


def backfill_wallet_history(address: str, max_pages: int = 10) -> int:
    """Paginate CLOB /trades for a wallet, store in wallet_trades.
    Returns number of new trades inserted."""
    inserted = 0
    cursor: str | None = None

    for _ in range(max_pages):
        trades = _fetch_wallet_trades(address, cursor)
        if not trades:
            break

        for trade in trades:
            try:
                tx_hash = trade.get("transaction_hash", trade.get("id"))
                if not tx_hash:
                    continue

                price = float(trade.get("price", 0))
                size = float(trade.get("size", 0))
                condition_id = trade.get("condition_id", "")
                if not condition_id:
                    continue

                side = trade.get("side", "").lower()
                if side in ("buy", "bid"):
                    direction = "YES" if price > 0.5 else "NO"
                elif side in ("sell", "ask"):
                    direction = "NO" if price > 0.5 else "YES"
                else:
                    direction = "YES" if price > 0.5 else "NO"

                market_title = _resolve_title(condition_id)
                traded_at = trade.get("created_at", trade.get("timestamp"))

                supabase.table("wallet_trades").insert({
                    "wallet_address": address,
                    "condition_id": condition_id,
                    "market_title": market_title[:500] if market_title else None,
                    "direction": direction,
                    "price": round(price, 4),
                    "size": round(size, 4),
                    "usd_value": round(price * size, 2),
                    "tx_hash": str(tx_hash)[:200],
                    "traded_at": traded_at,
                }).execute()
                inserted += 1
            except Exception as e:
                if "duplicate" in str(e).lower() or "unique" in str(e).lower():
                    continue
                logger.debug("backfill: insert failed — {}", e)

        if len(trades) < TRADES_PER_PAGE:
            break
        cursor = trades[-1].get("id") or trades[-1].get("transaction_hash")
        time.sleep(REQUEST_DELAY_S)

    return inserted


def compute_wallet_stats(address: str) -> dict | None:
    """Aggregate wallet_trades to compute stats for a wallet profile."""
    try:
        result = (
            supabase.table("wallet_trades")
            .select("condition_id, market_title, direction, price, size, usd_value, traded_at")
            .eq("wallet_address", address)
            .order("traded_at", desc=True)
            .limit(2000)
            .execute()
        )
    except Exception as e:
        logger.error("compute_wallet_stats: query failed for {} — {}", address[:10], e)
        return None

    trades = result.data or []
    if len(trades) < MIN_TRADES_FOR_STATS:
        return None

    total_volume = sum(float(t.get("usd_value", 0)) for t in trades)
    avg_size = total_volume / len(trades) if trades else 0

    positions: dict[str, list[dict]] = {}
    for t in trades:
        cid = t["condition_id"]
        if cid not in positions:
            positions[cid] = []
        positions[cid].append(t)

    wins = 0
    losses = 0
    realized_pnl = 0.0

    for cid, pos_trades in positions.items():
        try:
            settled = (
                supabase.table("signals")
                .select("result")
                .eq("identifier", cid)
                .eq("asset_type", "prediction")
                .in_("result", ["WIN", "LOSS"])
                .limit(1)
                .execute()
            )
            if not settled.data:
                continue

            outcome = settled.data[0]["result"]
            avg_entry = sum(float(t["price"]) for t in pos_trades) / len(pos_trades)
            total_size = sum(float(t["usd_value"]) for t in pos_trades)
            dominant_dir = max(
                set(t["direction"] for t in pos_trades),
                key=lambda d: sum(1 for t in pos_trades if t["direction"] == d),
            )

            if outcome == "WIN":
                if dominant_dir == "YES":
                    pnl = total_size * (1.0 - avg_entry) / avg_entry
                    wins += 1
                else:
                    pnl = -total_size
                    losses += 1
            else:
                if dominant_dir == "NO":
                    pnl = total_size * avg_entry / (1.0 - avg_entry) if avg_entry < 1 else 0
                    wins += 1
                else:
                    pnl = -total_size
                    losses += 1

            realized_pnl += pnl
        except Exception:
            continue

    total_resolved = wins + losses
    win_rate = wins / total_resolved if total_resolved > 0 else None

    category_counts: dict[str, dict] = {}
    for t in trades:
        title = t.get("market_title", "")
        cat = infer_category(title) if title else ""
        if not cat:
            cat = "other"
        if cat not in category_counts:
            category_counts[cat] = {"count": 0}
        category_counts[cat]["count"] += 1

    top_cats = sorted(category_counts.items(), key=lambda x: x[1]["count"], reverse=True)[:5]
    top_categories = [{"category": cat, "count": data["count"]} for cat, data in top_cats]

    earliest = min((t.get("traded_at") for t in trades if t.get("traded_at")), default=None)
    latest = max((t.get("traded_at") for t in trades if t.get("traded_at")), default=None)

    stats = {
        "total_trades": len(trades),
        "total_volume_usd": round(total_volume, 2),
        "realized_pnl_usd": round(realized_pnl, 2),
        "win_rate": round(win_rate, 4) if win_rate is not None else None,
        "avg_trade_size": round(avg_size, 2),
        "top_categories": top_categories,
        "first_seen_at": earliest,
        "last_active_at": latest,
        "stats_updated_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        supabase.table("wallet_profiles").update(stats).eq("address", address).execute()
    except Exception as e:
        logger.error("compute_wallet_stats: update failed for {} — {}", address[:10], e)

    return stats


def ingest_wallet_profiles() -> str:
    """Orchestrator: discover wallets, backfill trades, compute stats."""
    new_wallets = discover_wallets()
    logger.info("wallet_profiles: discovered {} new wallets", new_wallets)

    try:
        stale = (
            supabase.table("wallet_profiles")
            .select("address, stats_updated_at")
            .order("stats_updated_at", desc=False)
            .limit(20)
            .execute()
        )
    except Exception as e:
        logger.error("wallet_profiles: failed to query stale profiles — {}", e)
        return f"{new_wallets} new wallets, 0 backfilled, 0 stats computed (query error)"

    profiles = stale.data or []
    backfilled = 0
    stats_computed = 0

    for profile in profiles:
        addr = profile["address"]

        new_trades = backfill_wallet_history(addr)
        if new_trades > 0:
            backfilled += 1
            logger.info("wallet_profiles: {} — {} new trades", addr[:10], new_trades)

        stats = compute_wallet_stats(addr)
        if stats:
            stats_computed += 1

        time.sleep(REQUEST_DELAY_S)

    return (
        f"{new_wallets} new wallets, {backfilled} backfilled, "
        f"{stats_computed} stats computed (of {len(profiles)} checked)"
    )
