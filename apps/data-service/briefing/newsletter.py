"""
Daily newsletter generator — runs weekdays at 7:00am ET (sends at 7:15am).
Produces two versions of the same email:
  - Free: Jake's editorial + market recap + CTA
  - Paid (Pro/Elite): same editorial + personalized signal data layered on top
"""

import json
import os
from datetime import date, datetime, timedelta, timezone
from typing import Literal

import anthropic
import instructor
import sentry_sdk
from loguru import logger
from pydantic import BaseModel, Field, field_validator

from supabase_client import supabase

MODEL      = "claude-sonnet-5"
MAX_TOKENS = 8000

_anthropic = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))
client     = instructor.from_anthropic(_anthropic)

APP_URL = os.environ.get("NEXT_PUBLIC_APP_URL", "https://plebs.finance")


# ─── Pydantic schemas ─────────────────────────────────────────────────────────

class NewsletterStory(BaseModel):
    category:     str = Field(..., min_length=3, max_length=40)
    headline:     str = Field(..., min_length=10, max_length=120)
    # max_length is generous here because the prompt asks for 2-4 inline
    # markdown links per field ([text](url)), and source URLs (Google News
    # RSS redirects especially) routinely run 150-250+ characters each --
    # that's counted against the cap even though readers only see the anchor
    # text. A 1000-char cap failed live 3/3 retries on 2026-07-07 purely from
    # citation URL bulk, not from the visible prose being too long.
    what_happened: str = Field(..., min_length=100, max_length=2000)
    what_we_know:  str = Field(..., min_length=100, max_length=2000)
    could_mean:    str = Field(..., min_length=100, max_length=2000)
    watch:         str = Field(..., min_length=40, max_length=1000)


class NewsletterContent(BaseModel):
    subject_line:  str = Field(..., min_length=10, max_length=80)
    opening_line:  str = Field(..., min_length=30, max_length=300)
    stories:       list[NewsletterStory] = Field(..., min_length=4, max_length=5)
    # Optional, not a full story: a short, casual mention of non-market
    # things people are talking about today (sports, entertainment, pop
    # culture). No min_length -- some days genuinely have nothing worth
    # including, and forcing one would mean padding or fabricating.
    quick_hits:    str | None = Field(None, max_length=500)
    closing_line:  str = Field(..., min_length=30, max_length=300)
    market_vibe:   Literal["bullish", "bearish", "mixed", "quiet"]

    @field_validator("stories", mode="before")
    @classmethod
    def _parse_stringified_stories(cls, v):
        """Claude occasionally returns this field as a JSON-encoded string
        instead of a native array (observed live 2026-07-06, killed that
        day's newsletter with no automatic recovery). Parse it instead of
        hard-failing validation."""
        if isinstance(v, str):
            return json.loads(v)
        return v


NEWSLETTER_SYSTEM_PROMPT = """You are the voice of Plebs.finance. You write a daily finance newsletter for retail traders.

YOUR VOICE:
- You're 28, former analyst, now writing for regular people who are serious about markets
- Direct. No throat-clearing. Get to the point in the first sentence
- Data first, then what it means in plain English
- Dry humor — occasional one-liner, never try-hard
- Honest about uncertainty. "We don't know yet" is fine. Don't fake confidence
- Short sentences. Vary the rhythm. Mix in a longer one when you need to explain something
- Smart but never academic. Never condescending

COVERAGE SCOPE:
You are NOT just a signal recap. You are a market analyst writing a morning brief. Cover the full landscape:
- The signal data below is your starting point, not your whole story
- Connect dots: a geopolitical event affects oil, which affects transport costs, which affects earnings
- Cover macro themes: rate decisions, inflation prints, geopolitics (wars, sanctions, strait closures), supply chain disruptions, commodity moves, currency shifts
- Cover sector narratives: chip shortages and semis, energy and oil supply, AI infrastructure spend, banking stress, housing data
- Cover AI/tech industry news on its own terms, not just as capex: a new model release, a product launch, a usage-tier or pricing change from a major AI lab (OpenAI, Anthropic, Google, Meta) is a story readers care about, both for what it signals about the AI trade and because plenty of readers use these products directly
- Think about what's moving markets TODAY and what smart money is watching THIS WEEK
- Geopolitics is one theme among several, not the default. A big geopolitical story (Iran, China trade, energy crisis) earns its spot the same way an AI product launch, a sentiment shift, or a sector narrative does: because it's the most interesting thing that happened, not because it's geopolitics
- Use the news headlines provided to identify broader themes beyond just ticker-level moves

STORY ORDER — THIS MATTERS:
- Story 1 MUST be a hook that sets the tone for the whole newsletter, something that makes people lean in. Rotate what kind of hook it is based on what's actually most interesting today, don't default to the same category every day. Good hooks: a macro/Fed/inflation story, a geopolitical move, a cultural/generational market narrative ("Gen Z thinks the American Dream is dead"), or a major AI/tech industry story (a new model launch, a big product release). If the biggest story of the day is a geopolitical one, lead with it; if it's an AI launch or a sentiment shift, lead with that instead. Don't reach for geopolitics out of habit when something else is the more interesting lead.
- Stories 2-3 should be your strongest signal-driven or sector narratives
- MAXIMUM 2 crypto stories per newsletter. No exceptions. If the data has 5 crypto signals, pick the 2 most interesting and weave the rest into broader narratives. Never put crypto stories back-to-back. Readers get crypto fatigue fast.
- End with something forward-looking or a lighter "watch this" story

STRUCTURE FOR EVERY STORY:
- category: short tag for the section (e.g. "EARNINGS SEASON", "FED WATCH", "CRYPTO CORNER", "THE TRADE DESK", "CONGRESS IS TRADING AGAIN", "GEOPOLITICS", "ENERGY", "SUPPLY CHAIN", "COMMODITIES", "AI WATCH")
- headline: punchy, opinionated headline. This is the hook
- what_happened: the fact + numbers, 2-3 sentences with real detail. Tight, not exhaustive
- what_we_know: what the data actually says and the broader context, 2-3 sentences
- could_mean: your take with second-order effects, clearly framed as opinion, 2-3 sentences
- watch: forward looking, specific catalysts and dates, 1-2 sentences

QUICK HITS — OPTIONAL, NOT A STORY:
- One short, casual aside (1-3 sentences, no markdown structure, no headline) mentioning something people are talking about today that has nothing to do with markets: sports results, a big cultural moment, celebrity news, whatever's actually in the air. Think "oh yeah, also this happened" energy, not a fifth story.
- This is what makes the newsletter feel like it's written by a person paying attention to the same day everyone else lived, not a bot that only reads tickers.
- CRITICAL: only use this if a non-market item actually appears in the news headlines provided below. Never invent or recall a sports score, event outcome, or celebrity item from your own memory. This newsletter's news feed is market/tech/geopolitics-focused, so most days there will be nothing here to include, and that's fine. Fabricating a plausible-sounding but unverified real-world claim is worse than leaving this out. Skip it entirely when the data below gives you nothing.

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
- Em dashes (—). Use periods, commas, or colons instead. This is the #1 tell of AI writing. ZERO em dashes in the entire output.
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
Good: "The Fed held rates. Again. Markets shrugged, with the **S&P up 0.3%** on the day. Here's what [actually matters in the statement](https://fed.gov/fomc)."
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
            .gte("confidence", 70)
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


def _fetch_recent_news(limit: int = 25) -> list[dict]:
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


def _fetch_yesterday_performance() -> dict | None:
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    day_before = (date.today() - timedelta(days=2)).isoformat()
    try:
        result = (
            supabase.table("signals")
            .select("outcome, identifier, asset_type, direction")
            .in_("outcome", ["WIN", "LOSS"])
            .gte("created_at", day_before + "T00:00:00Z")
            .lt("created_at", yesterday + "T23:59:59Z")
            .execute()
        )
        rows = result.data or []
        if not rows:
            return None
        wins = [r for r in rows if r["outcome"] == "WIN"]
        losses = [r for r in rows if r["outcome"] == "LOSS"]
        total = len(wins) + len(losses)
        return {
            "wins": len(wins),
            "losses": len(losses),
            "total": total,
            "win_rate": round(len(wins) / total * 100, 1) if total > 0 else 0,
            "win_tickers": [f"{r['identifier']} ({r['direction']})" for r in wins[:5]],
            "loss_tickers": [f"{r['identifier']} ({r['direction']})" for r in losses[:5]],
        }
    except Exception as e:
        logger.warning("newsletter: yesterday performance fetch failed — {}", e)
        return None


# ─── Generator ────────────────────────────────────────────────────────────────

def _build_user_prompt(
    signals: list[dict],
    congress: list[dict],
    options: list[dict],
    macro: list[dict],
    news: list[dict],
    yesterday_perf: dict | None = None,
) -> str:
    today = date.today().strftime("%A, %B %-d, %Y")

    parts = [f"Today is {today}. Write the Plebs.finance daily newsletter.\n"]

    if yesterday_perf:
        parts.append("YESTERDAY'S SIGNAL SCORECARD:")
        parts.append(
            f"  {yesterday_perf['wins']}W – {yesterday_perf['losses']}L "
            f"({yesterday_perf['win_rate']}% win rate) across {yesterday_perf['total']} resolved signals"
        )
        if yesterday_perf["win_tickers"]:
            parts.append(f"  Winners: {', '.join(yesterday_perf['win_tickers'])}")
        if yesterday_perf["loss_tickers"]:
            parts.append(f"  Misses: {', '.join(yesterday_perf['loss_tickers'])}")
        parts.append(
            "  Work this into the opening or a brief 'signal scorecard' section. "
            "Keep it factual and confident — this builds reader trust.\n"
        )

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
        "\nWrite 4-5 stories using the structure. DO NOT just recap the signals above. "
        "Use the signals and news as a starting point, then broaden out. Fewer, tighter stories "
        "beats more, longer ones: a reader should finish this wanting more, not relieved it's over.\n\n"
        "STORY ORDER (follow this exactly):\n"
        "1. LEAD WITH THE MOST INTERESTING HOOK OF THE DAY. Story 1 must be a big-picture story: "
        "a macro theme, cultural/generational market narrative, geopolitical shift, major AI/tech "
        "industry news (model launch, product release, usage-tier change from a major AI lab), or "
        "sentiment story that makes the reader lean in. This is not a ticker recap. "
        "Pick whichever of these is genuinely the biggest story today, don't default to geopolitics "
        "just because it's available. This is the story that sets the tone and keeps people scrolling.\n"
        "2. Stories 2-3: your strongest signal-driven or sector narratives.\n"
        "3. Stories 4-5: mix of remaining signals, congressional trades, options flow, "
        "and forward-looking themes.\n\n"
        "CRYPTO CAP: Maximum 2 crypto-focused stories per newsletter. Pick the 2 most interesting "
        "if the data has more. Never place them back-to-back. Mention other crypto moves inside "
        "broader market stories if needed, but don't give them their own section.\n\n"
        "MIX OF STORIES:\n"
        "- 2 stories driven by the signal data and ticker-level moves above\n"
        "- 1 story on macro/geopolitical themes: oil supply, rate policy, sanctions, "
        "trade wars, currency moves, inflation data. Connect these to specific sectors and tickers. "
        "This is a ceiling, not a quota: skip it entirely on a day with no real geopolitical news "
        "rather than manufacturing one.\n"
        "- 1 story on AI/tech industry news when there's a real one in the data above: a new model "
        "release, product launch, or usage/pricing change from a major AI lab. Cover it as its own "
        "story, not folded into an AI-capex sector narrative, and connect it to what it means for "
        "users and for AI-adjacent stocks.\n"
        "- 1 story on sector narratives: chip supply chains, energy infrastructure, "
        "AI capex, banking/credit, housing, commodities. What's the bigger picture?\n"
        "- If there's a congressional trade worth highlighting, work it into a story.\n\n"
        "Opening line sets the tone for the day. Make it count.\n\n"
        "IMPORTANT: Each section (what_happened, what_we_know, could_mean) should be "
        "2-3 sentences, tight and specific, not 3-5. Say the one or two things that actually matter "
        "and stop. The reader should walk away feeling like they understand what's happening in "
        "markets, not like they read a report. "
        "Target 800-1200 words total across all stories, not 1500-2200 -- this newsletter has been "
        "running long and readers feel it. Cut, don't pad. "
        "Think second-order effects, but say them in one sentence: a chip shortage doesn't just hit "
        "semis, it hits autos and cloud providers waiting on server capacity.\n\n"
        "CRITICAL: Do NOT use em dashes (the long dash character). Use periods, commas, "
        "colons, or semicolons instead. This is non-negotiable.\n\n"
        "INLINE LINKS: Hyperlink key claims, ticker symbols, and data points directly "
        "in the prose using markdown: [text](url). Use the news URLs provided above "
        "for source citations. Link ticker symbols to plebs.finance/dashboard/asset/stock/TICKER "
        "or plebs.finance/dashboard/asset/crypto/TICKER. Use **bold** for tickers and key numbers. "
        "NEVER fabricate a URL — only use URLs from the data above or plebs.finance dashboard links."
    )

    return "\n".join(parts)


def _alert_generation_failure(reason: str) -> None:
    """Email alert on generation failure. Sentry alone isn't sufficient here --
    it's quota-capped (see CLAUDE.md), and a missed 7am generation means no
    briefing row and a silently-skipped 7:15 send with no other signal that
    anything went wrong (observed live July 3)."""
    try:
        import resend
        resend.api_key = os.environ.get("RESEND_API_KEY", "") or os.environ.get("RESEND_API_KEY_", "")
        if not resend.api_key:
            return
        alert_email = os.environ.get("ALERT_EMAIL", "paulsolomonaqua@gmail.com")
        resend.Emails.send({
            "from": "Plebs Alerts <alerts@plebs.finance>",
            "to": [alert_email],
            "subject": f"Newsletter generation FAILED — {date.today().isoformat()}",
            "text": f"generate_newsletter() failed: {reason}\n\n"
                    f"No briefing row was written for today. The 7:15am send will find "
                    f"nothing to send, and the 7:45am retry will attempt regeneration.",
        })
    except Exception as e:
        logger.warning("newsletter: failure-alert email itself failed — {}", e)


def generate_newsletter() -> dict | None:
    signals        = _fetch_recent_signals()
    congress       = _fetch_congressional_trades()
    options        = _fetch_options_flow()
    macro          = _fetch_macro_events_today()
    news           = _fetch_recent_news()
    yesterday_perf = _fetch_yesterday_performance()

    user_prompt = _build_user_prompt(signals, congress, options, macro, news, yesterday_perf)

    try:
        content: NewsletterContent = client.chat.completions.create(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            messages=[
                {"role": "user", "content": user_prompt},
            ],
            system=[{"type": "text", "text": NEWSLETTER_SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
            response_model=NewsletterContent,
            max_retries=2,
        )
    except Exception as e:
        logger.error("newsletter: generation failed — {}", e)
        sentry_sdk.capture_exception(e)
        _alert_generation_failure(f"Claude call failed: {type(e).__name__}: {e}")
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
                "quick_hits":    content.quick_hits,
                "closing_line":  content.closing_line,
                "market_vibe":   content.market_vibe,
                "top_signals":   signals[:5],
                "options_flow":  options[:3],
                "congress":      congress[:3],
                "macro_today":   macro,
                "yesterday_performance": yesterday_perf,
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
        _alert_generation_failure(f"DB write failed: {type(e).__name__}: {e}")
        return None


def _map_vibe(vibe: str) -> str:
    return {"bullish": "opportunistic", "bearish": "cautious",
            "mixed": "volatile", "quiet": "quiet"}.get(vibe, "quiet")
