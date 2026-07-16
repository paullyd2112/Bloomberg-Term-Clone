"""Hybrid rules + AI scoring engine — SELL signals are handled entirely by
deterministic pattern-matching ($0), BUY signals are escalated to Claude
for confirmation (saves ~60-70% vs full AI scoring).

Uses the same gate stack as engine.py (SPY regime, RVOL, circuit breaker,
BTC regime, breadth cap, evidence gate) but replaces the Claude call with
pattern-matching against the validated_factors table for SELL/HOLD decisions.

BUY signals are escalated to Claude for a second opinion because the BUY
patterns are newer (partially theoretical, not all empirically validated
at n>=100) and warrant AI confirmation before acting.

Cost: ~$0.50-2/day depending on how many BUY setups trigger.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import sentry_sdk
from loguru import logger

from supabase_client import supabase
from scoring.validated_factors import (
    classify_indicators,
    check_signal_against_evidence,
    VALIDATED_PATTERNS,
    _bucket_rsi,
    _bucket_macd,
    _bucket_sma50,
)

SIGNAL_COOLDOWN_H = 4
ENGINE_CUTOFF = "2026-07-04T11:00:00Z"

STOCK_RVOL_MINIMUM = 1.5
HIGH_BETA_VOLATILITY_WATCHLIST = frozenset({"AMD", "NVDA", "COIN", "SMCI", "AVGO"})
HIGH_BETA_RVOL_MINIMUM = 2.5
MAX_STOCK_SIGNALS_PER_DAY = 3

ESCALATE_TO_AI = True
ESCALATE_BUY_ONLY = True
ESCALATE_CONFIDENCE_RANGE = (45, 60)

# Minimum confidence to emit a signal (below this → HOLD)
RULES_CONFIDENCE_MINIMUM = 55


def _signal_exists_recently(asset_type: str, identifier: str) -> bool:
    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=SIGNAL_COOLDOWN_H)).isoformat()
        result = (
            supabase.table("signals")
            .select("id", count="exact")
            .eq("asset_type", asset_type)
            .eq("identifier", identifier)
            .gte("created_at", cutoff)
            .execute()
        )
        return (result.count or 0) > 0
    except Exception:
        return False


def _stock_signals_today_count() -> int:
    try:
        today_start = datetime.now(timezone.utc).strftime("%Y-%m-%dT00:00:00Z")
        result = (
            supabase.table("signals")
            .select("id", count="exact")
            .eq("asset_type", "stock")
            .gte("created_at", today_start)
            .neq("direction", "HOLD")
            .execute()
        )
        return result.count or 0
    except Exception:
        return 0


# ─── Pattern scoring logic ──────────────────────────────────────────────────

def _score_from_patterns(meta: dict, asset_type: str) -> dict:
    """Score an asset purely from technical indicator patterns.

    Returns dict with direction, confidence, reasoning, time_horizon.
    """
    buckets = classify_indicators(meta)
    rsi_bucket = buckets.get("rsi")
    macd_bucket = buckets.get("macd")
    sma50_bucket = buckets.get("sma50")

    matched_buy = []
    matched_sell = []
    for p in VALIDATED_PATTERNS:
        if all(buckets.get(f) == req for f, req in p["requires"].items()):
            if p["direction"] == "BUY":
                matched_buy.append(p)
            else:
                matched_sell.append(p)

    direction = "HOLD"
    confidence = 50
    reasoning_parts = []
    time_horizon = "swing"

    rsi_val = meta.get("rsi_14")
    macd_hist = meta.get("macd_hist")
    prev_macd = meta.get("prev_macd_hist")
    vs_sma50 = meta.get("price_vs_sma50_pct")
    vol_ratio = meta.get("volume_ratio")

    if matched_buy and not matched_sell:
        direction = "BUY"
        confidence = 55 + min(len(matched_buy) * 8, 25)
        pattern_names = [p["id"] for p in matched_buy]
        reasoning_parts.append(
            f"[Rules engine] Validated BUY pattern(s): {', '.join(pattern_names)}"
        )

        if rsi_val is not None and float(rsi_val) > 70 and macd_bucket == "macd_pos_expanding":
            confidence = min(confidence + 10, 85)
            reasoning_parts.append("RSI >70 with expanding MACD — strong momentum continuation")
        if vs_sma50 is not None and float(vs_sma50) > 15:
            confidence = min(confidence + 5, 85)
            reasoning_parts.append(f"Deep uptrend ({float(vs_sma50):.1f}% above SMA-50)")

    elif matched_sell and not matched_buy:
        direction = "SELL"
        confidence = 55 + min(len(matched_sell) * 8, 25)
        pattern_names = [p["id"] for p in matched_sell]
        reasoning_parts.append(
            f"[Rules engine] Validated SELL pattern(s): {', '.join(pattern_names)}"
        )

        if macd_bucket == "macd_pos_contracting" and rsi_bucket == "rsi_30-45":
            confidence = min(confidence + 10, 85)
            reasoning_parts.append("Weak RSI with contracting MACD — momentum fading in weakness")
        if vs_sma50 is not None and float(vs_sma50) < -5:
            confidence = min(confidence + 5, 85)
            reasoning_parts.append(f"Below SMA-50 by {abs(float(vs_sma50)):.1f}% — downtrend")

    elif matched_buy and matched_sell:
        direction = "HOLD"
        confidence = 50
        reasoning_parts.append(
            "[Rules engine] Mixed signals — BUY and SELL patterns both match, standing aside"
        )

    else:
        direction = "HOLD"
        confidence = 45
        parts = []
        if rsi_bucket:
            parts.append(f"RSI: {rsi_bucket}")
        if macd_bucket:
            parts.append(f"MACD: {macd_bucket}")
        if sma50_bucket:
            parts.append(f"SMA-50: {sma50_bucket}")
        reasoning_parts.append(
            f"[Rules engine] No validated pattern match ({', '.join(parts)}) — no edge detected"
        )

    if vol_ratio is not None:
        try:
            vr = float(vol_ratio)
            if vr > 3.0 and direction == "BUY":
                confidence = min(confidence + 5, 85)
                reasoning_parts.append(f"Volume confirmation: {vr:.1f}x relative volume")
            elif vr < 0.5:
                if direction in ("BUY", "SELL"):
                    confidence = max(confidence - 10, 40)
                    reasoning_parts.append(f"Low volume warning: {vr:.1f}x — thin participation")
        except (TypeError, ValueError):
            pass

    if confidence < RULES_CONFIDENCE_MINIMUM and direction != "HOLD":
        reasoning_parts.append(
            f"Confidence {confidence} below {RULES_CONFIDENCE_MINIMUM} minimum — downgrading to HOLD"
        )
        direction = "HOLD"

    return {
        "direction": direction,
        "confidence": confidence,
        "reasoning": ". ".join(reasoning_parts),
        "time_horizon": time_horizon,
        "matched_buy": [p["id"] for p in matched_buy],
        "matched_sell": [p["id"] for p in matched_sell],
    }


# ─── Gate stack (mirrors engine.py) ──────────────────────────────────────────

def _apply_gates(
    signal: dict,
    asset_type: str,
    identifier: str,
    meta: dict,
    price_row: dict,
    benchmarks: dict,
    btc_regime: dict | None = None,
    breadth_tracker: dict | None = None,
) -> dict:
    """Apply all deterministic gates — returns modified signal dict."""
    signal = dict(signal)

    change = price_row.get("change_24h")
    if change is not None:
        try:
            change_f = float(change)
            if change_f >= 8.0 and signal["direction"] == "SELL":
                signal["direction"] = "HOLD"
                signal["confidence"] = min(signal["confidence"], 45)
                signal["reasoning"] = (
                    f"[Circuit breaker] +{change_f:.1f}% gap up — fading carries extreme risk. "
                    + signal["reasoning"]
                )
            elif change_f <= -8.0 and signal["direction"] == "BUY":
                signal["direction"] = "HOLD"
                signal["confidence"] = min(signal["confidence"], 45)
                signal["reasoning"] = (
                    f"[Circuit breaker] {change_f:.1f}% gap down — catching knife carries extreme risk. "
                    + signal["reasoning"]
                )
        except (TypeError, ValueError):
            pass

    if asset_type == "stock":
        spy_vs_sma50 = benchmarks.get("SPY", {}).get("price_vs_sma50_pct")
        if spy_vs_sma50 is not None:
            if spy_vs_sma50 < -2 and signal["direction"] == "BUY":
                signal["direction"] = "HOLD"
                signal["confidence"] = min(signal["confidence"], 45)
                signal["reasoning"] = (
                    f"[Regime gate] SPY {spy_vs_sma50:.1f}% below SMA-50 — broad downtrend. "
                    + signal["reasoning"]
                )
            elif spy_vs_sma50 > 5 and signal["direction"] == "SELL":
                signal["direction"] = "HOLD"
                signal["confidence"] = min(signal["confidence"], 45)
                signal["reasoning"] = (
                    f"[Regime gate] SPY {spy_vs_sma50:.1f}% above SMA-50 — strong uptrend. "
                    + signal["reasoning"]
                )

    if asset_type == "stock" and signal["direction"] in ("BUY", "SELL"):
        is_high_beta = identifier in HIGH_BETA_VOLATILITY_WATCHLIST
        rvol_threshold = HIGH_BETA_RVOL_MINIMUM if is_high_beta else STOCK_RVOL_MINIMUM
        rvol = meta.get("volume_ratio")
        if rvol is not None:
            try:
                rvol_f = float(rvol)
                if rvol_f < rvol_threshold:
                    tag = "High-beta RVOL" if is_high_beta else "RVOL"
                    signal["direction"] = "HOLD"
                    signal["confidence"] = min(signal["confidence"], 40)
                    signal["reasoning"] = (
                        f"[{tag} gate] {rvol_f:.2f}x < {rvol_threshold:.1f}x minimum. "
                        + signal["reasoning"]
                    )
            except (TypeError, ValueError):
                pass

    if (asset_type == "stock" and identifier in HIGH_BETA_VOLATILITY_WATCHLIST
            and signal["direction"] == "BUY"):
        qqq_change = benchmarks.get("QQQ", {}).get("change_24h")
        if qqq_change is not None:
            try:
                if float(qqq_change) < 0:
                    signal["direction"] = "HOLD"
                    signal["confidence"] = min(signal["confidence"], 35)
                    signal["reasoning"] = (
                        f"[Sector gate] QQQ {float(qqq_change):.2f}% — no sector tailwind. "
                        + signal["reasoning"]
                    )
            except (TypeError, ValueError):
                pass

    if asset_type == "crypto" and identifier != "BTC" and btc_regime and btc_regime.get("bearish"):
        if signal["direction"] == "BUY":
            signal["direction"] = "HOLD"
            signal["confidence"] = min(signal["confidence"], 45)
            signal["reasoning"] = (
                "[BTC regime gate] BTC MACD bearish — alts follow BTC down. "
                + signal["reasoning"]
            )

    # Crypto concurrent-position + correlation cap — mirrors engine.py. Runs
    # here so a capped BUY is downgraded before it's escalated to Claude,
    # saving the confirmation spend (the engine re-applies it as a backstop).
    if asset_type == "crypto" and signal["direction"] == "BUY":
        from scoring.engine import (
            _open_crypto_buy_positions, _crypto_correlation_block_reason,
        )
        majors_open, alts_open = _open_crypto_buy_positions()
        block_reason = _crypto_correlation_block_reason(identifier, majors_open, alts_open)
        if block_reason:
            signal["direction"] = "HOLD"
            signal["confidence"] = min(signal["confidence"], 45)
            signal["reasoning"] = (
                f"[Correlation cap] {block_reason}. Crypto longs track BTC — stacking "
                f"more concentrates one directional bet. " + signal["reasoning"]
            )

    EXTENDED_VS_SMA50_PCT = 8.0
    MAX_EXTENDED_BUYS = 4
    if asset_type == "stock" and signal["direction"] == "BUY" and breadth_tracker is not None:
        vs_sma50 = meta.get("price_vs_sma50_pct")
        if vs_sma50 is not None and float(vs_sma50) > EXTENDED_VS_SMA50_PCT:
            count = breadth_tracker.get("extended_buys", 0) + 1
            breadth_tracker["extended_buys"] = count
            if count > MAX_EXTENDED_BUYS:
                signal["direction"] = "HOLD"
                signal["confidence"] = min(signal["confidence"], 45)
                signal["reasoning"] = (
                    f"[Breadth gate] {count - 1} extended BUYs this run — correlated momentum. "
                    + signal["reasoning"]
                )

    return signal


# ─── Signal writer ───────────────────────────────────────────────────────────

def _write_rules_signal(
    asset_type: str,
    identifier: str,
    current_price: float,
    signal: dict,
    subscription: str | None = None,
) -> dict | None:
    """Write a rules-engine signal to the signals table."""
    now = datetime.now(timezone.utc).isoformat()
    record = {
        "asset_type": asset_type,
        "identifier": identifier,
        "direction": signal["direction"],
        "confidence": signal["confidence"],
        "reasoning": signal["reasoning"],
        "time_horizon": signal.get("time_horizon", "swing"),
        "entry_price": current_price,
        "current_price": current_price,
        "key_risk": "Rules-based signal — no AI reasoning available",
        "source": "rules_engine",
        "created_at": now,
    }
    if subscription:
        record["subscription"] = subscription

    try:
        result = supabase.table("signals").insert(record).execute()
        if result.data:
            return result.data[0]
    except Exception as e:
        logger.error("{}/{}: rules signal write failed — {}", asset_type, identifier, e)
        sentry_sdk.capture_exception(e)
    return None


# ─── Main scoring function ──────────────────────────────────────────────────

def score_asset_rules(
    asset_type: str,
    identifier: str,
    benchmarks: dict | None = None,
    btc_regime: dict | None = None,
    breadth_tracker: dict | None = None,
    skip_hold: bool = True,
    subscription: str | None = None,
) -> dict | None:
    """Score an asset using the deterministic rules engine.

    Same interface as engine.score_asset() but no Claude call unless
    ESCALATE_TO_AI is True and the score falls in the ambiguous range.
    """
    if _signal_exists_recently(asset_type, identifier):
        return None

    from scoring.price_data import get_scoring_price_row
    price_row = get_scoring_price_row(asset_type, identifier)
    if not price_row:
        logger.warning("{}/{}: no price data — skipping", asset_type, identifier)
        return None

    meta = price_row.get("metadata") or {}
    current_price = price_row.get("price")
    if current_price is None:
        return None
    current_price = float(current_price)

    if meta.get("rsi_14") is None and meta.get("macd_hist") is None:
        logger.warning("{}/{}: no technicals — skipping", asset_type, identifier)
        return None

    if asset_type == "stock":
        from scoring.risk_engine import is_after_market_cutoff
        if is_after_market_cutoff():
            return None

    if benchmarks is None:
        from scoring.engine import _get_market_benchmark
        benchmarks = _get_market_benchmark()

    signal = _score_from_patterns(meta, asset_type)

    signal = _apply_gates(
        signal, asset_type, identifier, meta, price_row,
        benchmarks, btc_regime, breadth_tracker,
    )

    if ESCALATE_TO_AI and signal["direction"] != "HOLD":
        should_escalate = (
            signal["direction"] == "BUY"
            if ESCALATE_BUY_ONLY
            else True
        )
        if should_escalate:
            logger.info("{}/{}: rules {} confidence {} — escalating to Claude for confirmation",
                        asset_type, identifier, signal["direction"], signal["confidence"])
            from scoring.engine import score_asset
            return score_asset(
                asset_type, identifier,
                benchmarks=benchmarks, btc_regime=btc_regime,
                breadth_tracker=breadth_tracker, skip_hold=skip_hold,
                subscription=subscription,
            )

    if signal["direction"] == "HOLD" and skip_hold:
        return None

    record = _write_rules_signal(
        asset_type, identifier, current_price, signal, subscription,
    )
    if record:
        logger.info(
            "{}/{}: [RULES] {} {}% — {}",
            asset_type, identifier,
            signal["direction"], signal["confidence"],
            signal["reasoning"][:100],
        )

        try:
            from briefing.signal_alerts import notify_high_confidence_signal
            notify_high_confidence_signal(record)
        except Exception:
            pass

    return record


# ─── Batch scoring (drop-in replacements for engine.score_stocks/score_crypto)

def score_stocks_rules(subscription: str | None = None) -> str:
    """Score stocks using rules engine — drop-in replacement for engine.score_stocks()."""
    from scoring.engine import _get_market_benchmark
    from scoring.scanner import scan_stocks

    benchmarks = _get_market_benchmark()
    breadth_tracker: dict = {}

    today_count = _stock_signals_today_count()
    if today_count >= MAX_STOCK_SIGNALS_PER_DAY:
        return f"[rules_engine] daily stock signal cap reached ({today_count}/{MAX_STOCK_SIGNALS_PER_DAY})"

    scan_results = scan_stocks(use_movers=True)
    scored = 0
    signals_written = 0

    for ticker, scan_data in scan_results:
        if signals_written + today_count >= MAX_STOCK_SIGNALS_PER_DAY:
            logger.info("[rules_engine] daily cap reached mid-run ({}/{})",
                        signals_written + today_count, MAX_STOCK_SIGNALS_PER_DAY)
            break

        result = score_asset_rules(
            "stock", ticker,
            benchmarks=benchmarks,
            breadth_tracker=breadth_tracker,
            subscription=subscription,
        )
        scored += 1
        if result and result.get("direction") != "HOLD":
            signals_written += 1

    return (
        f"[rules_engine] scored {scored} stocks, "
        f"{signals_written} actionable signals written"
    )


def score_crypto_rules(subscription: str | None = None) -> str:
    """Score crypto using rules engine — drop-in replacement for engine.score_crypto()."""
    from scoring.engine import (
        _get_market_benchmark, CORE_CRYPTO, TIER1_CRYPTO,
        CRYPTO_MOVER_THRESHOLD, MAX_CRYPTO_SIGNALS_PER_DAY,
        _crypto_signals_today_count,
    )

    benchmarks = _get_market_benchmark()

    btc_regime = None
    try:
        btc_row = get_scoring_price_row("crypto", "BTC")
        if btc_row:
            btc_meta = btc_row.get("metadata") or {}
            macd_hist = btc_meta.get("macd_hist")
            prev_macd = btc_meta.get("prev_macd_hist")
            if macd_hist is not None and prev_macd is not None:
                btc_regime = {
                    "bearish": float(macd_hist) < 0 and float(macd_hist) < float(prev_macd),
                    "macd_hist": float(macd_hist),
                }
    except Exception:
        pass

    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=5)).isoformat()
        result = (
            supabase.table("raw_prices")
            .select("identifier, price, change_24h, metadata")
            .eq("asset_type", "crypto")
            .neq("identifier", "MARKET_SENTIMENT")
            .gte("captured_at", cutoff)
            .order("captured_at", desc=True)
            .execute()
        )
        rows = result.data or []
    except Exception as e:
        logger.error("[rules_engine] crypto price fetch failed: {}", e)
        return "[rules_engine] crypto price fetch failed"

    seen: set[str] = set()
    unique_rows = []
    for row in rows:
        sym = row["identifier"]
        if sym not in seen:
            seen.add(sym)
            unique_rows.append(row)

    # Daily crypto signal cap — mirrors engine.score_crypto so both scoring
    # paths honor the same per-UTC-day ceiling.
    existing_today = _crypto_signals_today_count()
    if existing_today >= MAX_CRYPTO_SIGNALS_PER_DAY:
        return f"[rules_engine] daily crypto cap reached ({existing_today}/{MAX_CRYPTO_SIGNALS_PER_DAY})"
    remaining = MAX_CRYPTO_SIGNALS_PER_DAY - existing_today

    scored = 0
    signals_written = 0
    skipped = 0

    for row in unique_rows:
        if signals_written >= remaining:
            break

        sym = row["identifier"]

        if sym not in CORE_CRYPTO and sym not in TIER1_CRYPTO:
            change = row.get("change_24h")
            if change is None or abs(float(change)) < CRYPTO_MOVER_THRESHOLD:
                skipped += 1
                continue

        result = score_asset_rules(
            "crypto", sym,
            benchmarks=benchmarks,
            btc_regime=btc_regime,
            subscription=subscription,
        )
        scored += 1
        if result and result.get("direction") != "HOLD":
            signals_written += 1

    return (
        f"[rules_engine] scored {scored} crypto, "
        f"{signals_written} actionable, {skipped} tier-skipped "
        f"(daily cap {existing_today + signals_written}/{MAX_CRYPTO_SIGNALS_PER_DAY})"
    )


def get_scoring_price_row(asset_type: str, identifier: str):
    from scoring.price_data import get_scoring_price_row as _get
    return _get(asset_type, identifier)
