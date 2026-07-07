"""
Asset accuracy refresh — nightly materialized view of signal win rates.
Aggregates all resolved signals by (identifier, asset_type) and upserts
into asset_accuracy. Runs nightly at 1:00am UTC via scheduler.
"""

from collections import defaultdict
from datetime import datetime, timezone

import sentry_sdk
from loguru import logger

from supabase_client import supabase
from scoring.engine import ENGINE_CUTOFF

BATCH_SIZE = 100


def _fetch_resolved_signals() -> list[dict]:
    """Fetch all resolved signals since ENGINE_CUTOFF, in pages.

    This is the source for the public /accuracy endpoint -- unlike the
    dashboard's win-rate stats, this had no cutoff at all until now, so it
    was aggregating every signal ever generated including the pre-fix
    (#59) stretch where stock/crypto scoring ran blind to real indicators.
    """
    all_rows: list[dict] = []
    page_size = 1000
    offset    = 0

    while True:
        try:
            result = (
                supabase.table("signals")
                .select("identifier, asset_type, outcome, confidence, created_at")
                .in_("outcome", ["WIN", "LOSS", "NEUTRAL"])
                .gte("created_at", ENGINE_CUTOFF)
                .range(offset, offset + page_size - 1)
                .execute()
            )
            batch = result.data or []
            all_rows.extend(batch)
            if len(batch) < page_size:
                break
            offset += page_size
        except Exception as e:
            logger.error("accuracy: failed to fetch signals page {} — {}", offset, e)
            sentry_sdk.capture_exception(e)
            break

    return all_rows


def _aggregate(signals: list[dict]) -> list[dict]:
    """Group signals by (identifier, asset_type) and compute accuracy stats."""
    groups: dict[tuple, dict] = defaultdict(lambda: {
        "wins": 0, "losses": 0, "neutrals": 0,
        "confidences": [], "last_signal_at": None,
    })

    for s in signals:
        key = (s["identifier"], s["asset_type"])
        g   = groups[key]

        outcome = s["outcome"]
        if outcome == "WIN":
            g["wins"] += 1
        elif outcome == "LOSS":
            g["losses"] += 1
        elif outcome == "NEUTRAL":
            g["neutrals"] += 1

        if s.get("confidence") is not None:
            g["confidences"].append(s["confidence"])

        ts = s.get("created_at")
        if ts and (g["last_signal_at"] is None or ts > g["last_signal_at"]):
            g["last_signal_at"] = ts

    rows = []
    for (identifier, asset_type), g in groups.items():
        wins    = g["wins"]
        losses  = g["losses"]
        total   = wins + losses + g["neutrals"]
        decisive = wins + losses

        win_rate     = round(wins / decisive * 100, 1) if decisive > 0 else None
        avg_conf     = round(sum(g["confidences"]) / len(g["confidences"]), 1) if g["confidences"] else None

        rows.append({
            "identifier":     identifier,
            "asset_type":     asset_type,
            "total_signals":  total,
            "wins":           wins,
            "losses":         losses,
            "neutrals":       g["neutrals"],
            "win_rate":       win_rate,
            "avg_confidence": avg_conf,
            "last_signal_at": g["last_signal_at"],
            "last_updated":   datetime.now(timezone.utc).isoformat(),
        })

    return rows


def refresh_asset_accuracy() -> str:
    signals = _fetch_resolved_signals()
    rows    = _aggregate(signals) if signals else []

    # Full delete-then-repopulate rather than upsert-only: this is upserted
    # by (identifier, asset_type), so a ticker whose only resolved signals
    # are now before ENGINE_CUTOFF would otherwise keep its stale, all-time
    # row here forever -- upsert never removes rows that don't reappear in
    # the current aggregation.
    try:
        supabase.table("asset_accuracy").delete().neq("identifier", "").execute()
    except Exception as e:
        logger.error("accuracy: failed to clear stale rows — {}", e)
        sentry_sdk.capture_exception(e)

    if not rows:
        logger.info("accuracy: no resolved signals since ENGINE_CUTOFF — table cleared, nothing to repopulate")
        return "0 assets updated (no resolved signals since cutoff)"

    updated = 0

    # Upsert in batches — asset_accuracy has composite PK (identifier, asset_type)
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        try:
            supabase.table("asset_accuracy").upsert(
                batch,
                on_conflict="identifier,asset_type",
            ).execute()
            updated += len(batch)
        except Exception as e:
            logger.error("accuracy: upsert failed for batch {} — {}", i, e)
            sentry_sdk.capture_exception(e)

    summary = f"{updated} assets updated from {len(signals)} resolved signals"
    logger.info("accuracy refresh complete — {}", summary)
    return summary
