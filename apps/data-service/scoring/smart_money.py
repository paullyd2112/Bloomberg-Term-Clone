"""Smart Money Consensus — computes what the best Polymarket wallets
are doing on a given market. Returns a weighted consensus metric
that's passed to Claude as context in the prediction scoring prompt.

Zero API cost — all queries hit the local wallet_profiles/wallet_trades tables.
"""

from __future__ import annotations

from datetime import datetime, timezone

from loguru import logger

from supabase_client import supabase

MIN_WIN_RATE = 0.55
MIN_TRADES = 20
MIN_WALLETS_FOR_SIGNAL = 2
RECENT_HOURS = 72


def get_smart_money_consensus(condition_id: str) -> dict | None:
    """Compute weighted consensus of top wallets' positions on a market.

    Returns a dict with consensus data, or None if insufficient signal
    (fewer than MIN_WALLETS_FOR_SIGNAL qualifying wallets have traded).
    """
    try:
        qualified = (
            supabase.table("wallet_profiles")
            .select("address, realized_pnl_usd, win_rate, total_trades")
            .gte("win_rate", MIN_WIN_RATE)
            .gte("total_trades", MIN_TRADES)
            .gt("realized_pnl_usd", 0)
            .order("realized_pnl_usd", desc=True)
            .limit(50)
            .execute()
        )
    except Exception as e:
        logger.error("smart_money: failed to query wallet_profiles — {}", e)
        return None

    if not qualified.data:
        return None

    addresses = [w["address"] for w in qualified.data]
    pnl_by_addr = {w["address"]: float(w["realized_pnl_usd"] or 0) for w in qualified.data}

    try:
        trades = (
            supabase.table("wallet_trades")
            .select("wallet_address, direction, usd_value, traded_at")
            .eq("condition_id", condition_id)
            .in_("wallet_address", addresses)
            .order("traded_at", desc=True)
            .limit(200)
            .execute()
        )
    except Exception as e:
        logger.error("smart_money: failed to query wallet_trades — {}", e)
        return None

    if not trades.data:
        return None

    wallet_positions: dict[str, str] = {}
    wallet_volume: dict[str, float] = {}

    for t in trades.data:
        addr = t["wallet_address"]
        if addr not in wallet_positions:
            wallet_positions[addr] = t["direction"]
            wallet_volume[addr] = 0
        wallet_volume[addr] += float(t.get("usd_value", 0))

    if len(wallet_positions) < MIN_WALLETS_FOR_SIGNAL:
        return None

    yes_weight = 0.0
    no_weight = 0.0
    yes_count = 0
    no_count = 0
    total_volume = sum(wallet_volume.values())
    top_pnl = 0.0

    for addr, direction in wallet_positions.items():
        weight = pnl_by_addr.get(addr, 1.0)
        top_pnl = max(top_pnl, weight)
        if direction == "YES":
            yes_weight += weight
            yes_count += 1
        else:
            no_weight += weight
            no_count += 1

    total_weight = yes_weight + no_weight
    if total_weight <= 0:
        return None

    yes_pct = yes_weight / total_weight
    no_pct = no_weight / total_weight

    if yes_pct > no_pct:
        consensus_dir = "YES"
        strength = yes_pct
    elif no_pct > yes_pct:
        consensus_dir = "NO"
        strength = no_pct
    else:
        consensus_dir = "SPLIT"
        strength = 0.5

    wallet_styles: dict[str, int] = {}
    try:
        style_result = (
            supabase.table("wallet_profiles")
            .select("address, trading_patterns")
            .in_("address", list(wallet_positions.keys()))
            .execute()
        )
        for row in style_result.data or []:
            patterns = row.get("trading_patterns")
            if patterns and isinstance(patterns, dict):
                style = patterns.get("primary_style", "unknown")
                if style != "unknown":
                    wallet_styles[style] = wallet_styles.get(style, 0) + 1
    except Exception:
        pass

    result = {
        "consensus_direction": consensus_dir,
        "consensus_strength": round(strength, 2),
        "wallet_count": len(wallet_positions),
        "total_volume_usd": round(total_volume, 2),
        "top_wallet_pnl": round(top_pnl, 2),
        "breakdown": {"YES": yes_count, "NO": no_count},
    }
    if wallet_styles:
        result["wallet_styles"] = wallet_styles
    return result


def persist_smart_money(condition_id: str, consensus: dict) -> None:
    """Upsert consensus data into prediction_smart_money for frontend reads."""
    try:
        supabase.table("prediction_smart_money").upsert(
            {
                "condition_id": condition_id,
                "consensus_direction": consensus["consensus_direction"],
                "consensus_strength": consensus["consensus_strength"],
                "wallet_count": consensus["wallet_count"],
                "total_volume_usd": consensus["total_volume_usd"],
                "top_wallet_pnl": consensus["top_wallet_pnl"],
                "breakdown_yes": consensus["breakdown"]["YES"],
                "breakdown_no": consensus["breakdown"]["NO"],
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
            on_conflict="condition_id",
        ).execute()
    except Exception as e:
        logger.warning("smart_money: persist failed for {} — {}", condition_id, e)


def format_smart_money_context(consensus: dict) -> str:
    """Format consensus data into a string for the scoring prompt.

    Includes wallet trading style annotations when pattern data is available,
    so the model can weigh contrarian vs momentum traders differently.
    """
    base = (
        f"SMART MONEY: {consensus['wallet_count']} top wallets "
        f"(>{MIN_WIN_RATE * 100:.0f}% win rate, profitable) — "
        f"{consensus['breakdown']['YES']} YES / {consensus['breakdown']['NO']} NO, "
        f"consensus {consensus['consensus_strength'] * 100:.0f}% {consensus['consensus_direction']}, "
        f"${consensus['total_volume_usd']:,.0f} total volume. "
        f"Top wallet: ${consensus['top_wallet_pnl']:,.0f} cumulative PnL."
    )

    styles = consensus.get("wallet_styles")
    if styles:
        style_parts = []
        for style, count in styles.items():
            style_parts.append(f"{count} {style}")
        base += f" Styles: {', '.join(style_parts)}."

    return base
