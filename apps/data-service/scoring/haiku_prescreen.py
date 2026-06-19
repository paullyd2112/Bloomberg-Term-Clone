"""
Haiku Pre-screen — fast, cheap first pass on scanner-qualified stocks.

Cost: ~$0.001 per call (10x cheaper than Sonnet).
Only stocks that Haiku scores 65+ confidence get escalated to Sonnet
for a full signal with detailed reasoning.
"""

import os
from typing import Literal

import anthropic
import instructor
from loguru import logger
from pydantic import BaseModel, Field

HAIKU_MODEL = "claude-haiku-4-5-20251001"
MAX_TOKENS = 256


class QuickSignal(BaseModel):
    direction: Literal["BUY", "SELL", "HOLD"]
    confidence: int = Field(..., ge=0, le=100)
    one_liner: str = Field(..., min_length=10, max_length=200)


HAIKU_SYSTEM = """You are a trading signal screener. Given technical indicators for a stock, quickly assess: is there an actionable setup here?

Rules:
- RSI < 30 + MACD turning positive = BUY setup (70+ confidence)
- RSI > 70 + MACD turning negative = SELL setup (70+ confidence)
- Price > 10% above SMA-50 + positive MACD + volume surge = momentum BUY (75+)
- Only 1 indicator firing = HOLD (below 60)
- Respond with direction, confidence 0-100, and a one-line reason."""


def prescreen_stock(ticker: str, meta: dict, price: float | None = None,
                    change_24h: float | None = None) -> QuickSignal | None:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        return None

    _anthropic = anthropic.Anthropic(api_key=api_key)
    client = instructor.from_anthropic(_anthropic)

    prompt_lines = [
        f"Ticker: {ticker}",
        f"Price: ${price or 'N/A'} | 24h change: {change_24h or 'N/A'}%",
        f"RSI-14: {meta.get('rsi_14', 'N/A')}",
        f"MACD hist: {meta.get('macd_hist', 'N/A')} | prev: {meta.get('prev_macd_hist', 'N/A')}",
        f"Volume ratio: {meta.get('volume_ratio', 'N/A')}x",
        f"Price vs SMA-50: {meta.get('price_vs_sma50_pct', 'N/A')}%",
        f"BB position: upper={meta.get('bb_upper', 'N/A')} lower={meta.get('bb_lower', 'N/A')}",
        "",
        "Quick signal assessment:",
    ]

    try:
        return client.chat.completions.create(
            model=HAIKU_MODEL,
            max_tokens=MAX_TOKENS,
            system=HAIKU_SYSTEM,
            messages=[{"role": "user", "content": "\n".join(prompt_lines)}],
            response_model=QuickSignal,
        )
    except Exception as e:
        logger.debug("Haiku prescreen failed for {}: {}", ticker, e)
        return None


SONNET_ESCALATION_THRESHOLD = 65


def should_escalate_to_sonnet(signal: QuickSignal | None) -> bool:
    if signal is None:
        return False
    if signal.direction == "HOLD":
        return False
    return signal.confidence >= SONNET_ESCALATION_THRESHOLD
