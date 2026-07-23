"""Cross-Platform Ground Truth — fetches prediction market probabilities
from Metaculus and Manifold Markets, matches them against Polymarket markets,
and stores reference data for the ground-truth mismatch guardrail.

All sources are free, public, no auth required.
Runs daily at 5:00 AM ET via scheduler.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone

import httpx
from loguru import logger

from supabase_client import supabase

METACULUS_API = "https://www.metaculus.com/api2/questions/"
MANIFOLD_API = "https://api.manifold.markets/v0"

SIMILARITY_THRESHOLD = 0.40


def _normalize(text: str) -> set[str]:
    """Extract lowercase words, stripping punctuation."""
    return set(re.findall(r"[a-z0-9]+", text.lower()))


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def _get_polymarket_markets() -> list[dict]:
    """Fetch active Polymarket markets from raw_prices for matching."""
    try:
        result = (
            supabase.table("raw_prices")
            .select("identifier, price, volume, metadata")
            .eq("asset_type", "prediction")
            .order("captured_at", desc=True)
            .limit(500)
        ).execute()
    except Exception as e:
        logger.error("prediction_reference: failed to query raw_prices — {}", e)
        return []

    seen: dict[str, dict] = {}
    for row in result.data or []:
        ident = row["identifier"]
        if ident not in seen:
            meta = row.get("metadata") or {}
            title = meta.get("title", "")
            if title:
                seen[ident] = {
                    "condition_id": ident,
                    "title": title,
                    "yes_price": float(meta.get("yes_price", row.get("price", 0))),
                    "words": _normalize(title),
                }
    return list(seen.values())


def _match_to_polymarket(
    external_title: str,
    polymarket_markets: list[dict],
) -> dict | None:
    """Find the best-matching Polymarket market by title similarity."""
    ext_words = _normalize(external_title)
    if not ext_words:
        return None

    best_match = None
    best_score = 0.0

    for pm in polymarket_markets:
        score = _jaccard(ext_words, pm["words"])
        if score > best_score:
            best_score = score
            best_match = pm

    if best_score >= SIMILARITY_THRESHOLD and best_match:
        return best_match
    return None


def fetch_metaculus_probabilities(polymarket_markets: list[dict]) -> int:
    """Fetch open questions from Metaculus and match to Polymarket."""
    matched = 0
    try:
        resp = httpx.get(
            METACULUS_API,
            params={
                "status": "open",
                "type": "forecast",
                "limit": 100,
                "order_by": "-activity",
            },
            timeout=20,
            headers={"Accept": "application/json"},
        )
        if resp.status_code != 200:
            logger.warning("metaculus: API returned {}", resp.status_code)
            return 0

        data = resp.json()
        questions = data.get("results", data) if isinstance(data, dict) else data
    except Exception as e:
        logger.error("metaculus: fetch failed — {}", e)
        return 0

    for q in questions:
        try:
            title = q.get("title", "")
            if not title:
                continue

            prediction = q.get("community_prediction", {})
            if isinstance(prediction, dict):
                prob = prediction.get("full", {}).get("q2")
            else:
                prob = prediction
            if prob is None:
                continue

            prob = float(prob)
            external_id = str(q.get("id", ""))

            pm = _match_to_polymarket(title, polymarket_markets)
            if not pm:
                continue

            _upsert_reference(
                polymarket_condition_id=pm["condition_id"],
                platform="metaculus",
                external_id=external_id,
                external_title=title[:500],
                external_prob=round(prob, 4),
            )
            matched += 1
        except Exception as e:
            logger.debug("metaculus: skipping question — {}", e)

    return matched


def fetch_manifold_probabilities(polymarket_markets: list[dict]) -> int:
    """Fetch markets from Manifold Markets and match to Polymarket."""
    matched = 0
    try:
        resp = httpx.get(
            f"{MANIFOLD_API}/markets",
            params={"limit": 200, "sort": "liquidity"},
            timeout=20,
        )
        if resp.status_code != 200:
            logger.warning("manifold: API returned {}", resp.status_code)
            return 0

        markets = resp.json()
    except Exception as e:
        logger.error("manifold: fetch failed — {}", e)
        return 0

    for m in markets:
        try:
            question = m.get("question", "")
            if not question:
                continue

            prob = m.get("probability")
            if prob is None:
                continue

            prob = float(prob)
            if m.get("isResolved", False):
                continue

            external_id = m.get("id", "")
            volume = float(m.get("volume", 0))

            pm = _match_to_polymarket(question, polymarket_markets)
            if not pm:
                continue

            _upsert_reference(
                polymarket_condition_id=pm["condition_id"],
                platform="manifold",
                external_id=str(external_id),
                external_title=question[:500],
                external_prob=round(prob, 4),
                external_volume=round(volume, 2),
            )
            matched += 1
        except Exception as e:
            logger.debug("manifold: skipping market — {}", e)

    return matched


def _upsert_reference(
    polymarket_condition_id: str,
    platform: str,
    external_id: str,
    external_title: str,
    external_prob: float,
    external_volume: float | None = None,
) -> None:
    """Insert or update a cross-platform reference row."""
    row = {
        "polymarket_condition_id": polymarket_condition_id,
        "platform": platform,
        "external_id": external_id,
        "external_title": external_title,
        "external_prob": external_prob,
        "last_fetched_at": datetime.now(timezone.utc).isoformat(),
    }
    if external_volume is not None:
        row["external_volume"] = external_volume

    try:
        supabase.table("prediction_cross_platform").upsert(
            row,
            on_conflict="polymarket_condition_id,platform",
        ).execute()
    except Exception as e:
        logger.debug("prediction_reference: upsert failed — {}", e)


def ingest_prediction_references() -> str:
    """Orchestrator: fetch all cross-platform sources and match."""
    pm_markets = _get_polymarket_markets()
    if not pm_markets:
        return "0 Polymarket markets to match against"

    metaculus_count = fetch_metaculus_probabilities(pm_markets)
    manifold_count = fetch_manifold_probabilities(pm_markets)

    total = metaculus_count + manifold_count
    return (
        f"{total} cross-platform matches "
        f"(Metaculus: {metaculus_count}, Manifold: {manifold_count}) "
        f"against {len(pm_markets)} Polymarket markets"
    )
