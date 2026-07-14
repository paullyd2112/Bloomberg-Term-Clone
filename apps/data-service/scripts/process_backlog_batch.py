#!/usr/bin/env python3
"""
Historical Backlog Batch Processor
Uses the Anthropic Message Batches API (50% cost reduction) to score
unscored raw_prices snapshots from the last 10 days, then runs a local
Pessimistic Decay simulation against real OHLCV bars.

Usage:
    cd apps/data-service
    python -m scripts.process_backlog_batch [--dry-run] [--poll-interval 30]
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import anthropic
from anthropic.types.message_create_params import MessageCreateParamsNonStreaming
from anthropic.types.messages.batch_create_params import Request
from loguru import logger

# ── Project imports (run from apps/data-service) ──────────────────────────────
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from supabase_client import supabase
from scoring.risk_engine import (
    PROP_RISK_MATRIX,
    EFFECTIVE_RISK,
    SLIPPAGE_FRICTION_PCT,
    RR_CONFIGS,
    AssetClass,
    score_setup,
    format_trade_setup,
    translate_etf_to_futures,
)
from ingestion.alpaca_client import fetch_stock_bars, fetch_crypto_bars
from engine.strategies.signal_logger import SignalLogger, CSV_PATH

# ── Constants ─────────────────────────────────────────────────────────────────

BATCH_MODEL = "claude-sonnet-4-5-20250514"
MAX_TOKENS = 1024
LOOKBACK_DAYS = 10
POLL_INTERVAL_DEFAULT = 30

# Pessimistic Decay constants (mirrors analysis/backtest.py)
MAX_TRADE_LIFESPAN_BARS = 4
STOP_LOSS_PCT = 2.0
TAKE_PROFIT_PCT = 4.0
SLIPPAGE_CUSHION = 0.10

CONFIDENCE_MINIMUM = 75

# ── Anthropic client ──────────────────────────────────────────────────────────

_api_key = os.environ.get("ANTHROPIC_API_KEY", "")
if not _api_key:
    logger.error("ANTHROPIC_API_KEY not set")
    sys.exit(1)

_anthropic = anthropic.Anthropic(api_key=_api_key)


# ══════════════════════════════════════════════════════════════════════════════
# Step 1: Query unscored snapshots
# ══════════════════════════════════════════════════════════════════════════════

def get_unscored_snapshots() -> list[dict]:
    """Fetch raw_prices rows from the last LOOKBACK_DAYS that have indicator
    data (rsi_14 present) but no corresponding signal in the signals table.

    The raw_prices table has no 'scored' column — we detect unscored rows by
    left-joining against signals on (asset_type, identifier, created_at ≈
    captured_at). We do this with two queries since PostgREST doesn't support
    anti-joins directly.
    """
    cutoff = (datetime.now(timezone.utc) - timedelta(days=LOOKBACK_DAYS)).isoformat()

    try:
        result = (
            supabase.table("raw_prices")
            .select("id, asset_type, identifier, price, volume, change_24h, metadata, captured_at")
            .gte("captured_at", cutoff)
            .not_.is_("metadata", "null")
            .order("captured_at", desc=False)
            .execute()
        )
    except Exception as e:
        logger.error("Failed to fetch raw_prices: {}", e)
        return []

    if not result.data:
        return []

    raw_rows = result.data
    logger.info("Fetched {} raw_prices rows from last {}d", len(raw_rows), LOOKBACK_DAYS)

    indicator_rows = [
        r for r in raw_rows
        if (r.get("metadata") or {}).get("rsi_14") is not None
    ]
    logger.info("{} rows have indicator data (rsi_14 present)", len(indicator_rows))

    if not indicator_rows:
        return []

    try:
        sig_result = (
            supabase.table("signals")
            .select("asset_type, identifier, created_at")
            .eq("is_backtest", False)
            .gte("created_at", cutoff)
            .execute()
        )
    except Exception as e:
        logger.warning("Failed to fetch existing signals: {} — scoring all rows", e)
        return indicator_rows

    scored_keys: set[tuple[str, str, str]] = set()
    for s in (sig_result.data or []):
        ts = s["created_at"][:13]
        scored_keys.add((s["asset_type"], s["identifier"], ts))

    unscored = []
    for r in indicator_rows:
        ts = r["captured_at"][:13]
        key = (r["asset_type"], r["identifier"], ts)
        if key not in scored_keys:
            unscored.append(r)

    logger.info("{} unscored snapshots after filtering", len(unscored))
    return unscored


# ══════════════════════════════════════════════════════════════════════════════
# Step 2 & 3: Build batch requests
# ══════════════════════════════════════════════════════════════════════════════

BATCH_SYSTEM_PROMPT = """You are a quantitative analyst generating swing trade signals. Analyze the market snapshot and return ONLY valid JSON with exactly these fields:
{
  "direction": "BUY" or "SELL" or "HOLD",
  "confidence": 0-100,
  "reasoning": "min 20 chars explaining the signal with specific indicator values",
  "time_horizon": "intraday" or "swing" or "longterm",
  "key_risk": "primary risk to the trade",
  "invalidation_price": null or float (price where thesis breaks)
}

Rules:
- Confidence below 70 = HOLD. Only actionable signals get 70+.
- A directional signal needs at least 2 confirming factors from: trend (price vs SMA-50), momentum (MACD), volume (ratio > 1.2x), RSI alignment.
- RSI < 30 = oversold BUY setup. RSI > 70 in an uptrend = momentum, NOT a sell.
- MACD histogram crossing neg→pos = strongest BUY. Pos→neg = strongest SELL.
- Price > 5% above SMA-50 = uptrend lean BUY. > 5% below = downtrend lean SELL.
- invalidation_price is REQUIRED for BUY/SELL — the specific price where the thesis breaks.
- For crypto: replace key_risk with sentiment_driver in your reasoning.
- For prediction markets: direction is YES/NO/HOLD; include edge_detected (bool) and edge_explanation."""


def _build_user_prompt(snapshot: dict) -> str:
    meta = snapshot.get("metadata") or {}
    identifier = snapshot["identifier"]
    asset_type = snapshot["asset_type"]
    price = snapshot.get("price", "N/A")
    change = snapshot.get("change_24h", "N/A")

    macd_cross = ""
    prev_hist = meta.get("prev_macd_hist")
    curr_hist = meta.get("macd_hist")
    if prev_hist is not None and curr_hist is not None:
        try:
            p, c = float(prev_hist), float(curr_hist)
            if p <= 0 < c:
                macd_cross = " *** BULLISH CROSSOVER (neg→pos) ***"
            elif p >= 0 > c:
                macd_cross = " *** BEARISH CROSSOVER (pos→neg) ***"
        except (TypeError, ValueError):
            pass

    lines = [
        f"Asset: {identifier} ({asset_type})",
        f"Price: ${price} | 24h change: {change}%",
        f"Captured at: {snapshot.get('captured_at', 'N/A')}",
        "",
        "Technical indicators:",
        f"  RSI-14: {meta.get('rsi_14', 'N/A')}",
        f"  MACD line: {meta.get('macd_line', 'N/A')} | Signal: {meta.get('macd_signal', 'N/A')} | Hist: {meta.get('macd_hist', 'N/A')}{macd_cross}",
        f"  Previous MACD Hist: {meta.get('prev_macd_hist', 'N/A')}",
        f"  BB upper: {meta.get('bb_upper', 'N/A')} | Middle: {meta.get('bb_middle', 'N/A')} | Lower: {meta.get('bb_lower', 'N/A')}",
        f"  Price vs SMA-50: {meta.get('price_vs_sma50_pct', 'N/A')}%",
        f"  Volume ratio vs 20-day avg: {meta.get('volume_ratio', 'N/A')}x",
    ]

    if meta.get("atr_14") is not None:
        lines.append(f"  ATR-14: {meta['atr_14']}")

    lines.append("")
    lines.append("Generate a trading signal. Return ONLY the JSON object.")
    return "\n".join(lines)


def build_batch_requests(snapshots: list[dict]) -> list[Request]:
    requests = []
    for snap in snapshots:
        user_prompt = _build_user_prompt(snap)
        requests.append(
            Request(
                custom_id=str(snap["id"]),
                params=MessageCreateParamsNonStreaming(
                    model=BATCH_MODEL,
                    max_tokens=MAX_TOKENS,
                    system=[{"type": "text", "text": BATCH_SYSTEM_PROMPT}],
                    messages=[{"role": "user", "content": user_prompt}],
                ),
            )
        )
    return requests


# ══════════════════════════════════════════════════════════════════════════════
# Step 4: Submit and poll batch
# ══════════════════════════════════════════════════════════════════════════════

def submit_batch(requests: list[Request]) -> str:
    logger.info("Submitting batch of {} requests to Anthropic", len(requests))
    batch = _anthropic.messages.batches.create(requests=requests)
    logger.info("Batch created: {}", batch.id)
    return batch.id


def check_and_process_batch(batch_id: str, poll_interval: int = POLL_INTERVAL_DEFAULT) -> list:
    """Poll until the batch is complete, then retrieve all results."""
    while True:
        batch = _anthropic.messages.batches.retrieve(batch_id)
        counts = batch.request_counts
        logger.info(
            "Batch {} — status: {} | succeeded: {}/{} | failed: {} | expired: {}",
            batch_id,
            batch.processing_status,
            counts.succeeded,
            counts.processing + counts.succeeded + counts.errored + counts.expired + counts.canceled,
            counts.errored,
            counts.expired,
        )
        if batch.processing_status == "ended":
            break
        time.sleep(poll_interval)

    results = list(_anthropic.messages.batches.results(batch_id))
    logger.info("Retrieved {} results from batch {}", len(results), batch_id)
    return results


# ══════════════════════════════════════════════════════════════════════════════
# Step 5: Pessimistic Decay simulation
# ══════════════════════════════════════════════════════════════════════════════

_ohlcv_cache: dict[str, "pd.DataFrame | None"] = {}


def _get_ohlcv(identifier: str, asset_type: str):
    import pandas as pd

    cache_key = f"{asset_type}:{identifier}"
    if cache_key in _ohlcv_cache:
        return _ohlcv_cache[cache_key]

    df = None
    if asset_type == "stock":
        df = fetch_stock_bars(identifier, days=30)
    elif asset_type == "crypto":
        df = fetch_crypto_bars(identifier, days=30)

    _ohlcv_cache[cache_key] = df
    return df


def simulate_pessimistic_decay(
    identifier: str,
    asset_type: str,
    direction: str,
    entry_price: float,
    stop_loss: float,
    take_profit: float,
    signal_timestamp: str,
) -> tuple[str, float, str | None]:
    """Walk subsequent OHLCV bars with Pessimistic Decay rules.

    Returns (outcome, pnl_pct, exit_date).
    outcome is WIN, LOSS, TTL_EXPIRED, or UNKNOWN.
    """
    import pandas as pd

    df = _get_ohlcv(identifier, asset_type)
    if df is None or df.empty:
        return "UNKNOWN", 0.0, None

    entry_dt = pd.Timestamp(signal_timestamp)
    if entry_dt.tzinfo is not None:
        entry_dt = entry_dt.tz_localize(None)
    if df.index.tz is not None:
        df = df.tz_localize(None)

    future_bars = df.loc[df.index > entry_dt]

    if future_bars.empty:
        return "UNKNOWN", 0.0, None

    for bar_num, (dt, bar) in enumerate(future_bars.iterrows(), 1):
        if bar_num > MAX_TRADE_LIFESPAN_BARS:
            break

        hi = float(bar["high"])
        lo = float(bar["low"])

        if direction == "BUY":
            touches_stop = lo <= stop_loss
            touches_target = hi >= take_profit
        else:
            touches_stop = hi >= stop_loss
            touches_target = lo <= take_profit

        # Rule 1: Overlapping bar — pessimistic, always LOSS
        if touches_stop and touches_target:
            pnl = (stop_loss - entry_price) / entry_price * 100 if direction == "BUY" \
                else (entry_price - stop_loss) / entry_price * 100
            return "LOSS", pnl, str(dt.date()) if hasattr(dt, "date") else str(dt)

        if touches_stop:
            pnl = (stop_loss - entry_price) / entry_price * 100 if direction == "BUY" \
                else (entry_price - stop_loss) / entry_price * 100
            return "LOSS", pnl, str(dt.date()) if hasattr(dt, "date") else str(dt)

        if touches_target:
            pnl = (take_profit - entry_price) / entry_price * 100 if direction == "BUY" \
                else (entry_price - take_profit) / entry_price * 100
            return "WIN", pnl, str(dt.date()) if hasattr(dt, "date") else str(dt)

    # Rule 2: TTL expired — close at last available bar's close
    ttl_bars = future_bars.iloc[:MAX_TRADE_LIFESPAN_BARS]
    if not ttl_bars.empty:
        last_bar = ttl_bars.iloc[-1]
        last_dt = ttl_bars.index[-1]
        close_price = float(last_bar["close"])
        if direction == "BUY":
            pnl = (close_price - entry_price) / entry_price * 100
        else:
            pnl = (entry_price - close_price) / entry_price * 100
        return "TTL_EXPIRED", pnl, str(last_dt.date()) if hasattr(last_dt, "date") else str(last_dt)

    return "UNKNOWN", 0.0, None


def check_opposite_signal_cancellation(
    identifier: str,
    direction: str,
    signal_timestamp: str,
    snapshots_by_id: dict[int, dict],
    results_by_id: dict[int, dict],
) -> bool:
    """Check if a subsequent opposite signal exists for the same identifier.
    Returns True if this signal should be cancelled."""
    for snap_id, snap in snapshots_by_id.items():
        if snap["identifier"] != identifier:
            continue
        if snap["captured_at"] <= signal_timestamp:
            continue
        result = results_by_id.get(snap_id)
        if not result:
            continue
        opp_dir = result.get("direction")
        if opp_dir and opp_dir != direction and opp_dir != "HOLD":
            return True
    return False


# ══════════════════════════════════════════════════════════════════════════════
# Step 6: Position sizing with PROP_RISK_MATRIX
# ══════════════════════════════════════════════════════════════════════════════

def compute_position_sizes(
    entry_price: float,
    stop_loss: float,
    take_profit: float,
    asset_type: str,
    direction: str,
    identifier: str,
    confidence: int,
    atr: float | None = None,
) -> dict | None:
    """Use the production risk engine to compute trade setup and position sizes."""
    asset_cls_map = {
        "stock": AssetClass.STOCK,
        "crypto": AssetClass.CRYPTO,
        "prediction": AssetClass.PREDICTION_MARKET,
    }
    asset_cls = asset_cls_map.get(asset_type, AssetClass.STOCK)

    try:
        setup = score_setup(
            direction=direction,
            asset_class=asset_cls,
            entry_price=entry_price,
            confidence=confidence,
            invalidation_level=stop_loss if direction == "BUY" else stop_loss,
            atr=atr,
            identifier=identifier,
        )
        if setup.suppressed:
            logger.info("{}: suppressed by risk engine — {}", identifier, setup.suppression_reason)
            return None
        return format_trade_setup(setup)
    except Exception as e:
        logger.warning("{}: risk engine failed — {}", identifier, e)
        return None


# ══════════════════════════════════════════════════════════════════════════════
# Step 7 & 8: Write signals and mark as scored
# ══════════════════════════════════════════════════════════════════════════════

def write_signal_to_db(
    snapshot: dict,
    parsed: dict,
    trade_setup: dict | None,
    sim_outcome: str,
    sim_pnl: float,
    sim_exit_date: str | None,
) -> dict | None:
    """Write a signal record to the signals table."""
    direction = parsed["direction"]
    if snapshot["asset_type"] == "prediction":
        direction = "BUY" if parsed["direction"] == "YES" else (
            "SELL" if parsed["direction"] == "NO" else "HOLD"
        )

    sim_metadata = {
        "simulation_outcome": sim_outcome,
        "simulation_pnl_pct": round(sim_pnl, 4),
        "simulation_exit_date": sim_exit_date,
        "batch_processed": True,
        "source_raw_price_id": snapshot["id"],
    }

    if trade_setup:
        trade_setup["simulation"] = sim_metadata
    else:
        trade_setup = {"simulation": sim_metadata}

    record = {
        "asset_type": snapshot["asset_type"],
        "identifier": snapshot["identifier"],
        "direction": direction,
        "confidence": parsed["confidence"],
        "reasoning": f"[Batch backlog] {parsed['reasoning']}",
        "time_horizon": parsed.get("time_horizon", "swing"),
        "price_at_signal": snapshot.get("price"),
        "news_context": [],
        "is_backtest": True,
        "outcome": "PENDING",
        "trade_setup": trade_setup,
    }

    try:
        result = supabase.table("signals").insert(record).execute()
        return result.data[0] if result.data else record
    except Exception as e:
        logger.error("Failed to write signal for {}: {}", snapshot["identifier"], e)
        return None


def write_to_shadow_csv(
    snapshot: dict,
    parsed: dict,
    trade_setup: dict | None,
):
    """Append to the shadow_live_signals.csv audit file."""
    if not trade_setup or trade_setup.get("suppressed"):
        return

    sl = trade_setup.get("stop_loss", 0)
    tp = trade_setup.get("take_profit", 0)
    allocations = trade_setup.get("profile_allocations", {})

    position_sizes = {}
    for profile_name in PROP_RISK_MATRIX:
        alloc = allocations.get(profile_name, {})
        position_sizes[profile_name] = alloc.get("units", 0)

    sig_logger = SignalLogger()
    sig_logger.log_signal(
        strategy_id="batch_backlog",
        ticker=snapshot["identifier"],
        asset_class=snapshot["asset_type"],
        direction=parsed["direction"],
        entry_price=float(snapshot.get("price", 0)),
        stop_loss=float(sl),
        take_profit=float(tp),
        position_sizes=position_sizes,
    )


def mark_snapshots_scored(snapshot_ids: list[int]):
    """Mark raw_prices rows as processed by inserting into a tracking table.

    Since raw_prices has no 'scored' column, we track processed IDs in a
    lightweight batch_scored_tracking table. If that table doesn't exist yet,
    we create it.
    """
    if not snapshot_ids:
        return

    _ensure_tracking_table()

    rows = [{"raw_price_id": sid, "processed_at": datetime.now(timezone.utc).isoformat()} for sid in snapshot_ids]
    try:
        for batch_start in range(0, len(rows), 500):
            chunk = rows[batch_start : batch_start + 500]
            supabase.table("batch_scored_tracking").upsert(chunk, on_conflict="raw_price_id").execute()
        logger.info("Marked {} snapshots as scored", len(snapshot_ids))
    except Exception as e:
        logger.warning("Failed to mark snapshots as scored: {}", e)


_tracking_table_ensured = False


def _ensure_tracking_table():
    global _tracking_table_ensured
    if _tracking_table_ensured:
        return
    try:
        supabase.rpc(
            "exec_sql",
            {
                "query": """
                    CREATE TABLE IF NOT EXISTS public.batch_scored_tracking (
                        raw_price_id bigint PRIMARY KEY REFERENCES raw_prices(id),
                        processed_at timestamptz NOT NULL DEFAULT now()
                    );
                    GRANT ALL ON public.batch_scored_tracking TO service_role;
                """
            },
        ).execute()
    except Exception:
        pass
    _tracking_table_ensured = True


# ══════════════════════════════════════════════════════════════════════════════
# Main orchestration
# ══════════════════════════════════════════════════════════════════════════════

def parse_batch_result(result_entry) -> dict | None:
    """Extract structured JSON from a batch result entry."""
    if result_entry.result.type != "succeeded":
        return None

    msg = result_entry.result.message
    text = ""
    for block in msg.content:
        if block.type == "text":
            text = block.text
            break

    if not text:
        return None

    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines)

    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        logger.warning("Failed to parse JSON from batch result: {}", e)
        return None


def run(dry_run: bool = False, poll_interval: int = POLL_INTERVAL_DEFAULT):
    snapshots = get_unscored_snapshots()
    if not snapshots:
        logger.info("No unscored snapshots found. Exiting.")
        return

    logger.info("Found {} unscored snapshots to process", len(snapshots))

    if dry_run:
        for s in snapshots[:10]:
            logger.info(
                "  [dry-run] {} {} @ ${} ({})",
                s["asset_type"], s["identifier"], s.get("price"), s["captured_at"],
            )
        if len(snapshots) > 10:
            logger.info("  ... and {} more", len(snapshots) - 10)
        return

    # Build and submit batch
    requests = build_batch_requests(snapshots)
    batch_id = submit_batch(requests)

    # Poll until complete
    results = check_and_process_batch(batch_id, poll_interval)

    # Index snapshots by ID for lookup
    snapshots_by_id: dict[int, dict] = {s["id"]: s for s in snapshots}
    results_by_id: dict[int, dict] = {}

    # First pass: parse all results
    for entry in results:
        try:
            snap_id = int(entry.custom_id)
        except (ValueError, TypeError):
            continue
        parsed = parse_batch_result(entry)
        if parsed:
            results_by_id[snap_id] = parsed

    # Second pass: simulate and write
    scored_ids: list[int] = []
    success = 0
    skipped = 0
    failed = 0

    for entry in results:
        try:
            snap_id = int(entry.custom_id)
        except (ValueError, TypeError):
            continue

        snap = snapshots_by_id.get(snap_id)
        if not snap:
            continue

        parsed = results_by_id.get(snap_id)
        if not parsed:
            logger.warning("Snapshot {} ({}): batch result failed or unparseable", snap_id, snap["identifier"])
            scored_ids.append(snap_id)
            skipped += 1
            continue

        try:
            confidence = parsed.get("confidence", 0)
            direction = parsed.get("direction", "HOLD")

            if direction == "HOLD" or confidence < CONFIDENCE_MINIMUM:
                scored_ids.append(snap_id)
                skipped += 1
                continue

            entry_price = float(snap["price"]) if snap.get("price") else None
            if entry_price is None or entry_price <= 0:
                scored_ids.append(snap_id)
                skipped += 1
                continue

            invalidation = parsed.get("invalidation_price")

            # Compute stop/target from invalidation or default percentages
            if invalidation is not None and invalidation > 0:
                if direction == "BUY":
                    stop_loss = float(invalidation)
                    stop_pct = abs(entry_price - stop_loss) / entry_price
                    take_profit = entry_price + (entry_price - stop_loss) * 2.0
                else:
                    stop_loss = float(invalidation)
                    stop_pct = abs(stop_loss - entry_price) / entry_price
                    take_profit = entry_price - (stop_loss - entry_price) * 2.0
            else:
                if direction == "BUY":
                    stop_loss = entry_price * (1 - STOP_LOSS_PCT / 100)
                    take_profit = entry_price * (1 + TAKE_PROFIT_PCT / 100)
                else:
                    stop_loss = entry_price * (1 + STOP_LOSS_PCT / 100)
                    take_profit = entry_price * (1 - TAKE_PROFIT_PCT / 100)

            # Rule 3: Opposite signal cancellation check
            cancelled = check_opposite_signal_cancellation(
                snap["identifier"], direction, snap["captured_at"],
                snapshots_by_id, results_by_id,
            )
            if cancelled:
                logger.info("{}: opposite signal cancellation — skipping", snap["identifier"])
                scored_ids.append(snap_id)
                skipped += 1
                continue

            # Step 5: Pessimistic decay simulation
            sim_outcome, sim_pnl, sim_exit = simulate_pessimistic_decay(
                identifier=snap["identifier"],
                asset_type=snap["asset_type"],
                direction=direction,
                entry_price=entry_price,
                stop_loss=stop_loss,
                take_profit=take_profit,
                signal_timestamp=snap["captured_at"],
            )

            # Step 6: Position sizing
            meta = snap.get("metadata") or {}
            atr = meta.get("atr_14")
            if atr is not None:
                atr = float(atr)

            trade_setup = compute_position_sizes(
                entry_price=entry_price,
                stop_loss=stop_loss,
                take_profit=take_profit,
                asset_type=snap["asset_type"],
                direction=direction,
                identifier=snap["identifier"],
                confidence=confidence,
                atr=atr,
            )

            # Step 7: Write to DB and CSV
            sig = write_signal_to_db(snap, parsed, trade_setup, sim_outcome, sim_pnl, sim_exit)
            if sig:
                write_to_shadow_csv(snap, parsed, trade_setup)
                success += 1
                logger.info(
                    "{} {}: {} conf={} sim={} pnl={:.2f}%",
                    snap["asset_type"], snap["identifier"],
                    direction, confidence, sim_outcome, sim_pnl,
                )
            else:
                failed += 1

            scored_ids.append(snap_id)

        except Exception as e:
            logger.error("Failed processing snapshot {} ({}): {}", snap_id, snap.get("identifier"), e)
            scored_ids.append(snap_id)
            failed += 1

    # Step 8: Mark as scored
    mark_snapshots_scored(scored_ids)

    logger.info(
        "Batch complete: {} scored, {} skipped, {} failed out of {} total",
        success, skipped, failed, len(results),
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Process backlog of unscored market snapshots")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be processed without submitting")
    parser.add_argument("--poll-interval", type=int, default=POLL_INTERVAL_DEFAULT, help="Seconds between batch status polls")
    args = parser.parse_args()

    run(dry_run=args.dry_run, poll_interval=args.poll_interval)
