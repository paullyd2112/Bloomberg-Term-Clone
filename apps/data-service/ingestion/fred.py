"""
FRED API integration — enriches macro events with real economic data
and provides current indicator values for scoring context.

Runs daily at 6:45am ET (after macro_events seed at 6:30am).
FRED API key: free at https://fredaccount.stlouisfed.org/apikeys
Rate limit: 120 requests/minute.
"""

import os
from datetime import date, timedelta

import httpx
import sentry_sdk
from loguru import logger

from supabase_client import supabase

FRED_KEY = os.environ.get("FRED_API_KEY", "")
FRED_BASE = "https://api.stlouisfed.org/fred"

FRED_SERIES: dict[str, dict] = {
    "CPIAUCSL":   {"name": "CPI (All Urban Consumers)",     "category": "inflation",  "format": "pct_change"},
    "PCEPI":      {"name": "PCE Price Index",                "category": "inflation",  "format": "pct_change"},
    "PPIFIS":     {"name": "PPI (Final Demand)",             "category": "inflation",  "format": "pct_change"},
    "UNRATE":     {"name": "Unemployment Rate",              "category": "employment", "format": "level"},
    "PAYEMS":     {"name": "Non-Farm Payrolls",              "category": "employment", "format": "change"},
    "GDP":        {"name": "Real GDP",                       "category": "gdp",        "format": "pct_change"},
    "GDPC1":      {"name": "Real GDP (Chained 2017$)",       "category": "gdp",        "format": "pct_change"},
    "FEDFUNDS":   {"name": "Fed Funds Rate",                 "category": "fed",        "format": "level"},
    "DFF":        {"name": "Fed Funds Effective Rate",        "category": "fed",        "format": "level"},
    "T10Y2Y":     {"name": "10Y-2Y Treasury Spread",         "category": "fed",        "format": "level"},
    "RSAFS":      {"name": "Retail Sales",                   "category": "consumer",   "format": "pct_change"},
    "UMCSENT":    {"name": "Consumer Sentiment (UMich)",      "category": "consumer",   "format": "level"},
    "VIXCLS":     {"name": "VIX",                            "category": "other",      "format": "level"},
    "BAMLH0A0HYM2": {"name": "High Yield Spread",           "category": "other",      "format": "level"},
}

MACRO_EVENT_TO_FRED: dict[str, str] = {
    "CPI Report":           "CPIAUCSL",
    "PCE Price Index":      "PCEPI",
    "PPI Report":           "PPIFIS",
    "Non-Farm Payrolls":    "PAYEMS",
    "GDP":                  "GDP",
    "Retail Sales":         "RSAFS",
    "FOMC Rate Decision":   "FEDFUNDS",
}


def _fred_get(endpoint: str, params: dict) -> dict | None:
    if not FRED_KEY:
        return None
    params["api_key"] = FRED_KEY
    params["file_type"] = "json"
    try:
        resp = httpx.get(f"{FRED_BASE}/{endpoint}", params=params, timeout=15.0)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        logger.debug("FRED {} failed: {}", endpoint, e)
        return None


def fetch_series_latest(series_id: str, limit: int = 5) -> list[dict]:
    data = _fred_get("series/observations", {
        "series_id": series_id,
        "sort_order": "desc",
        "limit": limit,
    })
    if not data:
        return []
    return [
        {"date": obs["date"], "value": obs["value"]}
        for obs in data.get("observations", [])
        if obs.get("value") != "."
    ]


def get_indicator_snapshot() -> dict[str, dict]:
    """Fetch latest value for each tracked FRED series. Returns dict keyed by series_id."""
    if not FRED_KEY:
        logger.warning("FRED_API_KEY not set — skipping indicator fetch")
        return {}

    snapshot: dict[str, dict] = {}
    for series_id, meta in FRED_SERIES.items():
        obs = fetch_series_latest(series_id, limit=2)
        if not obs:
            continue

        latest = obs[0]
        previous = obs[1] if len(obs) > 1 else None

        try:
            val = float(latest["value"])
        except (ValueError, TypeError):
            continue

        entry: dict = {
            "name": meta["name"],
            "category": meta["category"],
            "value": val,
            "date": latest["date"],
            "format": meta["format"],
        }

        if previous:
            try:
                prev_val = float(previous["value"])
                entry["previous"] = prev_val
                entry["previous_date"] = previous["date"]
                if meta["format"] == "level" and prev_val != 0:
                    entry["change"] = round(val - prev_val, 4)
                elif meta["format"] == "pct_change":
                    entry["change"] = round(val - prev_val, 2)
            except (ValueError, TypeError):
                pass

        snapshot[series_id] = entry

    logger.info("FRED snapshot: {} indicators fetched", len(snapshot))
    return snapshot


def enrich_macro_events() -> str:
    """Match macro events in the DB with their FRED series and
    update previous/actual values where available."""
    if not FRED_KEY:
        logger.warning("FRED_API_KEY not set — skipping macro enrichment")
        return "skipped (no API key)"

    today = date.today()
    lookback = (today - timedelta(days=7)).isoformat()
    lookahead = (today + timedelta(days=30)).isoformat()

    try:
        result = supabase.table("macro_events").select("id, event_name, event_date").gte(
            "event_date", lookback
        ).lte("event_date", lookahead).execute()
        events = result.data or []
    except Exception as e:
        logger.error("FRED enrichment: failed to fetch events — {}", e)
        return "error fetching events"

    updated = 0
    for event in events:
        event_name = event.get("event_name", "")
        fred_series = None
        for prefix, series_id in MACRO_EVENT_TO_FRED.items():
            if event_name.startswith(prefix):
                fred_series = series_id
                break

        if not fred_series:
            continue

        obs = fetch_series_latest(fred_series, limit=2)
        if len(obs) < 1:
            continue

        update_data: dict = {}
        try:
            update_data["actual"] = float(obs[0]["value"])
            if len(obs) >= 2:
                update_data["previous"] = float(obs[1]["value"])
        except (ValueError, TypeError):
            continue

        if not update_data:
            continue

        try:
            supabase.table("macro_events").update(update_data).eq("id", event["id"]).execute()
            updated += 1
        except Exception as e:
            logger.debug("FRED enrichment: update failed for event {} — {}", event["id"], e)

    summary = f"{updated} events enriched from FRED"
    logger.info("FRED enrichment complete — {}", summary)
    return summary


def get_macro_context_for_scoring() -> list[str]:
    """Build macro context strings with real FRED data for scoring prompts."""
    snapshot = get_indicator_snapshot()
    if not snapshot:
        return []

    lines: list[str] = []

    key_indicators = ["FEDFUNDS", "CPIAUCSL", "UNRATE", "T10Y2Y", "VIXCLS", "UMCSENT"]
    for sid in key_indicators:
        data = snapshot.get(sid)
        if not data:
            continue

        val = data["value"]
        name = data["name"]
        change = data.get("change")

        if data["format"] == "level":
            if change is not None:
                direction = "+" if change > 0 else ""
                lines.append(f"{name}: {val:.2f} ({direction}{change:.2f} vs prior)")
            else:
                lines.append(f"{name}: {val:.2f}")
        elif data["format"] == "pct_change":
            if change is not None:
                direction = "+" if change > 0 else ""
                lines.append(f"{name}: {val:.1f}% YoY ({direction}{change:.1f}pp vs prior)")
            else:
                lines.append(f"{name}: {val:.1f}% YoY")

    return lines
