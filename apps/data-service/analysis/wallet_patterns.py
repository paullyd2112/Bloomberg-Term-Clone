"""Trader Behavior Patterns — deterministic analysis of wallet_trades data.

Classifies trading styles (momentum, contrarian, scalper, swing, specialist),
detects timing patterns (preferred hours, day-of-week), and analyzes position
sizing behavior. Results stored in wallet_profiles.trading_patterns jsonb.

Zero API cost — all computation is from DB aggregates.
"""

from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone

from loguru import logger

from supabase_client import supabase

MOMENTUM_THRESHOLD = 0.60
CONTRARIAN_THRESHOLD = 0.60
SCALPER_AVG_HOLD_H = 4
SWING_AVG_HOLD_H = 48
SPECIALIST_CATEGORY_PCT = 0.70
MIN_TRADES_FOR_PATTERNS = 10


def _classify_trading_style(trades: list[dict], price_movements: dict[str, str]) -> dict:
    """Classify a wallet's trading style based on trade direction vs price movement.

    price_movements maps condition_id -> "up" | "down" based on 24h price change
    at time of trade.
    """
    if not trades:
        return {"primary_style": "unknown", "styles": {}}

    momentum_count = 0
    contrarian_count = 0
    matched = 0

    for t in trades:
        cid = t.get("condition_id", "")
        movement = price_movements.get(cid)
        if not movement:
            continue

        matched += 1
        direction = t.get("direction", "")

        if (direction == "YES" and movement == "up") or (direction == "NO" and movement == "down"):
            momentum_count += 1
        else:
            contrarian_count += 1

    if matched == 0:
        return {"primary_style": "unknown", "styles": {}}

    momentum_pct = momentum_count / matched
    contrarian_pct = contrarian_count / matched

    styles: dict[str, float] = {}
    if momentum_pct >= MOMENTUM_THRESHOLD:
        styles["momentum_trader"] = round(momentum_pct, 3)
    if contrarian_pct >= CONTRARIAN_THRESHOLD:
        styles["contrarian"] = round(contrarian_pct, 3)

    primary = "momentum_trader" if momentum_pct > contrarian_pct else "contrarian"
    if momentum_pct < MOMENTUM_THRESHOLD and contrarian_pct < CONTRARIAN_THRESHOLD:
        primary = "mixed"

    return {"primary_style": primary, "styles": styles, "matched_trades": matched}


def _analyze_hold_times(trades: list[dict]) -> dict:
    """Estimate hold times from trade timestamps grouped by market.

    Approximation: for each market, compute time between first and last trade
    as a proxy for hold duration.
    """
    by_market: dict[str, list[str]] = {}
    for t in trades:
        cid = t.get("condition_id", "")
        ts = t.get("traded_at")
        if cid and ts:
            by_market.setdefault(cid, []).append(ts)

    hold_hours: list[float] = []
    for cid, timestamps in by_market.items():
        if len(timestamps) < 2:
            continue
        try:
            parsed = []
            for ts in timestamps:
                if isinstance(ts, str):
                    ts_clean = ts.replace("Z", "+00:00")
                    parsed.append(datetime.fromisoformat(ts_clean))
                elif isinstance(ts, datetime):
                    parsed.append(ts)
            if len(parsed) < 2:
                continue
            parsed.sort()
            delta = (parsed[-1] - parsed[0]).total_seconds() / 3600
            hold_hours.append(delta)
        except (ValueError, TypeError):
            continue

    if not hold_hours:
        return {"avg_hold_hours": None, "hold_style": "unknown"}

    avg_hold = sum(hold_hours) / len(hold_hours)

    if avg_hold < SCALPER_AVG_HOLD_H:
        hold_style = "scalper"
    elif avg_hold > SWING_AVG_HOLD_H:
        hold_style = "swing_trader"
    else:
        hold_style = "position_trader"

    return {
        "avg_hold_hours": round(avg_hold, 1),
        "min_hold_hours": round(min(hold_hours), 1),
        "max_hold_hours": round(max(hold_hours), 1),
        "hold_style": hold_style,
        "markets_measured": len(hold_hours),
    }


def _analyze_timing(trades: list[dict]) -> dict:
    """Detect preferred trading hours and day-of-week patterns."""
    hours: list[int] = []
    days: list[int] = []

    for t in trades:
        ts = t.get("traded_at")
        if not ts:
            continue
        try:
            if isinstance(ts, str):
                ts = ts.replace("Z", "+00:00")
                dt = datetime.fromisoformat(ts)
            elif isinstance(ts, datetime):
                dt = ts
            else:
                continue
            hours.append(dt.hour)
            days.append(dt.weekday())
        except (ValueError, TypeError):
            continue

    if not hours:
        return {}

    hour_counts = Counter(hours)
    day_counts = Counter(days)

    top_hours = [h for h, _ in hour_counts.most_common(3)]
    top_days = [d for d, _ in day_counts.most_common(3)]

    day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

    total = len(hours)
    peak_hour_pct = hour_counts.most_common(1)[0][1] / total if total else 0

    return {
        "preferred_hours_utc": top_hours,
        "preferred_days": [day_names[d] for d in top_days],
        "peak_hour_concentration": round(peak_hour_pct, 3),
        "hour_distribution": {str(h): c for h, c in sorted(hour_counts.items())},
        "day_distribution": {day_names[d]: c for d, c in sorted(day_counts.items())},
        "total_timed_trades": total,
    }


def _analyze_sizing(trades: list[dict]) -> dict:
    """Analyze position sizing patterns — fixed vs conviction-scaled."""
    sizes = []
    for t in trades:
        usd = t.get("usd_value")
        if usd is not None:
            try:
                sizes.append(float(usd))
            except (ValueError, TypeError):
                continue

    if len(sizes) < 3:
        return {}

    avg_size = sum(sizes) / len(sizes)
    variance = sum((s - avg_size) ** 2 for s in sizes) / len(sizes)
    std_dev = variance ** 0.5
    cv = std_dev / avg_size if avg_size > 0 else 0

    if cv < 0.3:
        sizing_style = "fixed_size"
    elif cv < 0.7:
        sizing_style = "moderate_variance"
    else:
        sizing_style = "conviction_scaled"

    sorted_sizes = sorted(sizes)
    median = sorted_sizes[len(sorted_sizes) // 2]

    size_buckets = {"small": 0, "medium": 0, "large": 0}
    for s in sizes:
        if s < avg_size * 0.5:
            size_buckets["small"] += 1
        elif s > avg_size * 1.5:
            size_buckets["large"] += 1
        else:
            size_buckets["medium"] += 1

    return {
        "sizing_style": sizing_style,
        "avg_size_usd": round(avg_size, 2),
        "median_size_usd": round(median, 2),
        "std_dev_usd": round(std_dev, 2),
        "coefficient_of_variation": round(cv, 3),
        "size_buckets": size_buckets,
    }


def _analyze_category_specialization(trades: list[dict]) -> dict:
    """Detect if a wallet specializes in specific market categories."""
    from scoring.prediction_filters import infer_category

    cat_counts: Counter = Counter()
    for t in trades:
        title = t.get("market_title", "")
        cat = infer_category(title) if title else "other"
        if not cat:
            cat = "other"
        cat_counts[cat] += 1

    total = sum(cat_counts.values())
    if total == 0:
        return {"is_specialist": False}

    top_cat, top_count = cat_counts.most_common(1)[0]
    top_pct = top_count / total

    return {
        "is_specialist": top_pct >= SPECIALIST_CATEGORY_PCT,
        "top_category": top_cat,
        "top_category_pct": round(top_pct, 3),
        "category_breakdown": {cat: cnt for cat, cnt in cat_counts.most_common(5)},
    }


def _get_price_movements_for_trades(trades: list[dict]) -> dict[str, str]:
    """Approximate price movement direction for each market at time of trade.

    Groups trades by condition_id, compares the latest and earliest trade
    prices to determine if the market was moving up or down during the
    wallet's trading window. Falls back to "flat" if only one trade exists.
    """
    market_prices: dict[str, list[float]] = {}
    for t in trades:
        cid = t.get("condition_id", "")
        if cid:
            price = float(t.get("price", 0.5))
            if cid not in market_prices:
                market_prices[cid] = []
            market_prices[cid].append(price)

    movements: dict[str, str] = {}
    for cid, prices in market_prices.items():
        if len(prices) < 2:
            movements[cid] = "flat"
        else:
            delta = prices[0] - prices[-1]
            if delta > 0.03:
                movements[cid] = "up"
            elif delta < -0.03:
                movements[cid] = "down"
            else:
                movements[cid] = "flat"
    return movements


def compute_wallet_patterns(address: str) -> dict | None:
    """Compute all behavioral patterns for a single wallet.

    Returns a dict of pattern data, or None if insufficient trades.
    """
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
        logger.error("wallet_patterns: query failed for {} — {}", address[:10], e)
        return None

    trades = result.data or []
    if len(trades) < MIN_TRADES_FOR_PATTERNS:
        return None

    price_movements = _get_price_movements_for_trades(trades)

    style = _classify_trading_style(trades, price_movements)
    hold_times = _analyze_hold_times(trades)
    timing = _analyze_timing(trades)
    sizing = _analyze_sizing(trades)
    specialization = _analyze_category_specialization(trades)

    primary_style = style.get("primary_style", "unknown")
    if hold_times.get("hold_style") == "scalper" and primary_style != "unknown":
        primary_style = "scalper"
    elif hold_times.get("hold_style") == "swing_trader" and primary_style != "unknown":
        primary_style = "swing_trader"

    if specialization.get("is_specialist") and primary_style == "unknown":
        primary_style = "category_specialist"

    patterns = {
        "primary_style": primary_style,
        "trading_style": style,
        "hold_times": hold_times,
        "timing": timing,
        "sizing": sizing,
        "category_specialization": specialization,
        "analyzed_at": datetime.now(timezone.utc).isoformat(),
        "trade_count": len(trades),
    }

    return patterns


def persist_wallet_patterns(address: str, patterns: dict) -> bool:
    """Store computed patterns in wallet_profiles.trading_patterns jsonb."""
    try:
        supabase.table("wallet_profiles").update({
            "trading_patterns": patterns,
        }).eq("address", address).execute()
        return True
    except Exception as e:
        logger.error("wallet_patterns: persist failed for {} — {}", address[:10], e)
        return False


def analyze_all_wallets(max_wallets: int = 50) -> str:
    """Compute and persist behavior patterns for wallets with sufficient trades.

    Targets wallets ordered by last activity, skipping those analyzed in the
    last 24 hours.
    """
    try:
        profiles = (
            supabase.table("wallet_profiles")
            .select("address, total_trades, trading_patterns")
            .gte("total_trades", MIN_TRADES_FOR_PATTERNS)
            .order("last_active_at", desc=True)
            .limit(max_wallets)
            .execute()
        )
    except Exception as e:
        logger.error("wallet_patterns: failed to query profiles — {}", e)
        return "0 wallets analyzed (query error)"

    wallets = profiles.data or []
    analyzed = 0
    skipped = 0

    for w in wallets:
        existing = w.get("trading_patterns")
        if existing and isinstance(existing, dict):
            analyzed_at = existing.get("analyzed_at")
            if analyzed_at:
                try:
                    ts = analyzed_at.replace("Z", "+00:00")
                    last = datetime.fromisoformat(ts)
                    age_h = (datetime.now(timezone.utc) - last).total_seconds() / 3600
                    if age_h < 24:
                        skipped += 1
                        continue
                except (ValueError, TypeError):
                    pass

        patterns = compute_wallet_patterns(w["address"])
        if patterns:
            persist_wallet_patterns(w["address"], patterns)
            analyzed += 1
            logger.info(
                "wallet_patterns: {} — style={}, trades={}",
                w["address"][:10],
                patterns.get("primary_style"),
                patterns.get("trade_count"),
            )

    return f"{analyzed} wallets analyzed, {skipped} skipped (recently analyzed), {len(wallets)} eligible"


def format_wallet_style_context(patterns: dict) -> str:
    """Format wallet pattern data for the scoring prompt enrichment."""
    style = patterns.get("primary_style", "unknown")
    spec = patterns.get("category_specialization", {})

    parts = [style]
    if spec.get("is_specialist"):
        parts.append(f"{spec['top_category']} specialist")

    sizing = patterns.get("sizing", {})
    if sizing.get("sizing_style"):
        parts.append(sizing["sizing_style"])

    return ", ".join(parts)
