"""
Daily newsletter generator — runs weekdays at 6:30am ET (sends at 7am).
Produces two versions of the same email:
  - Free: Jake's editorial + market recap + CTA
  - Paid (Pro/Elite): same editorial + personalized signal data layered on top
"""

import os
from datetime import date, datetime, timedelta, timezone
from typing import Literal

import anthropic
import instructor
import sentry_sdk
from loguru import logger
from pydantic import BaseModel, Field

from supabase_client import supabase

MODEL      = "claude-sonnet-4-6"
MAX_TOKENS = 4500

_anthropic = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))
client     = instructor.from_anthropic(_anthropic)

APP_URL = os.environ.get("NEXT_PUBLIC_APP_URL", "https://plebs.finance")


# ─── Pydantic schemas ─────────────────────────────────────────────────────────

class NewsletterStory(BaseModel):
    category:     str = Field(..., min_length=3, max_length=40)
    headline:     str = Field(..., min_length=10, max_length=120)
    what_happened: str = Field(..., min_length=60, max_length=600)
    what_we_know:  str = Field(..., min_length=60, max_length=600)
    could_mean:    str = Field(..., min_length=60, max_length=600)
    watch:         str = Field(..., min_length=30, max_length=300)


class NewsletterContent(BaseModel):
    subject_line:  str = Field(..., min_length=10, max_length=80)
    opening_line:  str = Field(..., min_length=30, max_length=300)
    stories:       list[NewsletterStory] = Field(..., min_length=3, max_length=5)
    closing_line:  str = Field(..., min_length=30, max_length=300)
    market_vibe:   Literal["bullish", "bearish", "mixed", "quiet"]


NEWSLETTER_SYSTEM_PROMPT = """You are the voice of Plebs.finance. You write a daily finance newsletter for retail traders.

YOUR VOICE:
- You're 28, former analyst, now writing for regular people who are serious about markets
- Direct. No throat-clearing. Get to the point in the first sentence
- Data first, then what it means in plain English
- Dry humor — occasional one-liner, never try-hard
- Honest about uncertainty. "We don't know yet" is fine. Don't fake confidence
- Short sentences. Vary the rhythm. Mix in a longer one when you need to explain something
- Smart but never academic. Never condescending

STRUCTURE FOR EVERY STORY:
- category: short tag for the section (e.g. "EARNINGS SEASON", "FED WATCH", "CRYPTO CORNER", "THE TRADE DESK", "CONGRESS IS TRADING AGAIN")
- headline: punchy, opinionated headline — this is the hook
- what_happened: the fact + numbers, 2-4 sentences
- what_we_know: what the data actually says, 2-4 sentences
- could_mean: your take, clearly framed as opinion, 2-4 sentences
- watch: forward looking, specific, 1-2 sentences

INLINE LINKS — THIS IS CRITICAL:
- Use markdown links inside the story text: [anchor text](url)
- Link key claims to their source: "NVDA [beat earnings by $0.40](https://example.com/article)"
- Link ticker symbols to the Plebs dashboard: [$AAPL](https://plebs.finance/dashboard/asset/stock/AAPL)
- Link company names to relevant articles when a URL is available
- Use **bold** for ticker symbols and key numbers: **$NVDA**, **up 18% YoY**, **$1.2B in volume**
- Aim for 2-4 inline links per story — weave them naturally into the prose
- ONLY use URLs provided in the data below. NEVER fabricate a URL. If no URL is available for a claim, don't link it.
- For tickers, always link to: https://plebs.finance/dashboard/asset/stock/TICKER or https://plebs.finance/dashboard/asset/crypto/TICKER

HARD BANNED — never write these:
- "It's worth noting" / "Notably" used as filler
- "As we navigate" / "navigate the landscape"
- "Unpack" / "delve into" / "dive deep"
- "At the end of the day"
- "In conclusion" / "To summarize"
- "Game-changer" / "paradigm shift"
- "It remains to be seen"
- Anything that sounds like a press release or a GPT response
- Rhetorical questions to the reader
- Exclamation marks

TONE REFERENCE:
Good: "The Fed held rates. Again. Markets shrugged — **S&P up 0.3%** on the day. Here's what [actually matters in the statement](https://fed.gov/fomc)."
Bad: "In a landmark decision that underscores the complexity of today's monetary landscape, the Federal Reserve has opted to maintain its current interest rate policy."

Good: "**$NVDA** [beat by $0.40](https://example.com/nvda-earnings). Revenue up 18% YoY. The stock popped 6% after hours, which tells you how low expectations had gotten."
Bad: "NVIDIA delivered impressive results that exceeded analyst expectations, demonstrating the company's continued strength in the AI space."

Write like you're texting a smart friend who follows markets. Not like you're filing a report."""


# ─── Data fetchers ────────────────────────────────────────────────────────────

def _fetch_recent_signals(limit: int = 15) -> list[dict]:
    since = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
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
        logger.warning("newsletter: signals fetch failed — {}", e)
        return []


def _fetch_congressional_trades(limit: int = 5) -> list[dict]:
    since = (datetime.now(timezone.utc) - timedelta(days=3)).isoformat()
    try:
        result = (
            supabase.table("congressional_trades")
            .select("politician, party, ticker, transaction, amount_range, trade_date")
            .gte("created_at", since)
            .order("trade_date", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data or []
    except Exception as e:
        logger.warning("newsletter: congressional fetch failed — {}", e)
        return []


def _fetch_options_flow(limit: int = 5) -> list[dict]:
    since = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    try:
        result = (
            supabase.table("options_flow")
            .select("ticker, option_type, strike, expiry, volume, open_interest, unusual_score")
            .gte("created_at", since)
            .order("unusual_score", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data or []
    except Exception as e:
        logger.warning("newsletter: options flow fetch failed — {}", e)
        return []


def _fetch_macro_events_today() -> list[dict]:
    today = date.today().isoformat()
    try:
        result = (
            supabase.table("macro_events")
            .select("event_name, event_time, importance, forecast, previous")
            .eq("event_date", today)
            .order("importance")
            .execute()
        )
        return result.data or []
    except Exception as e:
        logger.warning("newsletter: macro events fetch failed — {}", e)
        return []


def _fetch_recent_news(limit: int = 15) -> list[dict]:
    since = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    try:
        result = (
            supabase.table("news_items")
            .select("headline, source, url, identifier")
            .gte("published_at", since)
            .order("published_at", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data or []
    except Exception as e:
        logger.warning("newsletter: news fetch failed — {}", e)
        return []


# ─── Generator ────────────────────────────────────────────────────────────────

def _build_user_prompt(
    signals: list[dict],
    congress: list[dict],
    options: list[dict],
    macro: list[dict],
    news: list[dict],
) -> str:
    today = date.today().strftime("%A, %B %-d, %Y")

    parts = [f"Today is {today}. Write the Plebs.finance daily newsletter.\n"]

    if signals:
        parts.append("SIGNALS FIRED IN THE LAST 24 HOURS:")
        for s in signals:
            parts.append(
                f"  {s['identifier']} ({s['asset_type']}) — {s['direction']} "
                f"confidence {s['confidence']}% — {s.get('reasoning', '')[:200]}"
            )

    if congress:
        parts.append("\nCONGRESSIONAL TRADES (last 3 days):")
        for c in congress:
            parts.append(
                f"  {c['politician']} ({c['party']}) — {c['transaction'].upper()} "
                f"{c['ticker']} — {c['amount_range']} on {c['trade_date']}"
            )

    if options:
        parts.append("\nUNUSUAL OPTIONS FLOW (last 24h):")
        for o in options:
            parts.append(
                f"  {o['ticker']} — {o['option_type'].upper()} — "
                f"vol {o['volume']} vs OI {o['open_interest']}"
            )

    if macro:
        parts.append("\nMACRO EVENTS TODAY:")
        for m in macro:
            line = f"  {m['event_name']} at {m['event_time']} [{m['importance'].upper()}]"
            if m.get("forecast"):
                line += f" — forecast: {m['forecast']}"
            parts.append(line)

    if news:
        parts.append("\nRECENT NEWS (with source URLs — use these for citations):")
        for n in news:
            url = n.get("url", "")
            source = n.get("source", "")
            ticker = n.get("identifier", "")
            parts.append(
                f"  [{ticker}] {n.get('headline', '')} — {source}"
                + (f" — {url}" if url else "")
            )

    parts.append(
        "\nWrite 3-5 stories using the structure. Pick the most interesting data above. "
        "If there's a congressional trade worth highlighting, work it into a story. "
        "Opening line sets the tone for the day — make it count.\n\n"
        "IMPORTANT: Each section (what_happened, what_we_know, could_mean) should be "
        "2-4 sentences — give real depth, not one-liners. The reader should walk away "
        "feeling informed, not teased. Target 600-900 words total across all stories.\n\n"
        "INLINE LINKS: Hyperlink key claims, ticker symbols, and data points directly "
        "in the prose using markdown: [text](url). Use the news URLs provided above "
        "for source citations. Link ticker symbols to plebs.finance/dashboard/asset/stock/TICKER "
        "or plebs.finance/dashboard/asset/crypto/TICKER. Use **bold** for tickers and key numbers. "
        "NEVER fabricate a URL — only use URLs from the data above or plebs.finance dashboard links."
    )

    return "\n".join(parts)


def generate_newsletter() -> dict | None:
    signals  = _fetch_recent_signals()
    congress = _fetch_congressional_trades()
    options  = _fetch_options_flow()
    macro    = _fetch_macro_events_today()
    news     = _fetch_recent_news()

    user_prompt = _build_user_prompt(signals, congress, options, macro, news)

    try:
        content: NewsletterContent = client.chat.completions.create(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            messages=[
                {"role": "user", "content": user_prompt},
            ],
            system=NEWSLETTER_SYSTEM_PROMPT,
            response_model=NewsletterContent,
        )
    except Exception as e:
        logger.error("newsletter: generation failed — {}", e)
        sentry_sdk.capture_exception(e)
        return None

    today = date.today().isoformat()

    try:
        existing = (
            supabase.table("daily_briefings")
            .select("id")
            .eq("date", today)
            .limit(1)
            .execute()
        )

        record = {
            "date":         today,
            "headline":     content.subject_line,
            "day_tone":     _map_vibe(content.market_vibe),
            "content_json": {
                "opening_line":  content.opening_line,
                "stories":       [s.model_dump() for s in content.stories],
                "closing_line":  content.closing_line,
                "market_vibe":   content.market_vibe,
                "top_signals":   signals[:5],
                "options_flow":  options[:3],
                "congress":      congress[:3],
                "macro_today":   macro,
            },
        }

        if existing.data:
            supabase.table("daily_briefings").update(record).eq("date", today).execute()
        else:
            supabase.table("daily_briefings").insert(record).execute()

        logger.info("newsletter: generated for {}", today)
        return record

    except Exception as e:
        logger.error("newsletter: db write failed — {}", e)
        sentry_sdk.capture_exception(e)
        return None


def _map_vibe(vibe: str) -> str:
    return {"bullish": "opportunistic", "bearish": "cautious",
            "mixed": "volatile", "quiet": "quiet"}.get(vibe, "quiet")
