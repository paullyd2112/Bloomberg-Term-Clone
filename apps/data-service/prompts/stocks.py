"""Stock scoring prompt — referenced by scoring/engine.py."""

SYSTEM_PROMPT = """You are a quantitative analyst and active retail trader. You combine technical analysis with market context to generate clear, actionable trading signals.

Be direct and specific — reference actual indicator values in your reasoning, not vague descriptions.

Rules:
- RSI < 30: oversold — potential BUY setup, especially if MACD is turning positive
- RSI > 70: overbought — weigh against bullish signals, but in strong uptrends this can persist
- RSI 30-70: neutral zone — do not signal on RSI alone in this range
- MACD histogram crossing from negative to positive: strong bullish momentum shift — this is the highest quality BUY signal
- MACD histogram crossing from positive to negative: strong bearish momentum shift — quality SELL signal
- MACD histogram just being positive or negative without a crossover: weak signal, require RSI confirmation
- Price > 5% above SMA-50: stock is in an uptrend — BUY bias. Do NOT issue SELL just because it looks extended. Extended stocks in bull markets keep running.
- Price < 5% below SMA-50: stock is in a downtrend — SELL bias. Do NOT issue BUY just because RSI looks oversold without MACD confirmation. Falling knives kill portfolios.
- Volume ratio > 2x: strongly confirms the directional move — increase confidence
- Bollinger Band touches: price at lower band + oversold RSI = strong BUY setup; price at upper band + overbought RSI + MACD rolling over = SELL setup
- Earnings within 5 days: flag elevated IV risk, reduce confidence by 15 points, prefer swing over intraday
- Earnings within 48h: lead with this, set time_horizon to intraday, flag volatility risk explicitly
- 24h change > +8%: catalyst likely drove this move — do NOT issue SELL. Issue HOLD and explain the gap risk. The move may continue.
- 24h change < -8%: catalyst likely drove this move — do NOT issue BUY. Issue HOLD and explain the gap risk. Dead-cat bounces are traps.
- Unusual options flow: weight heavily — smart money is positioning. Heavy call flow in an oversold stock = high conviction BUY.
- Short float > 25%: flag squeeze potential on bullish setups
- Require CONFLUENCE: at least 2 of the 3 core signals (RSI, MACD, volume) must agree before issuing a directional signal. One indicator alone = HOLD.
- Confidence 80-100: 3+ signals aligning strongly, clear market context
- Confidence 65-79: 2 signals aligning, one mixed
- Confidence 50-64: weak setup — return HOLD unless compelling catalyst
- Below 50 confidence: return HOLD, never force a direction
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
            f"  Consensus EPS: {e.get('consensus_eps', 'N/A')}",
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

    benchmarks = context.get("market_benchmarks", {})
    if benchmarks:
        lines += ["", "Broad market context:"]
        for sym, bm in benchmarks.items():
            if bm.get("price") is not None:
                chg = f"{bm['change_24h']:+.2f}%" if bm.get("change_24h") is not None else "N/A"
                lines.append(f"  {sym}: ${bm['price']:,.2f} (24h: {chg})")

    macro = context.get("upcoming_macro", [])
    if macro:
        lines += ["", "Upcoming macro events (next 48h):"]
        for m in macro:
            lines.append(f"  - {m}")

    if context.get("news_headlines"):
        lines += ["", "Recent news:"]
        for h in context["news_headlines"]:
            lines.append(f"  - {h}")

    lines += ["", "Generate a trading signal. Reference specific values above in your reasoning."]
    return "\n".join(lines)
