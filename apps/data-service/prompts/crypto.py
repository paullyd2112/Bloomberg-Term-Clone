"""Crypto scoring prompt — referenced by scoring/engine.py."""

SYSTEM_PROMPT = """You are a crypto analyst who understands market sentiment, on-chain dynamics, and technical momentum. You generate clear, actionable signals for retail traders.

Be direct — reference specific indicator values and the Fear & Greed reading in your reasoning.

Rules:
- Fear & Greed < 25 (Extreme Fear): contrarian BUY setups have higher conviction
- Fear & Greed > 75 (Extreme Greed): be cautious on new BUYs, note overheated market
- Volume ratio > 3x average: significant anomaly, confirms directional move
- RSI > 75 on crypto: more meaningful than stocks given volatility norms
- RSI < 25 on crypto: deep oversold, potential reversal setup
- MACD histogram direction matters more than absolute value for crypto
- Meme coins (PEPE, DOGE, WIF): sentiment and volume anomaly outweigh technicals
- BTC and ETH: weight technicals more heavily than sentiment
- Confidence 80-100: strong technical setup AND sentiment alignment
- Confidence 50-70: one factor strong, others mixed
- Below 50: return HOLD
- Never overclaim on crypto — volatility is high, humility is appropriate
- Sound like someone who actually trades crypto, not a compliance bot
- Reasoning under 180 words."""


def build_user_prompt(context: dict) -> str:
    symbol = context["identifier"]
    price  = context.get("current_price", "N/A")
    change = context.get("change_24h", "N/A")
    ind    = context.get("technical_indicators", {})
    fg     = context.get("fear_greed", {})

    lines = [
        f"Asset: {symbol}",
        f"Price: ${price} | 24h change: {change}%",
        "",
        f"Market sentiment — Fear & Greed Index: {fg.get('value', 'N/A')} ({fg.get('value_classification', 'N/A')})",
        "",
        "Technical indicators (1h bars, 7-day window):",
        f"  RSI-14: {ind.get('rsi_14', 'N/A')}",
        f"  MACD line: {ind.get('macd_line', 'N/A')} | Signal: {ind.get('macd_signal', 'N/A')} | Hist: {ind.get('macd_hist', 'N/A')}",
        f"  Volume ratio vs 7-day avg: {ind.get('volume_ratio', 'N/A')}x",
        f"  24h volume: ${ind.get('volume_24h', 'N/A')}",
    ]

    if context.get("market_cap"):
        lines.append(f"  Market cap: ${context['market_cap']:,.0f}")

    if context.get("news_headlines"):
        lines += ["", "Recent crypto news:"]
        for h in context["news_headlines"]:
            lines.append(f"  - {h}")

    lines += ["", "Generate a trading signal. Reference Fear & Greed and specific indicator values in your reasoning."]
    return "\n".join(lines)
