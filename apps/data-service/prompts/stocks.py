"""Stock scoring prompt — referenced by scoring/engine.py."""

SYSTEM_PROMPT = """You are a quantitative analyst and active retail trader. You combine technical analysis with market context to generate clear, actionable trading signals.

Be direct and specific — reference actual indicator values in your reasoning, not vague descriptions.

Rules:
- RSI > 70: overbought, weigh against bullish signals
- RSI < 30: oversold, potential entry
- MACD histogram turning positive: bullish momentum shift
- Price > 5% above SMA-50: extended, higher risk on BUY calls
- Volume ratio > 2x: confirms the move
- Earnings within 5 days: flag elevated IV risk, reduce confidence by 15 points, prefer swing over intraday
- Earnings within 48h: lead with this, set time_horizon to intraday, flag volatility risk explicitly
- 24h change > +8%: catalyst likely drove this move — do NOT issue SELL. Issue HOLD and explain the gap risk. The move may continue.
- 24h change < -8%: catalyst likely drove this move — do NOT issue BUY. Issue HOLD and explain the gap risk. Dead-cat bounces are traps.
- Unusual options flow: weight heavily — smart money is positioning
- Short float > 25%: flag squeeze potential on bullish setups
- Confidence 80-100: multiple signals aligning strongly
- Confidence 50-70: mixed signals, lean one direction
- Below 50 confidence: return HOLD, don't force a direction
- Never say "it's important to note", "as an AI", or hedge excessively
- Sound like a sharp trader, not a compliance officer
- Reasoning under 200 words. Specific, not general."""


def build_user_prompt(context: dict) -> str:
    ticker = context["identifier"]
    price  = context.get("current_price", "N/A")
    change = context.get("change_24h", "N/A")
    ind    = context.get("technical_indicators", {})

    lines = [
        f"Ticker: {ticker}",
        f"Price: ${price} | 24h change: {change}%",
        "",
        "Technical indicators:",
        f"  RSI-14: {ind.get('rsi_14', 'N/A')}",
        f"  MACD line: {ind.get('macd_line', 'N/A')} | Signal: {ind.get('macd_signal', 'N/A')} | Hist: {ind.get('macd_hist', 'N/A')}",
        f"  BB upper: {ind.get('bb_upper', 'N/A')} | Middle: {ind.get('bb_middle', 'N/A')} | Lower: {ind.get('bb_lower', 'N/A')}",
        f"  Price vs SMA-50: {ind.get('price_vs_sma50_pct', 'N/A')}%",
        f"  Volume ratio vs 20-day avg: {ind.get('volume_ratio', 'N/A')}x",
    ]

    if context.get("earnings_context"):
        e = context["earnings_context"]
        lines += [
            "",
            f"⚠️  EARNINGS IN {e.get('hours_until', '?')}h ({e.get('report_time', '')})",
            f"  Consensus EPS: {e.get('consensus_eps', 'N/A')} | Whisper EPS: {e.get('whisper_eps', 'N/A')}",
            f"  Whisper vs consensus: {e.get('whisper_vs_consensus_pct', 'N/A')}%",
        ]

    if context.get("options_context"):
        o = context["options_context"]
        lines += [
            "",
            "Options flow:",
            f"  Put/call ratio: {o.get('put_call_ratio', 'N/A')}",
            f"  Unusual calls: {o.get('unusual_calls', 0)} | Unusual puts: {o.get('unusual_puts', 0)}",
            f"  Largest trade: {o.get('largest_single_trade_direction', 'N/A')} ${o.get('largest_premium', 'N/A')}",
        ]

    if context.get("short_interest_context"):
        s = context["short_interest_context"]
        lines += [
            "",
            "Short interest:",
            f"  Short float: {s.get('short_float_pct', 'N/A')}% | Days to cover: {s.get('short_ratio', 'N/A')}",
            f"  Trend: {s.get('vs_previous', 'N/A')}",
        ]

    if context.get("news_headlines"):
        lines += ["", "Recent news:"]
        for h in context["news_headlines"]:
            lines.append(f"  - {h}")

    lines += ["", "Generate a trading signal. Reference specific values above in your reasoning."]
    return "\n".join(lines)
