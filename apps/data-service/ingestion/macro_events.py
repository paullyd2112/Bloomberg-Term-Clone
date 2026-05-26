"""
Macro events ingestion — seeds and maintains the economic calendar.
Covers Fed meetings, CPI, NFP, PCE, GDP, and other high-importance releases.
Runs daily at 6:00am ET to check for actual values and new events.
"""

import os
from datetime import date, timedelta

import sentry_sdk
from loguru import logger

from supabase_client import supabase

# ─── Known upcoming macro events (updated quarterly) ─────────────────────────
# Format: (event_date, event_time, event_name, category, importance)

MACRO_SCHEDULE: list[tuple[str, str | None, str, str, str]] = [
    # ── Fed ──────────────────────────────────────────────────────────────────
    ("2026-06-11", "2:00pm ET",  "FOMC Rate Decision",           "fed",        "high"),
    ("2026-06-11", "2:30pm ET",  "Fed Press Conference",         "fed",        "high"),
    ("2026-07-29", "2:00pm ET",  "FOMC Rate Decision",           "fed",        "high"),
    ("2026-07-29", "2:30pm ET",  "Fed Press Conference",         "fed",        "high"),
    ("2026-09-16", "2:00pm ET",  "FOMC Rate Decision",           "fed",        "high"),
    ("2026-09-16", "2:30pm ET",  "Fed Press Conference",         "fed",        "high"),
    ("2026-11-04", "2:00pm ET",  "FOMC Rate Decision",           "fed",        "high"),
    ("2026-11-04", "2:30pm ET",  "Fed Press Conference",         "fed",        "high"),
    ("2026-12-16", "2:00pm ET",  "FOMC Rate Decision",           "fed",        "high"),
    ("2026-12-16", "2:30pm ET",  "Fed Press Conference",         "fed",        "high"),

    # ── CPI ──────────────────────────────────────────────────────────────────
    ("2026-06-10", "8:30am ET",  "CPI Report (May)",             "inflation",  "high"),
    ("2026-07-14", "8:30am ET",  "CPI Report (Jun)",             "inflation",  "high"),
    ("2026-08-12", "8:30am ET",  "CPI Report (Jul)",             "inflation",  "high"),
    ("2026-09-10", "8:30am ET",  "CPI Report (Aug)",             "inflation",  "high"),
    ("2026-10-13", "8:30am ET",  "CPI Report (Sep)",             "inflation",  "high"),
    ("2026-11-12", "8:30am ET",  "CPI Report (Oct)",             "inflation",  "high"),
    ("2026-12-10", "8:30am ET",  "CPI Report (Nov)",             "inflation",  "high"),

    # ── PPI ──────────────────────────────────────────────────────────────────
    ("2026-06-11", "8:30am ET",  "PPI Report (May)",             "inflation",  "medium"),
    ("2026-07-15", "8:30am ET",  "PPI Report (Jun)",             "inflation",  "medium"),
    ("2026-08-13", "8:30am ET",  "PPI Report (Jul)",             "inflation",  "medium"),
    ("2026-09-11", "8:30am ET",  "PPI Report (Aug)",             "inflation",  "medium"),
    ("2026-10-14", "8:30am ET",  "PPI Report (Sep)",             "inflation",  "medium"),
    ("2026-11-13", "8:30am ET",  "PPI Report (Oct)",             "inflation",  "medium"),
    ("2026-12-11", "8:30am ET",  "PPI Report (Nov)",             "inflation",  "medium"),

    # ── NFP / Jobs ───────────────────────────────────────────────────────────
    ("2026-06-05", "8:30am ET",  "Non-Farm Payrolls (May)",      "employment", "high"),
    ("2026-07-10", "8:30am ET",  "Non-Farm Payrolls (Jun)",      "employment", "high"),
    ("2026-08-07", "8:30am ET",  "Non-Farm Payrolls (Jul)",      "employment", "high"),
    ("2026-09-04", "8:30am ET",  "Non-Farm Payrolls (Aug)",      "employment", "high"),
    ("2026-10-02", "8:30am ET",  "Non-Farm Payrolls (Sep)",      "employment", "high"),
    ("2026-11-06", "8:30am ET",  "Non-Farm Payrolls (Oct)",      "employment", "high"),
    ("2026-12-04", "8:30am ET",  "Non-Farm Payrolls (Nov)",      "employment", "high"),

    # ── PCE ──────────────────────────────────────────────────────────────────
    ("2026-06-26", "8:30am ET",  "PCE Price Index (May)",        "inflation",  "high"),
    ("2026-07-31", "8:30am ET",  "PCE Price Index (Jun)",        "inflation",  "high"),
    ("2026-08-28", "8:30am ET",  "PCE Price Index (Jul)",        "inflation",  "high"),
    ("2026-09-25", "8:30am ET",  "PCE Price Index (Aug)",        "inflation",  "high"),
    ("2026-10-30", "8:30am ET",  "PCE Price Index (Sep)",        "inflation",  "high"),
    ("2026-11-25", "8:30am ET",  "PCE Price Index (Oct)",        "inflation",  "high"),
    ("2026-12-23", "8:30am ET",  "PCE Price Index (Nov)",        "inflation",  "high"),

    # ── GDP ───────────────────────────────────────────────────────────────────
    ("2026-06-25", "8:30am ET",  "GDP Q1 Final",                 "gdp",        "high"),
    ("2026-07-30", "8:30am ET",  "GDP Q2 Advance",               "gdp",        "high"),
    ("2026-09-30", "8:30am ET",  "GDP Q2 Final",                 "gdp",        "high"),
    ("2026-10-29", "8:30am ET",  "GDP Q3 Advance",               "gdp",        "high"),

    # ── Retail Sales ─────────────────────────────────────────────────────────
    ("2026-06-16", "8:30am ET",  "Retail Sales (May)",           "consumer",   "medium"),
    ("2026-07-17", "8:30am ET",  "Retail Sales (Jun)",           "consumer",   "medium"),
    ("2026-08-14", "8:30am ET",  "Retail Sales (Jul)",           "consumer",   "medium"),
    ("2026-09-17", "8:30am ET",  "Retail Sales (Aug)",           "consumer",   "medium"),
    ("2026-10-16", "8:30am ET",  "Retail Sales (Sep)",           "consumer",   "medium"),
    ("2026-11-17", "8:30am ET",  "Retail Sales (Oct)",           "consumer",   "medium"),
    ("2026-12-16", "8:30am ET",  "Retail Sales (Nov)",           "consumer",   "medium"),
]

CATEGORY_LABELS = {
    "fed":        "Fed",
    "inflation":  "Inflation",
    "employment": "Jobs",
    "gdp":        "GDP",
    "consumer":   "Consumer",
    "earnings":   "Earnings",
    "other":      "Other",
}


def _already_seeded(event_date: str, event_name: str) -> bool:
    try:
        result = (
            supabase.table("macro_events")
            .select("id", count="exact")
            .eq("event_date", event_date)
            .eq("event_name", event_name)
            .limit(1)
            .execute()
        )
        return (result.count or 0) > 0
    except Exception:
        return False


def seed_macro_events() -> str:
    inserted = 0
    skipped  = 0

    for event_date, event_time, event_name, category, importance in MACRO_SCHEDULE:
        if _already_seeded(event_date, event_name):
            skipped += 1
            continue

        try:
            supabase.table("macro_events").insert({
                "event_date":  event_date,
                "event_time":  event_time,
                "event_name":  event_name,
                "category":    category,
                "importance":  importance,
            }).execute()
            inserted += 1
        except Exception as e:
            logger.error("macro_events: insert failed for {} {} — {}", event_date, event_name, e)
            sentry_sdk.capture_exception(e)

    summary = f"{inserted} inserted, {skipped} skipped"
    logger.info("macro_events seed complete — {}", summary)
    return summary


def get_upcoming_events(days: int = 30) -> list[dict]:
    today  = date.today().isoformat()
    cutoff = (date.today() + timedelta(days=days)).isoformat()
    try:
        result = (
            supabase.table("macro_events")
            .select("*")
            .gte("event_date", today)
            .lte("event_date", cutoff)
            .order("event_date")
            .order("event_time")
            .execute()
        )
        return result.data or []
    except Exception as e:
        logger.error("macro_events: fetch failed — {}", e)
        return []
