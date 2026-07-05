"""
Congress member metadata lookup (party affiliation), sourced from the
unitedstates/congress-legislators project (public domain, community-
maintained, updated on every membership change).

Senate EFD filings use formal/legal names ("A. Mitchell McConnell, Jr.",
"James Banks") that don't match official_full ("Mitch McConnell",
"Jim Banks") on first name -- last-name-only matching sidesteps that
entirely and is what's used here. One known collision among current
senators (Rick Scott R-FL / Tim Scott R-SC) doesn't affect party lookup
since both are the same party.
"""

import httpx
import yaml
from loguru import logger

LEGISLATORS_URL = "https://raw.githubusercontent.com/unitedstates/congress-legislators/main/legislators-current.yaml"
REQUEST_TIMEOUT = 15.0

_PARTY_ABBREV = {"Democrat": "D", "Republican": "R", "Independent": "I"}

_cache: dict[str, str] | None = None


def _build_lookup() -> dict[str, str]:
    """last-name (lowercase) -> party abbreviation, for current senators."""
    try:
        resp = httpx.get(LEGISLATORS_URL, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        legislators = yaml.safe_load(resp.text)
    except Exception as e:
        logger.warning("congress_members: legislators fetch failed — {}", e)
        return {}

    lookup: dict[str, str] = {}
    for leg in legislators:
        terms = leg.get("terms") or []
        if not terms or terms[-1].get("type") != "sen":
            continue
        last = (leg.get("name", {}).get("last") or "").strip().lower()
        party = _PARTY_ABBREV.get(terms[-1].get("party"), "")
        if last and party:
            lookup[last] = party
    logger.info("congress_members: loaded {} current senators", len(lookup))
    return lookup


def _extract_last_name(politician: str) -> str:
    import re
    n = re.sub(r",?\s*(Jr\.?|Sr\.?|III|II|IV)\.?$", "", politician.strip(), flags=re.I).strip()
    parts = n.replace(".", "").split()
    return parts[-1].lower() if parts else ""


def get_party(politician: str) -> str:
    """Returns 'D'/'R'/'I', or '' if not found. Cached per-process --
    Senate composition changes rarely enough that refetching every
    ingestion run isn't needed; restart the service to pick up changes."""
    global _cache
    if _cache is None:
        _cache = _build_lookup()
    if not politician:
        return ""
    return _cache.get(_extract_last_name(politician), "")
