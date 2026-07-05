"""
Haiku Pre-screen — fast, cheap first pass before Sonnet scoring.

Cost: ~$0.001 per call (10x cheaper than Sonnet).
Supports stocks, crypto, and prediction markets.
Only assets that Haiku scores 65+ confidence get escalated to Sonnet.
"""

import os
from typing import Literal

import anthropic
import instructor
from loguru import logger
from pydantic import BaseModel, Field

HAIKU_MODEL = "claude-haiku-4-5-20251001"
MAX_TOKENS = 256

_client = None

def _get_client():
    global _client
    if _client is None:
        api_key = os.environ.get("ANTHROPIC_API_KEY", "")
        if not api_key:
            return None
        _client = instructor.from_anthropic(anthropic.Anthropic(api_key=api_key))
    return _client


class QuickSignal(BaseModel):
    direction: Literal["BUY", "SELL", "HOLD"]
    confidence: int = Field(..., ge=0, le=100)
    one_liner: str = Field(..., min_length=10, max_length=200)


class QuickPredictionSignal(BaseModel):
    direction: Literal["YES", "NO", "HOLD"]
    confidence: int = Field(..., ge=0, le=100)
    one_liner: str = Field(..., min_length=10, max_length=200)


STOCK_SYSTEM = """You are a trading signal screener. Given technical indicators for a stock, quickly assess: is there an actionable setup here?

Rules:
- RSI < 30 + MACD turning positive = BUY setup (70+ confidence)
- RSI > 70 + MACD turning negative = SELL setup (70+ confidence)
- Price > 10% above SMA-50 + positive MACD + volume surge = momentum BUY (75+)
- Only 1 indicator firing = HOLD (below 60)
- Respond with direction, confidence 0-100, and a one-line reason."""


CRYPTO_SYSTEM = """You are a crypto signal screener. Given technical indicators and market sentiment, quickly assess: is there an actionable setup?

Rules:
- RSI < 25 + volume surge = BUY (70+ confidence)
- RSI > 75 + declining volume = SELL (70+ confidence)
- Fear & Greed < 20 + oversold RSI = contrarian BUY (75+)
- Fear & Greed > 80 + overbought RSI = contrarian SELL (75+)
- Only 1 indicator firing = HOLD (below 60)
- Respond with direction, confidence 0-100, and a one-line reason."""


PREDICTION_SYSTEM = """You are a prediction market screener trained to spot genuine mispricing, not just cheap longshots.

Rules:
- A low price alone is NOT edge. Favorite-longshot bias means longshots are usually OVERpriced relative to their true probability, not underpriced — so "it's cheap" is never sufficient justification by itself.
- Only flag YES on a longshot (price < 0.20) if the context given includes a SPECIFIC, CURRENT reason the market hasn't priced in yet (an actual recent result, an eliminated rival, breaking news) — not general reputation or historical quality.
- Only flag NO on a heavy favorite (price > 0.80) with an equally specific, current reason.
- High volume + price moving sharply = worth a look regardless of absolute price level (something changed).
- No specific current information given, even if the story sounds plausible = HOLD (below 60).
- Respond with direction (YES/NO/HOLD), confidence 0-100, and a one-line reason citing the specific current fact driving your call."""


def prescreen_stock(ticker: str, meta: dict, price: float | None = None,
                    change_24h: float | None = None) -> QuickSignal | None:
    client = _get_client()
    if not client:
        return None

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
            system=[{"type": "text", "text": STOCK_SYSTEM, "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": "\n".join(prompt_lines)}],
            response_model=QuickSignal,
        )
    except Exception as e:
        logger.debug("Haiku stock prescreen failed for {}: {}", ticker, e)
        return None


def prescreen_crypto(symbol: str, meta: dict, price: float | None = None,
                     change_24h: float | None = None,
                     fear_greed: int | None = None) -> QuickSignal | None:
    client = _get_client()
    if not client:
        return None

    prompt_lines = [
        f"Coin: {symbol}",
        f"Price: ${price or 'N/A'} | 24h change: {change_24h or 'N/A'}%",
        f"RSI-14: {meta.get('rsi_14', 'N/A')}",
        f"MACD hist: {meta.get('macd_hist', 'N/A')}",
        f"Volume ratio: {meta.get('volume_ratio', 'N/A')}x",
        f"Fear & Greed index: {fear_greed or 'N/A'}",
        "",
        "Quick signal assessment:",
    ]

    try:
        return client.chat.completions.create(
            model=HAIKU_MODEL,
            max_tokens=MAX_TOKENS,
            system=[{"type": "text", "text": CRYPTO_SYSTEM, "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": "\n".join(prompt_lines)}],
            response_model=QuickSignal,
        )
    except Exception as e:
        logger.debug("Haiku crypto prescreen failed for {}: {}", symbol, e)
        return None


def prescreen_prediction(identifier: str, price: float | None = None,
                         volume: float | None = None,
                         metadata: dict | None = None) -> QuickPredictionSignal | None:
    client = _get_client()
    if not client:
        return None

    meta = metadata or {}
    prompt_lines = [
        f"Market: {meta.get('title') or identifier}",
        f"Current price (probability): {price or 'N/A'}",
        f"Volume: {volume or 'N/A'}",
        f"Close date: {meta.get('close_time') or meta.get('end_date', 'N/A')}",
    ]
    if meta.get("context_description"):
        prompt_lines += ["", f"Current context: {meta['context_description']}"]
    prompt_lines += ["", "Is there edge here?"]

    try:
        return client.chat.completions.create(
            model=HAIKU_MODEL,
            max_tokens=MAX_TOKENS,
            system=[{"type": "text", "text": PREDICTION_SYSTEM, "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": "\n".join(prompt_lines)}],
            response_model=QuickPredictionSignal,
        )
    except Exception as e:
        logger.debug("Haiku prediction prescreen failed for {}: {}", identifier, e)
        return None


OPTIONS_FLOW_SYSTEM = """You are an options flow screener. Given unusual options activity on a stock, quickly assess: does this flow suggest institutional directional positioning?

Rules:
- Heavy call buying (vol >> OI, large premium) = BUY signal (70+ confidence)
- Heavy put buying (vol >> OI, large premium) = SELL signal (70+ confidence)
- Mixed flow (calls and puts both heavy) = HOLD (below 60)
- Single large trade > $500K near-dated = directional signal (70+)
- Low total premium or few unusual contracts = HOLD (below 60)
- Respond with direction (BUY/SELL/HOLD), confidence 0-100, and a one-line reason."""


def prescreen_options_flow(ticker: str, aggregate: dict) -> QuickSignal | None:
    client = _get_client()
    if not client:
        return None

    prompt_lines = [
        f"Ticker: {ticker}",
        f"Unusual calls: {aggregate.get('unusual_calls', 0)} | Unusual puts: {aggregate.get('unusual_puts', 0)}",
        f"Put/call ratio: {aggregate.get('put_call_ratio', 'N/A')}",
        f"Total premium: ${aggregate.get('total_premium', 0):,.0f}",
        f"Largest trade: {aggregate.get('largest_direction', 'N/A')} ${aggregate.get('largest_premium', 0):,.0f}",
        "",
        "Quick flow assessment:",
    ]

    try:
        return client.chat.completions.create(
            model=HAIKU_MODEL,
            max_tokens=MAX_TOKENS,
            system=[{"type": "text", "text": OPTIONS_FLOW_SYSTEM, "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": "\n".join(prompt_lines)}],
            response_model=QuickSignal,
        )
    except Exception as e:
        logger.debug("Haiku options flow prescreen failed for {}: {}", ticker, e)
        return None


SONNET_ESCALATION_THRESHOLD = 65


def should_escalate_to_sonnet(signal: QuickSignal | QuickPredictionSignal | None) -> bool:
    if signal is None:
        return False
    direction = signal.direction
    if direction in ("HOLD",):
        return False
    return signal.confidence >= SONNET_ESCALATION_THRESHOLD
