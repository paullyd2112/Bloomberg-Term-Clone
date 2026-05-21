"""Prediction markets scoring prompt — referenced by scoring/engine.py."""

SYSTEM_PROMPT = """You are an expert prediction market trader with deep probabilistic reasoning skills. You've traded on Kalshi and Polymarket and understand how to find mispriced odds.

Your job is to assess whether the current market price (YES probability) reflects the true probability of the event occurring.

Rules:
- Current price IS the market's consensus. Your job is to find edge vs that consensus.
- Edge detected = you believe true probability differs meaningfully (>5pp) from current price
- If YES price is 0.45 and you think true probability is 0.55 — that's a YES signal with edge
- If YES price is 0.72 and you think true probability is 0.68 — no meaningful edge, return HOLD
- Reference specific reasons WHY the market may be mispriced (recent news, event timing, base rates)
- For macro markets (Fed, CPI, GDP): reference FRED data context if available
- For crypto markets: reference current BTC/ETH price action
- For political markets: be extra calibrated — these are notoriously hard to price
- Confidence 80-100: clear edge with strong supporting evidence
- Confidence 50-70: possible edge, uncertain
- Below 50: HOLD — no edge found
- Be calibrated. Low confidence is fine and honest. Never overclaim.
- edge_explanation must state: current price, your estimated fair value, and WHY
- Reasoning under 200 words."""


def build_user_prompt(context: dict) -> str:
    identifier = context["identifier"]
    meta       = context.get("metadata", {})
    title      = meta.get("title", identifier)
    platform   = meta.get("source", "unknown").upper()
    yes_price  = context.get("current_price", "N/A")
    volume     = context.get("volume", "N/A")
    category   = meta.get("category", "N/A")
    change     = context.get("change_24h", "N/A")

    # Convert decimal price to percentage for readability
    yes_pct = f"{float(yes_price) * 100:.1f}%" if yes_price != "N/A" else "N/A"

    lines = [
        f"Platform: {platform}",
        f"Category: {category}",
        f"Market: {title}",
        "",
        f"Current YES price: {yes_pct} (market implies {yes_pct} probability of YES)",
        f"24h volume: ${volume:,.0f}" if isinstance(volume, (int, float)) else f"24h volume: {volume}",
        f"24h price change: {change}pp" if change != "N/A" else "",
    ]

    if context.get("close_time"):
        lines.append(f"Resolves: {context['close_time']}")

    if context.get("news_headlines"):
        lines += ["", "Recent relevant news:"]
        for h in context["news_headlines"]:
            lines.append(f"  - {h}")

    lines += [
        "",
        "Assess whether this market is correctly priced.",
        "If you find edge, explain the specific mispricing.",
        "If no edge, return HOLD with low confidence — that is the honest answer.",
    ]

    return "\n".join(l for l in lines if l is not None)
