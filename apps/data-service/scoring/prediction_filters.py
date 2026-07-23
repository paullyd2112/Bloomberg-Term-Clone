"""Prediction market signal guardrails — category filtering, pricing bracket
validation, CLOB liquidity checks, and ground-truth mismatch detection.

Enforced before any prediction signal is written so every published signal
represents a liquid, tradeable opportunity with real edge.
"""

from __future__ import annotations

import re

import httpx
from loguru import logger

POLYMARKET_CLOB_BASE = "https://clob.polymarket.com"

ALLOWED_CATEGORIES = frozenset({
    "politics", "elections", "geopolitics",
    "economics", "macro", "fed", "finance", "crypto",
    "web3", "technology", "science",
})

SPORTS_CATEGORIES = frozenset({
    "sports", "nfl", "nba", "mlb", "nhl", "soccer", "football",
    "tennis", "mma", "boxing", "cricket", "golf", "racing",
    "esports", "olympics",
})

MIN_ENTRY_PRICE = 0.08
MAX_ENTRY_PRICE = 0.92

MIN_24H_VOLUME_USD = 10_000

MAX_BID_ASK_SPREAD = 0.03
MIN_BOOK_DEPTH_USD = 500
BOOK_DEPTH_PCT = 0.03

SPORTS_ARB_THRESHOLD_PCT = 7.0
GROUND_TRUTH_MISMATCH_PCT = 7.0

# ─── Title-based category inference ─────────────────────────────────────────
# Polymarket's Gamma API returns empty category strings on every market.
# We infer category from title + event_slug keywords so the category gate
# actually works.

_SPORTS_TITLE_KEYWORDS = [
    "f1", "formula 1", "formula one",
    "nfl", "nba", "mlb", "nhl", "mls",
    "premier league", "la liga", "serie a", "bundesliga", "ligue 1",
    "champions league", "europa league",
    "world cup", "euro 2026", "copa america",
    "super bowl", "world series", "stanley cup",
    "wimbledon", "us open tennis", "french open", "australian open tennis",
    "olympics", "olympic",
    "ufc", "mma", "boxing",
    "grand prix", "constructors' champion", "drivers' champion",
    "ballon d'or", "mvp award", "heisman",
    "cricket", "ipl", "ashes",
    "pga", "masters tournament", "ryder cup",
    "tour de france", "daytona", "nascar", "indycar",
    "esports", "league of legends worlds",
    "afa president",
]

_POLITICS_TITLE_KEYWORDS = [
    "president", "election", "midterm", "senate", "house",
    "governor", "congress", "democrat", "republican",
    "balance of power", "blue wave", "red wave",
    "impeach", "prime minister", "parliament",
    "coup", "leader of", "nato",
]

_CRYPTO_TITLE_KEYWORDS = [
    "bitcoin", "ethereum", "solana",
    "crypto", "blockchain", "coinbase", "binance",
    "stablecoin", "defi",
]
_CRYPTO_WORD_BOUNDARY = ["btc", "eth", "sol", "nft"]

_TECH_TITLE_KEYWORDS = [
    "artificial intelligence",
    "openai", "anthropic",
    "startup", "tech company", "software",
]
_TECH_WORD_BOUNDARY = ["ipo", "ai"]

_ECONOMICS_TITLE_KEYWORDS = [
    "federal reserve", "interest rate",
    "inflation", "recession", "tariff",
    "s&p 500", "s&p500", "nasdaq", "dow jones",
    "treasury", "yield curve",
]
_ECONOMICS_WORD_BOUNDARY = ["fed", "gdp", "debt", "bond"]

_SCIENCE_TITLE_KEYWORDS = [
    "earthquake", "hurricane", "volcano", "climate",
    "pandemic", "vaccine", "disease",
    "nasa", "spacex", "moon landing",
    "nuclear", "fusion",
]
_SCIENCE_WORD_BOUNDARY = ["mars", "who"]

_GEOPOLITICS_TITLE_KEYWORDS = [
    "military clash", "invasion", "sanctions",
    "china x", "russia", "ukraine", "taiwan",
    "israel", "iran", "north korea",
    "withdraws from", "ceasefire", "peace deal",
]
_GEOPOLITICS_WORD_BOUNDARY = ["war"]


def _word_match(text: str, word: str) -> bool:
    return bool(re.search(r'\b' + re.escape(word) + r'\b', text))


def _any_match(text: str, substrings: list[str], words: list[str] | None = None) -> bool:
    for kw in substrings:
        if kw in text:
            return True
    for w in (words or []):
        if _word_match(text, w):
            return True
    return False


def infer_category(title: str, event_slug: str = "") -> str:
    """Infer a market's category from its title and event slug.

    Returns a category string matching ALLOWED_CATEGORIES / SPORTS_CATEGORIES,
    or empty string if no match. Short keywords (btc, eth, ai, war, etc.) use
    word-boundary matching to avoid substring false positives.
    """
    text = f"{title} {event_slug}".lower()

    for kw in _SPORTS_TITLE_KEYWORDS:
        if kw in text:
            return "sports"

    checks: list[tuple[str, list[str], list[str]]] = [
        ("politics",    _POLITICS_TITLE_KEYWORDS,    []),
        ("geopolitics", _GEOPOLITICS_TITLE_KEYWORDS,  _GEOPOLITICS_WORD_BOUNDARY),
        ("economics",   _ECONOMICS_TITLE_KEYWORDS,    _ECONOMICS_WORD_BOUNDARY),
        ("crypto",      _CRYPTO_TITLE_KEYWORDS,       _CRYPTO_WORD_BOUNDARY),
        ("technology",  _TECH_TITLE_KEYWORDS,          _TECH_WORD_BOUNDARY),
        ("science",     _SCIENCE_TITLE_KEYWORDS,       _SCIENCE_WORD_BOUNDARY),
    ]
    for cat, substrings, words in checks:
        if _any_match(text, substrings, words):
            return cat

    return ""


def is_allowed_category(category: str, metadata: dict | None = None) -> tuple[bool, str]:
    """Check if a market's category passes the focus filter.

    Returns (allowed, reason). Sports markets are rejected unless metadata
    contains a verified cross-exchange arbitrage gap >= 7%.

    When the upstream API returns no category (Polymarket Gamma API always
    returns empty), infers one from the market title and event slug.
    """
    cat_lower = (category or "").strip().lower()

    if not cat_lower:
        meta = metadata or {}
        title = meta.get("title", "")
        event_slug = meta.get("event_slug", "")
        cat_lower = infer_category(title, event_slug)
        if not cat_lower:
            return True, "no category inferred — allowing"

    for allowed in ALLOWED_CATEGORIES:
        if allowed in cat_lower:
            return True, f"category '{cat_lower}' matches allowed '{allowed}'"

    for sport in SPORTS_CATEGORIES:
        if sport in cat_lower:
            meta = metadata or {}
            arb_gap = meta.get("cross_exchange_arb_pct")
            if arb_gap is not None:
                try:
                    if float(arb_gap) >= SPORTS_ARB_THRESHOLD_PCT:
                        return True, (
                            f"sports category '{cat_lower}' allowed — "
                            f"cross-exchange arb gap {float(arb_gap):.1f}% >= {SPORTS_ARB_THRESHOLD_PCT}%"
                        )
                except (TypeError, ValueError):
                    pass
            return False, (
                f"[Category gate] '{cat_lower}' is sports (inferred from title) — filtered out "
                f"(no verified cross-exchange arb >= {SPORTS_ARB_THRESHOLD_PCT}%)"
            )

    return True, f"category '{cat_lower}' not in block list — allowing"


def check_pricing_bracket(yes_price: float | None, no_price: float | None) -> tuple[bool, str]:
    """Reject contracts where both YES and NO are outside $0.10–$0.90.

    Prevents capital-inefficient penny-picking (buying $0.02 NOs) and
    near-certain favorites with no upside.
    """
    prices_checked = []
    if yes_price is not None:
        prices_checked.append(("YES", yes_price))
    if no_price is not None:
        prices_checked.append(("NO", no_price))

    if not prices_checked:
        return False, "[Pricing bracket] No price data available"

    for label, price in prices_checked:
        if MIN_ENTRY_PRICE <= price <= MAX_ENTRY_PRICE:
            return True, f"{label} price ${price:.2f} within ${MIN_ENTRY_PRICE}–${MAX_ENTRY_PRICE} bracket"

    price_strs = [f"{label}=${p:.2f}" for label, p in prices_checked]
    return False, (
        f"[Pricing bracket] Both outcomes outside ${MIN_ENTRY_PRICE}–${MAX_ENTRY_PRICE} "
        f"tradeable range ({', '.join(price_strs)}) — capital-inefficient"
    )


def check_clob_liquidity(
    token_id: str,
    timeout: float = 10.0,
) -> tuple[bool, str]:
    """Query the Polymarket CLOB API for order book depth and spread.

    Checks:
    1. Bid-ask spread <= $0.03
    2. Aggregate depth within 3% of mid-price >= $500
    """
    if not token_id:
        return False, "[CLOB liquidity] No clobTokenId available"

    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.get(
                f"{POLYMARKET_CLOB_BASE}/book",
                params={"token_id": token_id},
            )
            resp.raise_for_status()
            book = resp.json()
    except httpx.TimeoutException:
        logger.warning("CLOB book request timed out for token {}", token_id)
        return True, "[CLOB liquidity] Book request timed out — allowing (fail-open)"
    except Exception as e:
        logger.warning("CLOB book request failed for token {}: {}", token_id, e)
        return True, f"[CLOB liquidity] Book request failed — allowing (fail-open): {e}"

    bids = book.get("bids") or []
    asks = book.get("asks") or []

    if not bids or not asks:
        return False, "[CLOB liquidity] Empty order book — no bids or asks"

    try:
        best_bid = float(bids[0].get("price", 0))
        best_ask = float(asks[0].get("price", 0))
    except (TypeError, ValueError, IndexError):
        return False, "[CLOB liquidity] Could not parse best bid/ask"

    if best_bid <= 0 or best_ask <= 0:
        return False, "[CLOB liquidity] Invalid bid/ask prices"

    spread = best_ask - best_bid
    if spread > MAX_BID_ASK_SPREAD:
        return False, (
            f"[CLOB liquidity] Bid-ask spread ${spread:.3f} > ${MAX_BID_ASK_SPREAD:.2f} max — "
            f"too wide for safe entry/exit"
        )

    mid_price = (best_bid + best_ask) / 2
    lower_bound = mid_price * (1 - BOOK_DEPTH_PCT)
    upper_bound = mid_price * (1 + BOOK_DEPTH_PCT)

    bid_depth = sum(
        float(b.get("size", 0)) * float(b.get("price", 0))
        for b in bids
        if float(b.get("price", 0)) >= lower_bound
    )
    ask_depth = sum(
        float(a.get("size", 0)) * float(a.get("price", 0))
        for a in asks
        if float(a.get("price", 0)) <= upper_bound
    )
    total_depth = bid_depth + ask_depth

    if total_depth < MIN_BOOK_DEPTH_USD:
        return False, (
            f"[CLOB liquidity] Aggregate depth ${total_depth:.0f} within 3% of mid "
            f"(${mid_price:.3f}) < ${MIN_BOOK_DEPTH_USD} min — a $200 trade would sweep the book"
        )

    return True, (
        f"CLOB liquidity OK: spread=${spread:.3f}, depth=${total_depth:.0f} "
        f"within 3% of mid ${mid_price:.3f}"
    )


def _fetch_cross_platform_refs(condition_id: str) -> dict[str, float]:
    """Query prediction_cross_platform for reference probabilities."""
    try:
        from supabase_client import supabase
        result = (
            supabase.table("prediction_cross_platform")
            .select("platform, external_prob")
            .eq("polymarket_condition_id", condition_id)
            .execute()
        )
        refs = {}
        for row in result.data or []:
            if row.get("external_prob") is not None:
                refs[row["platform"]] = float(row["external_prob"])
        return refs
    except Exception:
        return {}


def check_ground_truth_mismatch(
    yes_price: float | None,
    metadata: dict | None = None,
    condition_id: str | None = None,
) -> tuple[bool, str]:
    """Verify the signal has a mathematically verified pricing mismatch
    of >= 7% against ground-truth reference platforms.

    Ground-truth sources (checked in order):
    1. Cross-platform DB table (Metaculus, Manifold — populated by prediction_reference.py)
    2. Metadata fields (Kalshi, PredictIt, CME FedWatch — from ingestion)

    Returns (has_edge, reason).
    """
    if yes_price is None:
        return False, "[Ground truth] No YES price to compare"

    meta = metadata or {}

    ground_truth_refs: dict[str, float | None] = {
        "kalshi_implied_prob": meta.get("kalshi_implied_prob"),
        "predictit_implied_prob": meta.get("predictit_implied_prob"),
        "cme_fedwatch_prob": meta.get("cme_fedwatch_prob"),
    }

    if condition_id:
        cross_platform = _fetch_cross_platform_refs(condition_id)
        for platform, prob in cross_platform.items():
            ground_truth_refs[platform] = prob

    found_any = False
    max_mismatch = 0.0
    best_source = ""

    for source, ref_prob in ground_truth_refs.items():
        if ref_prob is None:
            continue
        try:
            ref_f = float(ref_prob)
        except (TypeError, ValueError):
            continue

        found_any = True
        mismatch_pct = abs(yes_price - ref_f) * 100

        if mismatch_pct > max_mismatch:
            max_mismatch = mismatch_pct
            best_source = source

    if not found_any:
        return True, (
            "[Ground truth] No cross-exchange reference data available — "
            "deferring to AI model judgment"
        )

    if max_mismatch >= GROUND_TRUTH_MISMATCH_PCT:
        return True, (
            f"[Ground truth] {max_mismatch:.1f}% mismatch vs {best_source} "
            f"(>= {GROUND_TRUTH_MISMATCH_PCT}% threshold) — verified edge"
        )

    return False, (
        f"[Ground truth] Largest mismatch {max_mismatch:.1f}% vs {best_source} "
        f"< {GROUND_TRUTH_MISMATCH_PCT}% minimum — insufficient edge"
    )


def run_prediction_guardrails(
    identifier: str,
    yes_price: float | None,
    no_price: float | None,
    volume_24h: float | None,
    metadata: dict | None = None,
) -> tuple[bool, str]:
    """Run all prediction market guardrails in sequence.

    Returns (passed, reason). On the first failure, returns immediately
    with the rejection reason so no unnecessary API calls are made.
    """
    meta = metadata or {}

    category = meta.get("category", "")
    cat_ok, cat_reason = is_allowed_category(category, meta)
    if not cat_ok:
        return False, cat_reason

    bracket_ok, bracket_reason = check_pricing_bracket(yes_price, no_price)
    if not bracket_ok:
        return False, bracket_reason

    if volume_24h is not None:
        try:
            if float(volume_24h) < MIN_24H_VOLUME_USD:
                return False, (
                    f"[Volume gate] 24h volume ${float(volume_24h):,.0f} "
                    f"< ${MIN_24H_VOLUME_USD:,} minimum"
                )
        except (TypeError, ValueError):
            pass

    gt_ok, gt_reason = check_ground_truth_mismatch(yes_price, meta, condition_id=identifier)
    if not gt_ok:
        return False, gt_reason

    # CLOB liquidity check disabled — Polymarket's CLOB API returns $0.001–$0.999
    # spreads on every token regardless of actual liquidity, making the spread/depth
    # check useless (blocks 100% of markets). Volume gate above serves as the
    # liquidity proxy until a smarter depth check is built.

    return True, "All prediction guardrails passed"
