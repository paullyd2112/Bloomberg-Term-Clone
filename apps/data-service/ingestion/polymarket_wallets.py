"""Wallet Profiling — discovers top Polymarket wallets from whale alerts
and known whales, backfills their trade history via the data-api /activity
endpoint, and computes per-wallet statistics (PnL, win rate, category
specialization).

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
from scoring.token_direction import resolve_token_direction

DATA_API = "https://data-api.polymarket.com"
CLOB_BASE = "https://clob.polymarket.com"
GAMMA_API = "https://gamma-api.polymarket.com"

ACTIVITY_PER_PAGE = 100
REQUEST_DELAY_S = 1.0
MIN_TRADES_FOR_STATS = 5

SEED_WHALE_WALLETS: list[str] = [
    # Top 20 from Polymarket all-time leaderboard
    "0x204f72f35326db932158cba6adff0b9a1da95e14",  # swisstony
    "0x09b428f7c2b469786286214aa5c90dd9015f7320",  # DEEDDIT
    "0x476e1322d1a412fa0325527b8c3bc5e707b1396d",  # asparagus2012
    "0x2e25b222e2080c377fc1fb2b9f926315f0f4d49e",  # Sparkling8899
    "0xe549581668a5751c1972d3ad2d1991d900bd2d54",  # Allezpapa
    "0x83720820a8aa6c3f20ad71850e7a1a17d16c5223",  # Jsram
    "0x5b4ec9c06b284ee52c41a761974d836992880232",  # ramadamaramadam
    "0x67542c3219b37fd1610aad290676ff91cdbfe3bc",  # maz26
    "0xf0318c32136c2db7fec88b84869aee6a1106c80c",  # BreakTheBank
    "0x2c335066fe58fe9237c3d3dc7b275c2a034a0563",
    "0xfea31bc088000ff909be1dfd8d0e3f2c7ef2d227",  # ndb1
    "0x095fbca2e0eaf0c9841005135427e1e0117190b2",  # muchobliged
    "0x84cfffc3f16dcc353094de30d4a45226eccd2f63",  # mooseborzoi
    "0x7c1ee865a785de4c00ee90ed86a38489fb8bbab3",
    "0xd1c537b2a7cba8d365e111bffb9de7b205e2cbd0",
    "0x076daa87c4fe1a85402a9b6b8e0a866224388d4c",
    "0xf5fabdcdc6eb6d9765a228824f16cca9c91f62df",
    "0xc31d0a0d63d760d72a1236d16beaa6a71c854ebe",
    "0xb61b2079b95f6b7476fd3203e0274ffb93308a06",
    "0xbb5fbe810633ab08d106b82db84418a0e2ca2e21",
]


def discover_wallets() -> int:
    """Extract unique wallet addresses from whale_alerts, seed whales, and
    the global trades feed. Insert new ones into wallet_profiles."""
    addresses: set[str] = set()

    for addr in SEED_WHALE_WALLETS:
        addresses.add(addr.lower())

    try:
        result = (
            supabase.table("whale_alerts")
            .select("maker_address, taker_address")
            .not_.is_("maker_address", "null")
            .order("created_at", desc=True)
            .limit(1000)
            .execute()
        )
        for row in result.data or []:
            if row.get("maker_address"):
                addresses.add(row["maker_address"].lower())
            if row.get("taker_address"):
                addresses.add(row["taker_address"].lower())
    except Exception as e:
        logger.error("discover_wallets: failed to query whale_alerts — {}", e)

    discovered = _discover_from_global_feed()
    addresses.update(discovered)

    if not addresses:
        return 0

    existing = set()
    try:
        addr_list = list(addresses)
        for batch_start in range(0, len(addr_list), 50):
            batch = addr_list[batch_start:batch_start + 50]
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


def _discover_from_global_feed() -> set[str]:
    """Scan global trades feed for wallets with trades above $250 USD."""
    addresses: set[str] = set()
    try:
        resp = httpx.get(
            f"{DATA_API}/trades",
            params={"limit": 500},
            timeout=15,
        )
        if resp.status_code != 200:
            return addresses
        data = resp.json()
        if isinstance(data, list):
            trades = data
        elif isinstance(data, dict):
            trades = next(
                (data[k] for k in ("data", "trades", "results", "items") if isinstance(data.get(k), list)),
                [],
            )
        else:
            trades = []
        for t in trades:
            w = t.get("proxyWallet", "")
            if not w:
                continue
            price = float(t.get("price", 0))
            size = float(t.get("size", 0))
            if price * size >= 250:
                addresses.add(w.lower())
    except Exception as e:
        logger.debug("discover_wallets: global feed scan failed — {}", e)
    return addresses


def _fetch_wallet_activity(address: str, offset: int = 0) -> list[dict]:
    """Fetch a page of activity from Polymarket data-api for a specific wallet.

    Uses /activity?user= which correctly filters by wallet address.
    The /trades?proxyWallet= endpoint ignores filter params.
    """
    try:
        resp = httpx.get(
            f"{DATA_API}/activity",
            params={"user": address, "limit": ACTIVITY_PER_PAGE, "offset": offset},
            timeout=15,
        )
        if resp.status_code != 200:
            logger.warning("wallet activity: data-api returned {} for {}", resp.status_code, address[:10])
            return []
        data = resp.json()
        return data if isinstance(data, list) else []
    except Exception as e:
        logger.error("wallet activity: fetch failed for {} — {}", address[:10], e)
        return []


_title_cache: dict[str, str] = {}
_TITLE_CACHE_MAX = 2000


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
                if len(_title_cache) >= _TITLE_CACHE_MAX:
                    _title_cache.clear()
                _title_cache[condition_id] = title
                return title
    except Exception:
        pass
    if len(_title_cache) >= _TITLE_CACHE_MAX:
        _title_cache.clear()
    _title_cache[condition_id] = condition_id
    return condition_id


def backfill_wallet_history(address: str, max_pages: int = 10) -> int:
    """Paginate /activity for a wallet, store trades in wallet_trades.
    Returns number of new trades inserted."""
    inserted = 0

    for page in range(max_pages):
        activities = _fetch_wallet_activity(address, offset=page * ACTIVITY_PER_PAGE)
        if not activities:
            break

        for item in activities:
            try:
                item_type = item.get("type", "")
                if item_type not in ("TRADE", "BUY", "SELL"):
                    continue

                tx_hash = item.get("transactionHash")
                if not tx_hash:
                    continue

                condition_id = item.get("conditionId", "")
                if not condition_id:
                    continue

                price = float(item.get("price", 0))
                size = float(item.get("size", 0))
                usd_value = float(item.get("usdcSize", 0)) or (price * size)

                side = item.get("side", "")
                asset_id = item.get("asset", "")
                outcome_index = item.get("outcomeIndex")

                if side and side.upper() in ("BUY", "SELL"):
                    if outcome_index == 0:
                        direction = "YES" if side.upper() == "BUY" else "NO"
                    elif outcome_index == 1:
                        direction = "NO" if side.upper() == "BUY" else "YES"
                    else:
                        direction = resolve_token_direction(str(asset_id), condition_id, side, price)
                else:
                    direction = resolve_token_direction(str(asset_id), condition_id, side, price)

                market_title = item.get("title") or _resolve_title(condition_id)
                raw_ts = item.get("timestamp")
                if isinstance(raw_ts, (int, float)):
                    traded_at = datetime.fromtimestamp(raw_ts, tz=timezone.utc).isoformat()
                else:
                    traded_at = raw_ts

                supabase.table("wallet_trades").insert({
                    "wallet_address": address,
                    "condition_id": condition_id,
                    "market_title": market_title[:500] if market_title else None,
                    "direction": direction,
                    "price": round(price, 4),
                    "size": round(size, 4),
                    "usd_value": round(usd_value, 2),
                    "tx_hash": str(tx_hash)[:200],
                    "traded_at": traded_at,
                }).execute()
                inserted += 1
            except Exception as e:
                if "duplicate" in str(e).lower() or "unique" in str(e).lower():
                    continue
                logger.debug("backfill: insert failed — {}", e)

        if len(activities) < ACTIVITY_PER_PAGE:
            break
        time.sleep(REQUEST_DELAY_S)

    return inserted


_SETTLEMENT_CACHE: dict[str, str] = {}
_SETTLEMENT_CACHE_MAX = 2000
_MAX_SETTLEMENT_PAGES = 20


def _fetch_settlement_outcomes(condition_ids: list[str]) -> dict[str, str]:
    """Query Polymarket CLOB for settled market outcomes.

    Returns {condition_id: 'YES'|'NO'} for markets that have resolved.
    Uses the same approach as resolver.py — iterates /markets?closed=true
    and checks tokens[].winner.
    """
    id_set = set(condition_ids)
    results: dict[str, str] = {}

    for cid in list(id_set):
        if cid in _SETTLEMENT_CACHE:
            results[cid] = _SETTLEMENT_CACHE[cid]
            id_set.discard(cid)

    if not id_set:
        return results

    try:
        next_cursor = ""
        for _ in range(_MAX_SETTLEMENT_PAGES):
            params: dict[str, str] = {"closed": "true"}
            if next_cursor:
                params["next_cursor"] = next_cursor

            resp = httpx.get(
                f"{CLOB_BASE}/markets",
                params=params,
                timeout=15.0,
            )
            if resp.status_code != 200:
                break

            data = resp.json()
            for m in data.get("data", []):
                cid = m.get("condition_id", "")
                if cid not in id_set:
                    continue
                for token in m.get("tokens", []):
                    if token.get("winner"):
                        outcome = (token.get("outcome") or "").upper()
                        if outcome in ("YES", "NO"):
                            results[cid] = outcome
                            if len(_SETTLEMENT_CACHE) < _SETTLEMENT_CACHE_MAX:
                                _SETTLEMENT_CACHE[cid] = outcome
                            id_set.discard(cid)

            if not id_set:
                break
            next_cursor = data.get("next_cursor", "")
            if not next_cursor or next_cursor == "LTE=":
                break
            time.sleep(0.5)
    except Exception as e:
        logger.debug("_fetch_settlement_outcomes: error — {}", e)

    return results


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

    settlement_outcomes = _fetch_settlement_outcomes(list(positions.keys()))

    for cid, pos_trades in positions.items():
        winning_outcome = settlement_outcomes.get(cid)
        if not winning_outcome:
            continue

        total_shares = sum(float(t["size"]) for t in pos_trades)
        total_cost = sum(float(t["usd_value"]) for t in pos_trades)
        yes_volume = sum(float(t["usd_value"]) for t in pos_trades if t["direction"] == "YES")
        no_volume = sum(float(t["usd_value"]) for t in pos_trades if t["direction"] == "NO")
        dominant_dir = "YES" if yes_volume >= no_volume else "NO"

        if dominant_dir == winning_outcome:
            pnl = total_shares - total_cost
            wins += 1
        else:
            pnl = -total_cost
            losses += 1

        realized_pnl += pnl

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
