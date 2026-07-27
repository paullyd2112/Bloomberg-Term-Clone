"""
Whale Sentinel — targeted whale tracking for Polymarket.

Two data paths:
1. **Targeted monitoring** (primary): polls /activity for every tracked
   wallet (seed whales + qualified wallets from wallet_profiles). Captures
   ALL trades from proven wallets regardless of size. This is how we
   guarantee coverage — millions of trades/day on the global feed but we
   only care about what the best wallets are doing.

2. **Global feed sampling** (secondary/discovery): samples 2,000 recent
   trades from the firehose to discover NEW wallets placing $250+ trades.
   These feed wallet_profiles for future targeted monitoring.

Tier 2 (Whale): trades >= $5,000, or any trade from a qualified wallet
(win rate >= 55%, 20+ trades, positive PnL). Only these surface in the
API, scoring prompts, and cluster detection.

Polls every 5 min via scheduler. Wallet qualification comes from
wallet_profiles (computed by polymarket_wallets.py daily).
"""

import time
from datetime import datetime, timedelta, timezone

import httpx
from loguru import logger

from supabase_client import supabase
from scoring.token_direction import resolve_token_direction

DATA_API = "https://data-api.polymarket.com"
FETCH_LIMIT = 500
FETCH_PAGES = 4

DISCOVERY_MIN_USD = 250
WHALE_MIN_USD = 5_000

QUALIFIED_MIN_WIN_RATE = 0.55
QUALIFIED_MIN_TRADES = 20

# Top 20 Polymarket wallets by all-time profit (from leaderboard).
# These are monitored directly via /activity every poll cycle.
TRACKED_WHALE_WALLETS: list[str] = [
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


def _extract_list(data) -> list[dict]:
    """Extract trade list from API response (flat list or wrapped object)."""
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ("data", "trades", "results", "items"):
            if isinstance(data.get(key), list):
                return data[key]
    return []


def _get_tracked_wallets() -> set[str]:
    """Combine hardcoded seed whales with qualified wallets from DB."""
    wallets = {w.lower() for w in TRACKED_WHALE_WALLETS}
    qualified = _get_qualified_wallets()
    wallets.update(qualified.keys())
    return wallets


def _fetch_wallet_recent_trades(address: str) -> list[dict]:
    """Fetch recent trades for a specific wallet via /activity endpoint.
    Returns trades from the last ~10 minutes (to match 5-min poll cycle with buffer)."""
    try:
        resp = httpx.get(
            f"{DATA_API}/activity",
            params={"user": address, "limit": 50},
            timeout=10,
        )
        if resp.status_code != 200:
            return []
        data = resp.json()
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _fetch_tracked_wallet_trades() -> list[dict]:
    """Poll all tracked wallets for recent activity. This is the PRIMARY
    data source — guarantees we catch every trade from proven wallets."""
    wallets = _get_tracked_wallets()
    if not wallets:
        return []

    all_trades: list[dict] = []
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=10)

    for address in wallets:
        activities = _fetch_wallet_recent_trades(address)
        for item in activities:
            item_type = item.get("type", "")
            if item_type not in ("TRADE", "BUY", "SELL"):
                continue

            raw_ts = item.get("timestamp")
            if isinstance(raw_ts, (int, float)):
                trade_time = datetime.fromtimestamp(raw_ts, tz=timezone.utc)
            elif isinstance(raw_ts, str):
                try:
                    trade_time = datetime.fromisoformat(raw_ts.replace("Z", "+00:00"))
                except ValueError:
                    trade_time = datetime.now(timezone.utc)
            else:
                trade_time = datetime.now(timezone.utc)

            if trade_time < cutoff:
                break

            item["_tracked_wallet"] = address
            item["proxyWallet"] = address
            all_trades.append(item)

        time.sleep(0.3)

    logger.info("whale_sentinel: tracked {} wallets, found {} recent trades", len(wallets), len(all_trades))
    return all_trades


def _fetch_recent_trades() -> list[dict]:
    """Fetch recent trades from Polymarket data API (public, no auth).
    Paginates FETCH_PAGES pages of FETCH_LIMIT trades each. This is the
    SECONDARY source — only useful for discovering new wallets."""
    all_trades: list[dict] = []
    for page in range(FETCH_PAGES):
        try:
            resp = httpx.get(
                f"{DATA_API}/trades",
                params={"limit": FETCH_LIMIT, "offset": page * FETCH_LIMIT},
                timeout=15,
            )
            if resp.status_code != 200:
                logger.warning("whale_sentinel: data-api trades page {} returned {}", page, resp.status_code)
                break
            batch = _extract_list(resp.json())
            if not batch:
                break
            all_trades.extend(batch)
        except Exception as e:
            logger.error("whale_sentinel: fetch page {} failed — {}", page, e)
            break
    return all_trades


def _parse_trades(trades: list[dict], min_usd: float = DISCOVERY_MIN_USD) -> list[dict]:
    """Parse trades into a standard format.
    min_usd: minimum USD value to include. Use 0 for tracked wallet trades
    (we want ALL trades from tracked wallets), DISCOVERY_MIN_USD for global feed."""
    parsed = []
    for trade in trades:
        try:
            price = float(trade.get("price", 0))
            size = float(trade.get("size", 0))
            usd_value = float(trade.get("usdcSize", 0)) or (price * size)

            if usd_value < min_usd:
                continue

            condition_id = trade.get("conditionId", trade.get("condition_id", ""))
            asset_id = trade.get("asset", trade.get("asset_id", ""))
            market_title = trade.get("title", condition_id)

            side = trade.get("side", "")
            outcome_raw = trade.get("outcome", "")
            if outcome_raw and outcome_raw.upper() in ("YES", "NO"):
                outcome = outcome_raw.upper()
            else:
                outcome_index = trade.get("outcomeIndex")
                if side and side.upper() in ("BUY", "SELL") and outcome_index in (0, 1):
                    if outcome_index == 0:
                        outcome = "YES" if side.upper() == "BUY" else "NO"
                    else:
                        outcome = "NO" if side.upper() == "BUY" else "YES"
                else:
                    outcome = resolve_token_direction(str(asset_id), condition_id, side, price)

            tx_hash = trade.get("transactionHash", trade.get("transaction_hash", None))
            wallet = trade.get("proxyWallet", trade.get("_tracked_wallet", None))

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
    """Main entry point — two-source ingestion:
    1. Targeted: poll tracked wallets directly (guaranteed coverage)
    2. Global: sample firehose for discovery (new wallet candidates)
    """
    # PRIMARY: targeted wallet monitoring — every trade from proven wallets
    tracked_trades = _fetch_tracked_wallet_trades()
    tracked_parsed = _parse_trades(tracked_trades, min_usd=0) if tracked_trades else []
    tracked_inserted = _store_alerts(tracked_parsed)

    # SECONDARY: global feed sampling — discovery for new wallets
    global_trades = _fetch_recent_trades()
    global_parsed = _parse_trades(global_trades, min_usd=DISCOVERY_MIN_USD)
    global_inserted = _store_alerts(global_parsed)

    total_inserted = tracked_inserted + global_inserted
    all_parsed = tracked_parsed + global_parsed
    whale_count = sum(1 for t in all_parsed if _is_whale_trade(t))

    return (
        f"tracked: {len(tracked_parsed)} trades from {len(_get_tracked_wallets())} wallets "
        f"({tracked_inserted} new) | "
        f"global: {len(global_trades)} sampled, {len(global_parsed)} above ${DISCOVERY_MIN_USD} "
        f"({global_inserted} new) | "
        f"{whale_count} whale-grade total, {total_inserted} inserted"
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
