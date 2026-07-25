"""Cross-Platform Ground Truth — fetches prediction market probabilities
from Manifold Markets, matches them against Polymarket markets, and stores
reference data for the ground-truth mismatch guardrail.

Manifold's search API is free, public, no auth required.
Metaculus API is currently returning 403 — disabled until they restore access.
Runs daily at 5:00 AM ET via scheduler.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone

import httpx
from loguru import logger

from supabase_client import supabase

MANIFOLD_API = "https://api.manifold.markets/v0"

STOP_WORDS = frozenset({
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "will", "would", "could", "should", "may", "might", "shall", "can",
    "do", "does", "did", "has", "have", "had", "having",
    "in", "on", "at", "to", "for", "of", "by", "from", "with", "as",
    "and", "or", "but", "not", "no", "if", "than", "that", "this",
    "it", "its", "there", "their", "they", "he", "she", "we", "you",
    "what", "which", "who", "whom", "how", "when", "where", "why",
    "before", "after", "during", "about", "into", "through",
    "between", "under", "over", "above", "below", "up", "down",
    "any", "all", "each", "every", "both", "few", "more", "most",
    "other", "some", "such", "only", "same", "so", "then",
})

SIMILARITY_THRESHOLD = 0.40

SEARCH_TOPICS = [
    "election president 2028",
    "election president 2026",
    "federal reserve rate cut",
    "federal reserve interest rate",
    "bitcoin price",
    "ethereum price",
    "crypto regulation",
    "recession economy GDP",
    "AI artificial intelligence",
    "OpenAI Anthropic",
    "war conflict ceasefire",
    "climate change",
    "supreme court ruling",
    "congress legislation bill",
    "inflation CPI consumer prices",
    "China Taiwan",
    "Russia Ukraine",
    "NATO military",
    "stock market S&P crash",
    "SpaceX Mars launch",
    "nuclear weapons Iran",
    "pandemic virus WHO",
    "immigration border policy",
    "tariff trade sanctions",
    "World Cup FIFA",
    "Olympics 2028",
    "Trump indictment",
    "debt ceiling default",
    "TikTok ban",
    "Tesla Elon Musk",
    "Israel Palestine Gaza",
    "North Korea missile",
    "housing market mortgage",
    "unemployment jobs",
    "government shutdown",
    "California earthquake",
    "hurricane season",
]


def _stem(word: str) -> str:
    """Minimal stemming: strip common English suffixes."""
    if len(word) <= 3:
        return word
    for suffix in ("tion", "sion", "ment", "ness", "ance", "ence", "ing", "ies", "ous", "ive", "ful", "ize", "ise", "ial", "ary", "ory", "ly", "ed", "er", "es", "al", "en", "ty", "le"):
        if word.endswith(suffix) and len(word) - len(suffix) >= 3:
            return word[: -len(suffix)]
    if word.endswith("s") and not word.endswith("ss") and len(word) > 3:
        return word[:-1]
    return word


_ABBREVIATIONS: dict[str, str] = {
    "fed": "federal",
    "ai": "artificial",
    "gop": "republican",
    "dem": "democrat",
    "dems": "democrat",
    "btc": "bitcoin",
    "eth": "ethereum",
    "gdp": "gross",
    "cpi": "consumer",
    "uk": "kingdom",
    "us": "united",
    "usa": "united",
}


def _normalize(text: str) -> set[str]:
    """Extract meaningful lowercase words, removing stop words and stemming."""
    words = set(re.findall(r"[a-z0-9]+", text.lower()))
    words -= STOP_WORDS
    expanded = set()
    for w in words:
        expanded.add(_stem(w))
        if w in _ABBREVIATIONS:
            expanded.add(_stem(_ABBREVIATIONS[w]))
    return expanded


def _similarity(a: set[str], b: set[str]) -> float:
    """Hybrid similarity: max of Jaccard and containment ratio.

    Containment handles asymmetric cases — a short Polymarket title
    matching a longer Manifold question (or vice versa).
    """
    if not a or not b:
        return 0.0
    intersection = len(a & b)
    jaccard = intersection / len(a | b)
    containment = intersection / min(len(a), len(b))
    return max(jaccard, containment)


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
        score = _similarity(ext_words, pm["words"])
        if score > best_score:
            best_score = score
            best_match = pm

    if best_score >= SIMILARITY_THRESHOLD and best_match:
        return best_match
    return None


def fetch_manifold_probabilities(polymarket_markets: list[dict]) -> int:
    """Search Manifold Markets by topic and match to Polymarket."""
    matched = 0
    seen_external: set[str] = set()
    seen_poly: set[str] = set()

    for topic in SEARCH_TOPICS:
        try:
            resp = httpx.get(
                f"{MANIFOLD_API}/search-markets",
                params={"term": topic, "limit": "20", "sort": "liquidity"},
                timeout=15,
            )
            if resp.status_code != 200:
                logger.debug("manifold: search '{}' returned {}", topic, resp.status_code)
                continue

            markets = resp.json()
        except Exception as e:
            logger.debug("manifold: search '{}' failed — {}", topic, e)
            continue

        for m in markets:
            try:
                external_id = m.get("id", "")
                if external_id in seen_external:
                    continue
                seen_external.add(external_id)

                question = m.get("question", "")
                if not question:
                    continue

                prob = m.get("probability")
                if prob is None:
                    continue

                prob = float(prob)
                if m.get("isResolved", False):
                    continue

                volume = float(m.get("volume", 0))

                pm = _match_to_polymarket(question, polymarket_markets)
                if not pm:
                    continue

                cid = pm["condition_id"]
                if cid in seen_poly:
                    continue
                seen_poly.add(cid)

                _upsert_reference(
                    polymarket_condition_id=cid,
                    platform="manifold",
                    external_id=str(external_id),
                    external_title=question[:500],
                    external_prob=round(prob, 4),
                    external_volume=round(volume, 2),
                )
                matched += 1
                logger.debug(
                    "manifold: matched '{}' → '{}' (prob={})",
                    question[:50], pm["title"][:50], round(prob, 3),
                )
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

    manifold_count = fetch_manifold_probabilities(pm_markets)

    return (
        f"{manifold_count} cross-platform matches "
        f"(Manifold: {manifold_count}) "
        f"against {len(pm_markets)} Polymarket markets"
    )
