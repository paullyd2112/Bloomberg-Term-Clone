"""Resolve a Polymarket CLOB token ID (asset_id) to its outcome direction (YES/NO).

The CLOB API returns trades with an `asset_id` that corresponds to one of the
market's two outcome tokens. To know whether a BUY of that token is a YES or NO
position, we look up the market's `clobTokenIds` array in `raw_prices.metadata`,
which stores `[yes_token_id, no_token_id]` from the Gamma API.
"""

from __future__ import annotations

from loguru import logger

from supabase_client import supabase

_token_map: dict[str, str] = {}
_TOKEN_MAP_MAX = 4000


def resolve_token_direction(asset_id: str, condition_id: str, side: str, price: float) -> str:
    """Return 'YES' or 'NO' based on which outcome token the asset_id represents.

    For a BUY of a YES token → YES position.
    For a SELL of a YES token → NO position (selling YES = bearish).
    For a BUY of a NO token → NO position.
    For a SELL of a NO token → YES position (selling NO = bullish).

    Falls back to price-based heuristic if token lookup fails.
    """
    token_outcome = _lookup_token_outcome(asset_id, condition_id)

    if token_outcome:
        is_buy = side.lower() in ("buy", "bid", "")
        if is_buy:
            return token_outcome
        else:
            return "NO" if token_outcome == "YES" else "YES"

    if side.lower() in ("buy", "bid", ""):
        return "YES" if price > 0.5 else "NO"
    else:
        return "NO" if price > 0.5 else "YES"


def _lookup_token_outcome(asset_id: str, condition_id: str) -> str | None:
    """Look up whether asset_id is the YES or NO token for a market."""
    if asset_id in _token_map:
        return _token_map[asset_id]

    if not condition_id:
        return None

    try:
        result = (
            supabase.table("raw_prices")
            .select("metadata")
            .eq("identifier", condition_id)
            .eq("asset_type", "prediction")
            .order("captured_at", desc=True)
            .limit(1)
            .execute()
        )
        if not result.data:
            return None

        meta = result.data[0].get("metadata") or {}
        clob_ids = meta.get("clobTokenIds", [])
        if not isinstance(clob_ids, list) or len(clob_ids) < 2:
            return None

        if len(_token_map) >= _TOKEN_MAP_MAX:
            _token_map.clear()

        _token_map[str(clob_ids[0])] = "YES"
        _token_map[str(clob_ids[1])] = "NO"

        return _token_map.get(asset_id)
    except Exception as e:
        logger.debug("token_direction: lookup failed for {} — {}", condition_id[:20], e)
        return None
