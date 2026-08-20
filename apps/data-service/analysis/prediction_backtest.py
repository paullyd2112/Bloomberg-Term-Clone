"""
Deterministic prediction market backtest — zero Claude API cost.

Replays historical prediction market data from Supabase (raw_prices,
prediction_price_history) through the full guardrail stack and a set of
deterministic scoring strategies, then evaluates outcomes using the same
resolution logic as production (settlement + price drift + ratchet).

Strategies tested:
  1. Momentum — YES price trending up → YES, down → NO
  2. Mean reversion — overextended price → fade back toward 0.50
  3. Smart money follow — align with wallet consensus when available
  4. Volume spike — large volume increase + directional price move
  5. Expiry fade — near-close markets with skewed pricing

Usage:
    POST /backtest/predictions
    POST /backtest/predictions?strategy=momentum&min_confidence=65

Or programmatically:
    from analysis.prediction_backtest import run_prediction_backtest
    results = run_prediction_backtest()
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal

from loguru import logger

from supabase_client import supabase
from scoring.prediction_filters import (
    run_prediction_guardrails,
    infer_category,
)

OUTPUT_DIR = Path("/tmp/prediction_backtest")

# Resolution constants (mirror resolver.py)
DRIFT_THRESHOLD = 0.15
AGED_DRIFT_THRESHOLD = 0.10
AGED_DAYS = 30
RATCHET_TRIGGER = 0.20
RATCHET_FLOOR = 0.15

# Backtest sampling
SAMPLE_INTERVAL_HOURS = 12
MIN_HISTORY_POINTS = 6
LOOKAHEAD_DAYS = 14

# Strategy confidence scaling
BASE_CONFIDENCE = 55


# ─── Data structures ────────────────────────────────────────────────────────

@dataclass
class BacktestSignal:
    strategy: str
    condition_id: str
    market_title: str
    category: str
    direction: Literal["YES", "NO", "HOLD"]
    confidence: int
    entry_price: float
    entry_time: str
    reasoning: str
    outcome: str = "PENDING"
    outcome_price: float | None = None
    peak_favorable: float = 0.0
    resolution_method: str = ""
    pnl_pp: float = 0.0  # profit/loss in probability points


@dataclass
class StrategyResult:
    strategy: str
    total_signals: int = 0
    wins: int = 0
    losses: int = 0
    neutrals: int = 0
    pending: int = 0
    win_rate: float = 0.0
    avg_confidence: float = 0.0
    avg_pnl_pp: float = 0.0
    profit_factor: float = 0.0
    signals: list[BacktestSignal] = field(default_factory=list)


@dataclass
class BacktestReport:
    run_at: str = ""
    date_range: str = ""
    markets_scanned: int = 0
    guardrail_filtered: int = 0
    markets_scored: int = 0
    strategies: dict[str, StrategyResult] = field(default_factory=dict)
    best_strategy: str = ""
    best_win_rate: float = 0.0


# ─── Data fetching ──────────────────────────────────────────────────────────

def _fetch_all_prediction_markets() -> list[dict]:
    """Fetch all distinct prediction markets that have been ingested.

    Uses prediction_price_history to discover condition_ids (smaller/faster
    than scanning raw_prices), then fetches metadata from raw_prices for
    each discovered market.
    """
    try:
        # Step 1: get distinct condition_ids from price history
        hist_result = (
            supabase.table("prediction_price_history")
            .select("condition_id")
            .order("captured_at", desc=True)
            .limit(10000)
            .execute()
        )
        seen = set()
        condition_ids = []
        for row in hist_result.data or []:
            cid = row["condition_id"]
            if cid not in seen:
                seen.add(cid)
                condition_ids.append(cid)

        logger.info("Found {} distinct condition_ids in price history", len(condition_ids))
        if not condition_ids:
            return []

        # Step 2: fetch metadata for each market from raw_prices (batched)
        markets = []
        batch_size = 50
        for i in range(0, len(condition_ids), batch_size):
            batch = condition_ids[i:i + batch_size]
            try:
                result = (
                    supabase.table("raw_prices")
                    .select("identifier, metadata")
                    .eq("asset_type", "prediction")
                    .in_("identifier", batch)
                    .order("captured_at", desc=True)
                    .limit(batch_size * 3)
                    .execute()
                )
                batch_seen = set()
                for row in result.data or []:
                    ident = row["identifier"]
                    if ident not in batch_seen:
                        batch_seen.add(ident)
                        markets.append(row)
            except Exception as e:
                logger.warning("Failed to fetch metadata batch {}: {}", i, e)
                # Still include these markets with empty metadata
                for cid in batch:
                    if cid not in {m["identifier"] for m in markets}:
                        markets.append({"identifier": cid, "metadata": {}})

        logger.info("Fetched metadata for {} markets", len(markets))
        return markets
    except Exception as e:
        logger.error("Failed to fetch prediction markets: {}", e)
        return []


def _fetch_price_history(condition_id: str) -> list[dict]:
    """Fetch full price history for a market from prediction_price_history."""
    all_rows = []
    page_size = 1000
    offset = 0
    try:
        while True:
            result = (
                supabase.table("prediction_price_history")
                .select("yes_price, no_price, volume, captured_at")
                .eq("condition_id", condition_id)
                .order("captured_at", desc=False)
                .range(offset, offset + page_size - 1)
                .execute()
            )
            rows = result.data or []
            all_rows.extend(rows)
            if len(rows) < page_size:
                break
            offset += page_size
        return all_rows
    except Exception as e:
        logger.error("Failed to fetch price history for {}: {}", condition_id, e)
        return []


def _fetch_smart_money_for_market(condition_id: str) -> dict | None:
    """Fetch persisted smart money consensus if available."""
    try:
        result = (
            supabase.table("prediction_smart_money")
            .select("*")
            .eq("condition_id", condition_id)
            .limit(1)
            .execute()
        )
        return result.data[0] if result.data else None
    except Exception:
        return None


def _fetch_settled_outcomes() -> dict[str, str]:
    """Fetch all resolved prediction signals to use as ground truth."""
    try:
        result = (
            supabase.table("signals")
            .select("identifier, direction, outcome, price_at_signal, outcome_price")
            .eq("asset_type", "prediction")
            .in_("outcome", ["WIN", "LOSS", "NEUTRAL"])
            .execute()
        )
        outcomes = {}
        for row in result.data or []:
            outcomes[row["identifier"]] = row
        return outcomes
    except Exception:
        return {}


# ─── Resolution logic (mirrors resolver.py, fully offline) ──────────────────

def _resolve_signal(
    signal: BacktestSignal,
    history: list[dict],
) -> BacktestSignal:
    """Resolve a backtest signal using price history after entry time.

    Uses the same drift + ratchet logic as production resolver.py.
    """
    entry_dt = datetime.fromisoformat(signal.entry_time.replace("Z", "+00:00"))
    future_prices = []
    for row in history:
        ts = datetime.fromisoformat(str(row["captured_at"]).replace("Z", "+00:00"))
        if ts > entry_dt:
            future_prices.append((ts, float(row["yes_price"])))

    if not future_prices:
        signal.outcome = "PENDING"
        signal.resolution_method = "no_future_data"
        return signal

    entry = signal.entry_price
    peak_favorable = 0.0
    age_days = (future_prices[-1][0] - entry_dt).total_seconds() / 86400

    for ts, price in future_prices:
        if signal.direction == "YES":
            drift = price - entry
        else:
            drift = entry - price

        if drift > peak_favorable:
            peak_favorable = drift

    signal.peak_favorable = round(peak_favorable, 4)

    # Ratchet: if peak was >= RATCHET_TRIGGER and current reverted below RATCHET_FLOOR
    if peak_favorable >= RATCHET_TRIGGER:
        last_price = future_prices[-1][1]
        if signal.direction == "YES":
            current_drift = last_price - entry
        else:
            current_drift = entry - last_price

        if current_drift >= RATCHET_FLOOR:
            signal.outcome = "WIN"
            signal.outcome_price = last_price
            signal.resolution_method = "ratchet_win"
            signal.pnl_pp = round(current_drift * 100, 1)
            return signal
        else:
            signal.outcome = "WIN"
            signal.outcome_price = last_price
            signal.resolution_method = "ratchet_floor"
            signal.pnl_pp = round(RATCHET_FLOOR * 100, 1)
            return signal

    # Standard drift resolution
    threshold = AGED_DRIFT_THRESHOLD if age_days >= AGED_DAYS else DRIFT_THRESHOLD

    last_price = future_prices[-1][1]
    if signal.direction == "YES":
        final_drift = last_price - entry
    else:
        final_drift = entry - last_price

    if final_drift >= threshold:
        signal.outcome = "WIN"
        signal.outcome_price = last_price
        signal.resolution_method = "drift_win"
        signal.pnl_pp = round(final_drift * 100, 1)
    elif final_drift <= -threshold:
        signal.outcome = "LOSS"
        signal.outcome_price = last_price
        signal.resolution_method = "drift_loss"
        signal.pnl_pp = round(final_drift * 100, 1)
    elif age_days >= LOOKAHEAD_DAYS:
        signal.outcome = "NEUTRAL"
        signal.outcome_price = last_price
        signal.resolution_method = "expired"
        signal.pnl_pp = round(final_drift * 100, 1)
    else:
        signal.outcome = "PENDING"
        signal.resolution_method = "insufficient_data"

    return signal


# ─── Deterministic scoring strategies ───────────────────────────────────────

def _compute_momentum(history: list[dict], idx: int, lookback: int = 24) -> dict | None:
    """Compute YES price momentum over `lookback` data points ending at idx."""
    if idx < lookback:
        return None
    window = history[idx - lookback : idx + 1]
    first_price = float(window[0]["yes_price"])
    last_price = float(window[-1]["yes_price"])
    if first_price <= 0:
        return None
    delta = last_price - first_price
    return {
        "delta": delta,
        "delta_pp": delta * 100,
        "start_price": first_price,
        "end_price": last_price,
    }


def _compute_volatility(history: list[dict], idx: int, lookback: int = 48) -> float:
    """Compute price volatility (std dev of changes) over lookback window."""
    if idx < lookback:
        return 0.0
    window = history[idx - lookback : idx + 1]
    prices = [float(r["yes_price"]) for r in window]
    if len(prices) < 3:
        return 0.0
    changes = [prices[i] - prices[i - 1] for i in range(1, len(prices))]
    mean_c = sum(changes) / len(changes)
    var = sum((c - mean_c) ** 2 for c in changes) / len(changes)
    return var ** 0.5


def _compute_volume_spike(history: list[dict], idx: int, lookback: int = 48) -> float | None:
    """Compute volume ratio vs rolling average. Returns None if no volume data."""
    if idx < lookback:
        return None
    window = history[idx - lookback : idx]
    volumes = [float(r.get("volume") or 0) for r in window]
    current_vol = float(history[idx].get("volume") or 0)
    avg_vol = sum(volumes) / len(volumes) if volumes else 0
    if avg_vol <= 0:
        return None
    return current_vol / avg_vol


def strategy_momentum(
    history: list[dict],
    idx: int,
    meta: dict,
) -> BacktestSignal | None:
    """Momentum strategy: sustained directional move → follow the trend.

    YES price trending up (>5pp in 24 snapshots) → YES signal.
    YES price trending down (>5pp) → NO signal.
    """
    mom = _compute_momentum(history, idx, lookback=24)
    if mom is None:
        return None

    delta_pp = mom["delta_pp"]
    if abs(delta_pp) < 5.0:
        return None

    direction = "YES" if delta_pp > 0 else "NO"

    # Scale confidence: 5pp = 60, 10pp = 70, 15pp+ = 80
    confidence = min(80, int(BASE_CONFIDENCE + abs(delta_pp)))

    vol = _compute_volatility(history, idx)
    if vol > 0.03:
        confidence -= 5  # high vol = less reliable trend

    return BacktestSignal(
        strategy="momentum",
        condition_id="",
        market_title=meta.get("title", ""),
        category=infer_category(meta.get("title", ""), meta.get("event_slug", "")),
        direction=direction,
        confidence=confidence,
        entry_price=float(history[idx]["yes_price"]),
        entry_time=str(history[idx]["captured_at"]),
        reasoning=(
            f"YES price moved {delta_pp:+.1f}pp over 24 snapshots "
            f"({mom['start_price']:.3f} → {mom['end_price']:.3f}). "
            f"Volatility: {vol:.4f}."
        ),
    )


def strategy_mean_reversion(
    history: list[dict],
    idx: int,
    meta: dict,
) -> BacktestSignal | None:
    """Mean reversion: extreme prices tend to revert toward fair value.

    YES > 0.85 → NO (overbought, limited upside).
    YES < 0.15 → YES (oversold, limited downside).
    Skip the 0.30-0.70 range (no clear reversion signal).
    """
    price = float(history[idx]["yes_price"])

    if price > 0.85:
        direction = "NO"
        confidence = int(BASE_CONFIDENCE + (price - 0.85) * 200)
    elif price < 0.15:
        direction = "YES"
        confidence = int(BASE_CONFIDENCE + (0.15 - price) * 200)
    else:
        return None

    confidence = min(85, max(55, confidence))

    # Check if price has been stable at extreme (less likely to revert)
    mom = _compute_momentum(history, idx, lookback=24)
    if mom and abs(mom["delta_pp"]) < 1.0:
        confidence -= 10  # stable extreme = the market is settled, don't fight it

    if confidence < 55:
        return None

    return BacktestSignal(
        strategy="mean_reversion",
        condition_id="",
        market_title=meta.get("title", ""),
        category=infer_category(meta.get("title", ""), meta.get("event_slug", "")),
        direction=direction,
        confidence=confidence,
        entry_price=price,
        entry_time=str(history[idx]["captured_at"]),
        reasoning=(
            f"YES price at {price:.3f} — {'overbought' if direction == 'NO' else 'oversold'}, "
            f"expecting reversion. 24h momentum: {mom['delta_pp']:+.1f}pp."
            if mom else f"YES price at {price:.3f} — extreme, expecting reversion."
        ),
    )


def strategy_volume_spike(
    history: list[dict],
    idx: int,
    meta: dict,
) -> BacktestSignal | None:
    """Volume spike + directional price move → follow the flow.

    Requires volume >= 3x rolling average AND a concurrent price move >= 3pp.
    """
    vol_ratio = _compute_volume_spike(history, idx, lookback=48)
    if vol_ratio is None or vol_ratio < 3.0:
        return None

    mom = _compute_momentum(history, idx, lookback=6)
    if mom is None or abs(mom["delta_pp"]) < 3.0:
        return None

    direction = "YES" if mom["delta_pp"] > 0 else "NO"
    confidence = min(80, int(BASE_CONFIDENCE + vol_ratio * 3 + abs(mom["delta_pp"])))

    return BacktestSignal(
        strategy="volume_spike",
        condition_id="",
        market_title=meta.get("title", ""),
        category=infer_category(meta.get("title", ""), meta.get("event_slug", "")),
        direction=direction,
        confidence=confidence,
        entry_price=float(history[idx]["yes_price"]),
        entry_time=str(history[idx]["captured_at"]),
        reasoning=(
            f"Volume spike {vol_ratio:.1f}x average with {mom['delta_pp']:+.1f}pp "
            f"price move over 6 snapshots."
        ),
    )


def strategy_expiry_fade(
    history: list[dict],
    idx: int,
    meta: dict,
) -> BacktestSignal | None:
    """Expiry fade: near-close markets with skewed pricing.

    Markets within 48h of close with YES price strongly skewed from 0.50
    get a signal in the skew direction (market is pricing in a likely outcome,
    fade the remaining uncertainty premium).
    """
    end_date_str = meta.get("end_date") or meta.get("close_time")
    if not end_date_str:
        return None

    try:
        end_dt = datetime.fromisoformat(str(end_date_str).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None

    current_time = datetime.fromisoformat(
        str(history[idx]["captured_at"]).replace("Z", "+00:00")
    )
    hours_left = (end_dt - current_time).total_seconds() / 3600

    if hours_left <= 0 or hours_left > 48:
        return None

    price = float(history[idx]["yes_price"])
    skew = price - 0.50

    if abs(skew) < 0.10:
        return None

    direction = "YES" if skew > 0 else "NO"

    # Closer to expiry + larger skew = higher confidence
    time_boost = max(0, int((48 - hours_left) / 6))
    skew_boost = int(abs(skew) * 100)
    confidence = min(85, BASE_CONFIDENCE + time_boost + skew_boost)

    return BacktestSignal(
        strategy="expiry_fade",
        condition_id="",
        market_title=meta.get("title", ""),
        category=infer_category(meta.get("title", ""), meta.get("event_slug", "")),
        direction=direction,
        confidence=confidence,
        entry_price=price,
        entry_time=str(history[idx]["captured_at"]),
        reasoning=(
            f"Market closes in {hours_left:.0f}h with YES at {price:.3f} "
            f"(skew {skew:+.2f} from mid). Fading uncertainty premium."
        ),
    )


def strategy_smart_money(
    history: list[dict],
    idx: int,
    meta: dict,
    smart_money: dict | None,
) -> BacktestSignal | None:
    """Follow smart money consensus when strong (>= 70% strength, 3+ wallets).

    Only fires if smart money consensus aligns with or opposes current price direction.
    """
    if not smart_money:
        return None

    strength = float(smart_money.get("consensus_strength", 0))
    wallet_count = int(smart_money.get("wallet_count", 0))
    consensus_dir = smart_money.get("consensus_direction", "SPLIT")

    if strength < 0.70 or wallet_count < 3 or consensus_dir == "SPLIT":
        return None

    price = float(history[idx]["yes_price"])

    # Smart money says YES but price is low → the edge
    if consensus_dir == "YES" and price < 0.60:
        direction = "YES"
        confidence = min(80, int(BASE_CONFIDENCE + strength * 20 + wallet_count))
    elif consensus_dir == "NO" and price > 0.40:
        direction = "NO"
        confidence = min(80, int(BASE_CONFIDENCE + strength * 20 + wallet_count))
    else:
        return None

    return BacktestSignal(
        strategy="smart_money",
        condition_id="",
        market_title=meta.get("title", ""),
        category=infer_category(meta.get("title", ""), meta.get("event_slug", "")),
        direction=direction,
        confidence=confidence,
        entry_price=price,
        entry_time=str(history[idx]["captured_at"]),
        reasoning=(
            f"Smart money consensus: {wallet_count} wallets at "
            f"{strength * 100:.0f}% {consensus_dir}. "
            f"Current YES price {price:.3f}."
        ),
    )


ALL_STRATEGIES = {
    "momentum": strategy_momentum,
    "mean_reversion": strategy_mean_reversion,
    "volume_spike": strategy_volume_spike,
    "expiry_fade": strategy_expiry_fade,
}


# ─── Main backtest engine ──────────────────────────────────────────────────

def _run_strategies_on_market(
    condition_id: str,
    meta: dict,
    history: list[dict],
    strategies: list[str] | None = None,
    min_confidence: int = 60,
    smart_money: dict | None = None,
) -> list[BacktestSignal]:
    """Run all (or selected) strategies on a single market's history."""
    if len(history) < MIN_HISTORY_POINTS:
        return []

    strat_fns = {k: v for k, v in ALL_STRATEGIES.items()
                 if strategies is None or k in strategies}
    if (strategies is None or "smart_money" in strategies) and smart_money:
        strat_fns["smart_money"] = None  # handled specially

    signals = []
    # Sample every SAMPLE_INTERVAL_HOURS worth of data points
    # prediction_price_history has ~2 rows/hour (every 30 min)
    step = max(1, SAMPLE_INTERVAL_HOURS * 2)

    for idx in range(48, len(history) - 1, step):  # 48 = 24h warmup
        yes_price = float(history[idx].get("yes_price", 0))
        no_price = float(history[idx].get("no_price") or (1 - yes_price))

        # Apply guardrails
        passed, reason = run_prediction_guardrails(
            identifier=condition_id,
            yes_price=yes_price,
            no_price=no_price,
            volume_24h=history[idx].get("volume"),
            metadata=meta,
        )
        if not passed:
            continue

        for name, fn in strat_fns.items():
            if name == "smart_money":
                sig = strategy_smart_money(history, idx, meta, smart_money)
            else:
                sig = fn(history, idx, meta)

            if sig is None:
                continue
            if sig.confidence < min_confidence:
                continue

            sig.condition_id = condition_id

            # Resolve against future data
            sig = _resolve_signal(sig, history)
            if sig.outcome != "PENDING":
                signals.append(sig)

    return signals


def _compute_strategy_results(signals: list[BacktestSignal]) -> dict[str, StrategyResult]:
    """Aggregate signals by strategy."""
    by_strategy: dict[str, list[BacktestSignal]] = {}
    for sig in signals:
        by_strategy.setdefault(sig.strategy, []).append(sig)

    results = {}
    for name, sigs in by_strategy.items():
        r = StrategyResult(strategy=name, signals=sigs)
        r.total_signals = len(sigs)
        r.wins = sum(1 for s in sigs if s.outcome == "WIN")
        r.losses = sum(1 for s in sigs if s.outcome == "LOSS")
        r.neutrals = sum(1 for s in sigs if s.outcome == "NEUTRAL")
        r.pending = sum(1 for s in sigs if s.outcome == "PENDING")

        decided = r.wins + r.losses
        r.win_rate = round(r.wins / decided * 100, 1) if decided else 0.0

        confidences = [s.confidence for s in sigs]
        r.avg_confidence = round(sum(confidences) / len(confidences), 1) if confidences else 0.0

        pnls = [s.pnl_pp for s in sigs if s.outcome in ("WIN", "LOSS")]
        r.avg_pnl_pp = round(sum(pnls) / len(pnls), 1) if pnls else 0.0

        gross_profit = sum(s.pnl_pp for s in sigs if s.outcome == "WIN")
        gross_loss = abs(sum(s.pnl_pp for s in sigs if s.outcome == "LOSS"))
        r.profit_factor = round(gross_profit / gross_loss, 2) if gross_loss > 0 else (
            float("inf") if gross_profit > 0 else 0.0
        )

        results[name] = r

    return results


def run_prediction_backtest(
    strategies: list[str] | None = None,
    min_confidence: int = 60,
    max_markets: int = 500,
) -> BacktestReport:
    """Run the full prediction market backtest.

    Args:
        strategies: List of strategy names to test (None = all).
        min_confidence: Minimum confidence threshold for signals.
        max_markets: Maximum number of markets to process.

    Returns:
        BacktestReport with per-strategy results and signals.
    """
    report = BacktestReport(
        run_at=datetime.now(timezone.utc).isoformat(),
    )

    logger.info("Prediction backtest: fetching all markets...")
    markets = _fetch_all_prediction_markets()
    report.markets_scanned = len(markets)
    logger.info("Found {} distinct prediction markets", len(markets))

    if not markets:
        logger.warning("No prediction markets found — nothing to backtest")
        return report

    all_signals: list[BacktestSignal] = []
    markets_with_history = 0
    guardrail_filtered = 0

    for i, market in enumerate(markets[:max_markets]):
        condition_id = market["identifier"]
        meta = market.get("metadata") or {}

        if (i + 1) % 50 == 0:
            logger.info("Processing market {}/{}", i + 1, min(len(markets), max_markets))

        history = _fetch_price_history(condition_id)
        if len(history) < MIN_HISTORY_POINTS:
            continue

        markets_with_history += 1

        # Fetch smart money data if that strategy is requested
        smart_money = None
        if strategies is None or "smart_money" in strategies:
            smart_money = _fetch_smart_money_for_market(condition_id)

        sigs = _run_strategies_on_market(
            condition_id=condition_id,
            meta=meta,
            history=history,
            strategies=strategies,
            min_confidence=min_confidence,
            smart_money=smart_money,
        )
        all_signals.extend(sigs)

    report.markets_scored = markets_with_history
    report.guardrail_filtered = report.markets_scanned - markets_with_history

    date_range_start = min((s.entry_time for s in all_signals), default="N/A")
    date_range_end = max((s.entry_time for s in all_signals), default="N/A")
    report.date_range = f"{date_range_start[:10]} to {date_range_end[:10]}"

    report.strategies = _compute_strategy_results(all_signals)

    if report.strategies:
        best = max(
            report.strategies.values(),
            key=lambda r: (r.win_rate if (r.wins + r.losses) >= 10 else 0, r.profit_factor),
        )
        report.best_strategy = best.strategy
        report.best_win_rate = best.win_rate

    # Write results to disk
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output_path = OUTPUT_DIR / "prediction_backtest_results.json"
    serializable = _report_to_dict(report)
    output_path.write_text(json.dumps(serializable, indent=2, default=str))
    logger.info("Results written to {}", output_path)

    _print_report(report)

    return report


def _report_to_dict(report: BacktestReport) -> dict:
    """Convert report to JSON-serializable dict (strip signal lists for summary)."""
    d = {
        "run_at": report.run_at,
        "date_range": report.date_range,
        "markets_scanned": report.markets_scanned,
        "guardrail_filtered": report.guardrail_filtered,
        "markets_scored": report.markets_scored,
        "best_strategy": report.best_strategy,
        "best_win_rate": report.best_win_rate,
        "strategies": {},
    }
    for name, sr in report.strategies.items():
        d["strategies"][name] = {
            "total_signals": sr.total_signals,
            "wins": sr.wins,
            "losses": sr.losses,
            "neutrals": sr.neutrals,
            "pending": sr.pending,
            "win_rate": sr.win_rate,
            "avg_confidence": sr.avg_confidence,
            "avg_pnl_pp": sr.avg_pnl_pp,
            "profit_factor": sr.profit_factor,
            "sample_signals": [asdict(s) for s in sr.signals[:10]],
        }
    return d


def _print_report(report: BacktestReport) -> None:
    """Print a formatted summary to the logger."""
    logger.info("=" * 70)
    logger.info("PREDICTION MARKET BACKTEST RESULTS")
    logger.info("=" * 70)
    logger.info("Run at:             {}", report.run_at)
    logger.info("Date range:         {}", report.date_range)
    logger.info("Markets scanned:    {}", report.markets_scanned)
    logger.info("Markets scored:     {}", report.markets_scored)
    logger.info("Guardrail filtered: {}", report.guardrail_filtered)
    logger.info("-" * 70)

    for name, sr in sorted(report.strategies.items(),
                           key=lambda x: x[1].win_rate, reverse=True):
        decided = sr.wins + sr.losses
        logger.info(
            "{:<18} | {:>3} signals | {:>3}W {:>3}L {:>3}N | "
            "WR {:>5.1f}% | PF {:>5.2f} | avg conf {:>4.1f} | avg PnL {:>+5.1f}pp",
            name, sr.total_signals, sr.wins, sr.losses, sr.neutrals,
            sr.win_rate, sr.profit_factor, sr.avg_confidence, sr.avg_pnl_pp,
        )

    logger.info("-" * 70)
    if report.best_strategy:
        logger.info(
            "BEST: {} ({:.1f}% win rate)",
            report.best_strategy, report.best_win_rate,
        )
    logger.info("=" * 70)
