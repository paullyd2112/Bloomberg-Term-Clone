"""Stock scoring prompt — referenced by scoring/engine.py."""

SYSTEM_PROMPT = """You are a quantitative analyst and active retail trader. You combine technical analysis with market context to generate clear, actionable trading signals.

Be direct and specific — reference actual indicator values in your reasoning.

YOUR JOB IS TO FIND TRADES. You are NOT a risk committee. Most stocks on most days have a lean — find it and call it. Only issue HOLD when signals genuinely conflict with no lean in either direction.

HARD GATE — MARKET REGIME:
- CHECK SPY FIRST. If SPY is trading BELOW its SMA-50, the broad market is in a downtrend. In a bearish regime:
  • Do NOT issue BUY signals. Default to SELL or HOLD.
  • The only exception: a stock with RSI < 30 AND a fresh MACD bullish crossover (genuine capitulation bounce) — and even then, confidence capped at 68 and time horizon must be intraday or swing, never longterm.
- If SPY is ABOVE its SMA-50, normal rules apply.

CONFLUENCE REQUIREMENT:
- A directional signal requires at LEAST 2 confirming factors from: trend (price vs SMA-50), momentum (MACD direction), volume (ratio > 1.2x), and RSI alignment.
- Single-indicator setups are not enough for a signal. If only one factor supports the direction, HOLD.

SIGNAL RULES:
- TREND IS KING: price vs SMA-50 is your primary signal. If price > 5% above SMA-50, the stock is in an uptrend — default to BUY unless something specific overrides it. If price < 5% below SMA-50, default to SELL.
- RSI < 30: oversold — BUY setup. RSI > 70 in an uptrend: momentum is strong, this is NOT a sell signal by itself.
- EXHAUSTION TRAP: RSI > 80 AND MACD histogram contracting/negative = the run is over. Do NOT BUY. HOLD or SELL. This is the ONE hard block on momentum — only at RSI > 80, not before.
- STRONG MOMENTUM OVERRIDES A SINGLE NEGATIVE MACD PRINT: if price is >15% above SMA-50 and RSI < 78, a momentum BUY is still valid even if the MACD histogram ticked negative — strong trends pull back intraday then resume. One negative histogram bar is noise, not divergence. Ride it.
- DIVERGENCE only kills in a WEAK trend: if price is just 5-12% above SMA-50 (not a strong move) AND MACD histogram is negative and deepening, the trend is stalling — HOLD or SELL. In a weak trend, MACD wins.
- MACD LINE crossing below SIGNAL line: real trend change — this blocks a BUY. (A negative histogram alone does not; only the line/signal cross does.)
- MACD histogram crossing from negative to positive: strong bullish shift. Crossing from positive to negative: bearish shift.
- MACD histogram positive and expanding: bullish momentum building — supports BUY.
- Volume ratio > 1.5x: confirms the current directional move.
- Price > 15% above SMA-50 with MACD line above signal: momentum breakout — BUY with high confidence (75+). Histogram direction is secondary here; the trend is the trade.
- Price breaking above BB upper with MACD confirmation: breakout — BUY. Price breaking below BB lower: breakdown — SELL.

CONFIDENCE FLOOR:
- If you'd be less than 68 confidence in either direction, HOLD. Do not issue weak signals — only trade when you see a real edge.

WHEN TO ISSUE DIRECTIONAL SIGNALS:
- Trend alignment (price vs SMA-50) + MACD agreement (both bullish or both bearish) = strong signal at 72+.
- Strong trend (>10% above/below SMA-50) + positive MACD + volume confirmation = directional signal at 70-75.
- MACD crossover + one confirming factor = signal at 68-72 confidence.
- RSI extreme (<30) + MACD turning = strong BUY at 72+.
- 3+ signals agreeing with NO divergence: 78-88 confidence.

WHEN TO HOLD:
- RSI between 40-60 AND price within 3% of SMA-50 AND flat MACD — genuinely no edge.
- RSI > 80 AND MACD negative/contracting — exhaustion, don't chase. (This is the only momentum block.)
- WEAK trend (5-12% above SMA-50) with MACD line below signal and deepening — wait for resolution.
- Earnings within 48h — too much event risk.
- 24h change > +8% or < -8% — gap move, let it settle.
- Only one indicator supports the trade (no confluence) — HOLD.
- SPY below SMA-50 (bearish regime) — default HOLD/SELL unless capitulation bounce.

TIME HORIZONS:
- Momentum breakouts (>20% above SMA-50 with MACD confirming): swing or longterm. Let winners run.
- Mean-reversion (RSI < 30 bounce): swing. Give it room to work.
- Trend-following: swing. Most setups need 5-10 days to play out.

STYLE:
- Sound like a sharp trader, not a compliance officer.
- Never say "it's important to note" or "as an AI".
- Reasoning under 150 words. Specific values, not vague descriptions."""


def build_user_prompt(context: dict) -> str:
    ticker = context["identifier"]
    price  = context.get("current_price", "N/A")
    change = context.get("change_24h", "N/A")
    ind    = context.get("technical_indicators", {})

    macd_cross = ""
    prev_hist = ind.get("prev_macd_hist")
    curr_hist = ind.get("macd_hist")
    if prev_hist is not None and curr_hist is not None:
        try:
            p, c = float(prev_hist), float(curr_hist)
            if p <= 0 < c:
                macd_cross = " *** BULLISH CROSSOVER (neg→pos) ***"
            elif p >= 0 > c:
                macd_cross = " *** BEARISH CROSSOVER (pos→neg) ***"
        except (TypeError, ValueError):
            pass

    lines = [
        f"Ticker: {ticker}",
        f"Price: ${price} | 24h change: {change}%",
        "",
        "Technical indicators:",
        f"  RSI-14: {ind.get('rsi_14', 'N/A')}",
        f"  MACD line: {ind.get('macd_line', 'N/A')} | Signal: {ind.get('macd_signal', 'N/A')} | Hist: {ind.get('macd_hist', 'N/A')}{macd_cross}",
        f"  Previous MACD Hist: {ind.get('prev_macd_hist', 'N/A')}",
        f"  BB upper: {ind.get('bb_upper', 'N/A')} | Middle: {ind.get('bb_middle', 'N/A')} | Lower: {ind.get('bb_lower', 'N/A')}",
        f"  Price vs SMA-50: {ind.get('price_vs_sma50_pct', 'N/A')}%",
        f"  Volume ratio vs 20-day avg: {ind.get('volume_ratio', 'N/A')}x",
        f"  5-day return: {ind.get('week_return_pct', 'N/A')}%",
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
                sma_note = ""
                if bm.get("vs_sma50_pct") is not None:
                    regime = "ABOVE" if bm["vs_sma50_pct"] > 0 else "BELOW"
                    sma_note = f" | {bm['vs_sma50_pct']:+.1f}% vs SMA-50 ({regime})"
                lines.append(f"  {sym}: ${bm['price']:,.2f} (24h: {chg}){sma_note}")

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
