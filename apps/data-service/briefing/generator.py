"""
Morning briefing generator — runs weekdays at 8:30am ET.
Pulls overnight signals + market data, calls Claude, writes to daily_briefings.
"""

import os
from datetime import date, datetime, timedelta, timezone

import anthropic
import instructor
import sentry_sdk
from loguru import logger
from pydantic import BaseModel, Field
from typing import Literal

from supabase_client import supabase

MODEL      = "claude-sonnet-4-6"
MAX_TOKENS = 2048

_anthropic = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))
client     = instructor.from_anthropic(_anthropic)


# ─── Pydantic schema ──────────────────────────────────────────────────────────

class TopTrade(BaseModel):
    identifier:  str
    asset_type:  str
    direction:   str
    confidence:  int
    one_liner:   str = Field(..., min_length=10, max_length=120)


class MorningBriefing(BaseModel):
    headline:               str   = Field(..., min_length=20, max_length=120)
    day_tone:               Literal["cautious", "opportunistic", "volatile", "quiet"]
    market_overview:        str   = Field(..., min_length=50, max_length=600)
    top_trades:             list[TopTrade] = Field(..., min_length=1, max_length=5)
    macro_context:          str   = Field(..., min_length=30, max_length=400)
    prediction_market_edge: str   = Field(default="", max_length=400)
    watch_today:            list[str] = Field(..., min_length=1, max_length=8)
    risk_note:              str   = Field(..., min_length=20, max_length=300)


# ─── Data fetchers ────────────────────────────────────────────────────────────

def _fetch_overnight_signals(limit: int = 20) -> list[dict]:
    since = (datetime.now(timezone.utc) - timedelta(hours=18)).isoformat()
    try:
        result = (
            supabase.table("signals")
            .select("identifier, asset_type, direction, confidence, reasoning, time_horizon")
            .eq("is_backtest", False)
            .neq("direction", "HOLD")
            .gte("created_at", since)
            .gte("confidence", 60)
            .order("confidence", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data or []
    except Exception as e:
        logger.warning("briefing: overnight signals fetch failed — {}", e)
        return []


def _fetch_top_signal_ids(limit: int = 5) -> list[int]:
    since = (datetime.now(timezone.utc) - timedelta(hours=18)).isoformat()
    try:
        result = (
            supabase.table("signals")
            .select("id")
            .eq("is_backtest", False)
            .neq("direction", "HOLD")
            .gte("created_at", since)
            .gte("confidence", 60)
            .order("confidence", desc=True)
            .limit(limit)
            .execute()
        )
        return [r["id"] for r in (result.data or [])]
    except Exception as e:
        logger.warning("briefing: top signal ids fetch failed — {}", e)
        return []


def _fetch_market_snapshot() -> dict:
    tickers = ["SPY", "QQQ", "BTC", "ETH"]
    snapshot = {}
    try:
        result = (
            supabase.table("raw_prices")
            .select("identifier, price, change_24h")
            .in_("identifier", tickers)
            .order("captured_at", desc=True)
            .limit(20)
            .execute()
        )
        seen = set()
        for row in (result.data or []):
            sym = row["identifier"]
            if sym not in seen:
                seen.add(sym)
                snapshot[sym] = {
                    "price":     row["price"],
                    "change_24h": row["change_24h"],
                }
    except Exception as e:
        logger.warning("briefing: market snapshot fetch failed — {}", e)
    return snapshot


def _fetch_fear_greed() -> dict:
    try:
        result = (
            supabase.table("raw_prices")
            .select("price, metadata")
            .eq("identifier", "MARKET_SENTIMENT")
            .order("captured_at", desc=True)
            .limit(1)
            .execute()
        )
        if result.data:
            row = result.data[0]
            meta = row.get("metadata") or {}
            return {
                "value":                 int(row.get("price") or 50),
                "value_classification":  meta.get("value_classification", "Neutral"),
            }
    except Exception:
        pass
    return {"value": 50, "value_classification": "Neutral"}


def _fetch_top_prediction_signals(limit: int = 3) -> list[dict]:
    since = (datetime.now(timezone.utc) - timedelta(hours=18)).isoformat()
    try:
        result = (
            supabase.table("signals")
            .select("identifier, direction, confidence, reasoning")
            .eq("asset_type", "prediction")
            .eq("is_backtest", False)
            .neq("direction", "HOLD")
            .gte("created_at", since)
            .gte("confidence", 60)
            .order("confidence", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data or []
    except Exception as e:
        logger.warning("briefing: prediction signals fetch failed — {}", e)
        return []


def _fetch_recent_news(limit: int = 6) -> list[str]:
    since = (datetime.now(timezone.utc) - timedelta(hours=18)).isoformat()
    try:
        result = (
            supabase.table("news_items")
            .select("headline")
            .gte("published_at", since)
            .order("published_at", desc=True)
            .limit(limit)
            .execute()
        )
        return [r["headline"] for r in (result.data or []) if r.get("headline")]
    except Exception as e:
        logger.warning("briefing: news fetch failed — {}", e)
        return []


# ─── Prompt builder ───────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are the head analyst at Plebs.io, a trading intelligence platform for retail traders. Every weekday morning you write a concise, high-signal morning briefing.

Tone: sharp, direct, WSB-adjacent but not cringe. Like a smart friend who actually trades — not a compliance bot. Use plain English. No asterisks, no bullet headers in prose sections.

Rules:
- headline: 1 punchy sentence that captures the day's thesis
- day_tone: pick the one that best fits (cautious / opportunistic / volatile / quiet)
- market_overview: 2-3 sentences on SPY/QQQ/BTC/ETH moves + Fear & Greed context
- top_trades: the 3-5 highest-conviction signals from overnight. one_liner must be ≤120 chars and punchy
- macro_context: 2-3 sentences on what's driving the macro backdrop today
- prediction_market_edge: 1-2 sentences on any Polymarket signal with edge — skip if none
- watch_today: tickers/identifiers worth watching, not necessarily in top_trades
- risk_note: 1-2 sentences on the key risk to today's thesis. Be honest."""


def _build_prompt(
    signals: list[dict],
    snapshot: dict,
    fear_greed: dict,
    pred_signals: list[dict],
    news: list[str],
) -> str:
    lines = [
        f"Date: {date.today().strftime('%A, %B %-d, %Y')}",
        "",
        "=== MARKET SNAPSHOT ===",
    ]
    for sym, data in snapshot.items():
        chg = data.get("change_24h")
        chg_str = f"{chg:+.2f}%" if chg is not None else "N/A"
        lines.append(f"  {sym}: ${data.get('price', 'N/A')} ({chg_str})")

    lines += [
        "",
        f"Fear & Greed: {fear_greed['value']} — {fear_greed['value_classification']}",
        "",
        "=== OVERNIGHT SIGNALS (confidence ≥60, non-HOLD) ===",
    ]
    if signals:
        for s in signals:
            lines.append(
                f"  [{s['asset_type'].upper()}] {s['identifier']} → {s['direction']} "
                f"({s['confidence']}%) | {s['reasoning'][:120]}"
            )
    else:
        lines.append("  No high-confidence signals overnight.")

    if pred_signals:
        lines += ["", "=== PREDICTION MARKET SIGNALS ==="]
        for s in pred_signals:
            lines.append(
                f"  {s['identifier']} → {s['direction']} ({s['confidence']}%) | {s['reasoning'][:100]}"
            )

    if news:
        lines += ["", "=== RECENT HEADLINES ==="]
        for h in news:
            lines.append(f"  - {h}")

    lines += ["", "Write the morning briefing based on the above data."]
    return "\n".join(lines)


# ─── Main generator ───────────────────────────────────────────────────────────

def generate_morning_briefing() -> str:
    today = date.today()

    # Skip if already generated today
    try:
        existing = (
            supabase.table("daily_briefings")
            .select("id")
            .eq("date", today.isoformat())
            .limit(1)
            .execute()
        )
        if existing.data:
            logger.info("briefing: already generated for {}", today)
            return f"already exists for {today}"
    except Exception as e:
        logger.warning("briefing: existence check failed — {}", e)

    signals      = _fetch_overnight_signals()
    snapshot     = _fetch_market_snapshot()
    fear_greed   = _fetch_fear_greed()
    pred_signals = _fetch_top_prediction_signals()
    news         = _fetch_recent_news()
    signal_ids   = _fetch_top_signal_ids()

    prompt = _build_prompt(signals, snapshot, fear_greed, pred_signals, news)

    try:
        briefing: MorningBriefing = client.chat.completions.create(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
            response_model=MorningBriefing,
        )
    except Exception as e:
        logger.error("briefing: Claude call failed — {}", e)
        sentry_sdk.capture_exception(e)
        return f"Claude failed: {e}"

    content_json = {
        "market_overview":        briefing.market_overview,
        "top_trades":             [t.model_dump() for t in briefing.top_trades],
        "macro_context":          briefing.macro_context,
        "prediction_market_edge": briefing.prediction_market_edge,
        "watch_today":            briefing.watch_today,
        "risk_note":              briefing.risk_note,
    }

    try:
        supabase.table("daily_briefings").insert({
            "date":           today.isoformat(),
            "headline":       briefing.headline,
            "content_json":   content_json,
            "top_signal_ids": signal_ids,
            "day_tone":       briefing.day_tone,
            "generated_at":   datetime.now(timezone.utc).isoformat(),
        }).execute()
        logger.info("briefing: generated for {} — \"{}\"", today, briefing.headline)
        return f"generated: {briefing.headline}"
    except Exception as e:
        logger.error("briefing: write to Supabase failed — {}", e)
        sentry_sdk.capture_exception(e)
        return f"write failed: {e}"
