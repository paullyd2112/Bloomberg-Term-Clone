"""
AI Scoring Engine — reads enriched data from Supabase, builds context,
calls Claude Sonnet via Instructor, writes validated signals back.
"""

import os
from datetime import datetime, timedelta, timezone

import anthropic
import instructor
import sentry_sdk
from loguru import logger
from pydantic import BaseModel, Field
from typing import Literal
from dotenv import load_dotenv

from supabase_client import supabase
from prompts import stocks as stocks_prompt
from prompts import crypto as crypto_prompt
from prompts import prediction_markets as pred_prompt

load_dotenv()

MODEL              = "claude-sonnet-4-6"
SIGNAL_COOLDOWN_H  = 2      # skip if signal generated within this many hours
MAX_TOKENS         = 1024

_anthropic = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))
client     = instructor.from_anthropic(_anthropic)


# ─── Pydantic signal schemas ──────────────────────────────────────────────────

class StockSignal(BaseModel):
    direction:    Literal["BUY", "SELL", "HOLD"]
    confidence:   int    = Field(..., ge=0, le=100)
    reasoning:    str    = Field(..., min_length=20)
    time_horizon: Literal["intraday", "swing", "longterm"]
    key_risk:     str
    news_context: list[str] = Field(default_factory=list, max_length=3)


class CryptoSignal(BaseModel):
    direction:        Literal["BUY", "SELL", "HOLD"]
    confidence:       int    = Field(..., ge=0, le=100)
    reasoning:        str    = Field(..., min_length=20)
    time_horizon:     Literal["intraday", "swing", "longterm"]
    sentiment_driver: str
    news_context:     list[str] = Field(default_factory=list, max_length=3)


class PredictionSignal(BaseModel):
    direction:        Literal["YES", "NO", "HOLD"]
    confidence:       int    = Field(..., ge=0, le=100)
    reasoning:        str    = Field(..., min_length=20)
    time_horizon:     Literal["intraday", "swing", "before_close"]
    edge_detected:    bool
    edge_explanation: str
    news_context:     list[str] = Field(default_factory=list, max_length=3)


# ─── Supabase helpers ─────────────────────────────────────────────────────────

def _get_latest_price(asset_type: str, identifier: str) -> dict | None:
    try:
        result = (
            supabase.table("raw_prices")
            .select("*")
            .eq("asset_type", asset_type)
            .eq("identifier", identifier)
            .order("captured_at", desc=True)
            .limit(1)
            .execute()
        )
        return result.data[0] if result.data else None
    except Exception as e:
        logger.error("raw_prices fetch failed for {}/{}: {}", asset_type, identifier, e)
        return None


def _get_recent_news(asset_type: str, identifier: str, limit: int = 3) -> list[str]:
    try:
        # For crypto, also pull general crypto news
        query = supabase.table("news_items").select("headline")
        if asset_type == "crypto":
            query = query.in_("identifier", [identifier, "CRYPTO_GENERAL"])
        else:
            query = query.eq("identifier", identifier)

        result = (
            query
            .eq("asset_type", asset_type)
            .order("published_at", desc=True)
            .limit(limit)
            .execute()
        )
        return [r["headline"] for r in result.data if r.get("headline")]
    except Exception as e:
        logger.warning("news fetch failed for {}/{}: {}", asset_type, identifier, e)
        return []


def _signal_exists_recently(asset_type: str, identifier: str) -> bool:
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=SIGNAL_COOLDOWN_H)).isoformat()
    try:
        result = (
            supabase.table("signals")
            .select("id")
            .eq("asset_type", asset_type)
            .eq("identifier", identifier)
            .eq("is_backtest", False)
            .gte("created_at", cutoff)
            .limit(1)
            .execute()
        )
        return bool(result.data)
    except Exception as e:
        logger.warning("signal cooldown check failed for {}/{}: {}", asset_type, identifier, e)
        return False


def _get_fear_greed() -> dict:
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
                "value": int(row.get("price") or 50),
                "value_classification": meta.get("value_classification", "Neutral"),
            }
    except Exception:
        pass
    return {"value": 50, "value_classification": "Neutral"}


def _get_earnings_context(ticker: str) -> dict | None:
    cutoff = (datetime.now(timezone.utc) + timedelta(hours=48)).date().isoformat()
    today  = datetime.now(timezone.utc).date().isoformat()
    try:
        result = (
            supabase.table("earnings_events")
            .select("*")
            .eq("ticker", ticker)
            .gte("report_date", today)
            .lte("report_date", cutoff)
            .order("report_date")
            .limit(1)
            .execute()
        )
        if not result.data:
            return None
        e = result.data[0]
        report_dt = datetime.fromisoformat(str(e["report_date"]))
        hours_until = int((report_dt - datetime.now(timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0
        )).total_seconds() / 3600)
        return {
            "hours_until":             max(hours_until, 0),
            "report_time":             e.get("report_time", ""),
            "consensus_eps":           e.get("consensus_eps"),
            "whisper_eps":             e.get("whisper_eps"),
            "whisper_vs_consensus_pct": e.get("whisper_vs_consensus_pct"),
        }
    except Exception as e:
        logger.warning("earnings context failed for {}: {}", ticker, e)
        return None


def _get_options_context(ticker: str) -> dict | None:
    try:
        result = (
            supabase.table("options_flow")
            .select("*")
            .eq("ticker", ticker)
            .eq("is_unusual", True)
            .order("captured_at", desc=True)
            .limit(10)
            .execute()
        )
        if not result.data:
            return None

        calls = [r for r in result.data if r.get("contract_type") == "call"]
        puts  = [r for r in result.data if r.get("contract_type") == "put"]

        all_premiums = sorted(
            result.data, key=lambda r: r.get("premium_usd") or 0, reverse=True
        )
        largest = all_premiums[0] if all_premiums else None

        return {
            "unusual_calls":               len(calls),
            "unusual_puts":                len(puts),
            "put_call_ratio":              round(len(puts) / len(calls), 2) if calls else None,
            "largest_single_trade_direction": largest.get("contract_type") if largest else None,
            "largest_premium":             largest.get("premium_usd") if largest else None,
        }
    except Exception as e:
        logger.warning("options context failed for {}: {}", ticker, e)
        return None


def _get_short_interest_context(ticker: str) -> dict | None:
    try:
        result = (
            supabase.table("short_interest")
            .select("*")
            .eq("ticker", ticker)
            .order("captured_at", desc=True)
            .limit(1)
            .execute()
        )
        if not result.data:
            return None
        s = result.data[0]
        short_pct = s.get("short_float_pct") or 0
        return {
            "short_float_pct":  short_pct,
            "short_ratio":      s.get("short_ratio"),
            "vs_previous":      s.get("vs_previous"),
            "squeeze_potential": short_pct > 25,
        }
    except Exception as e:
        logger.warning("short interest context failed for {}: {}", ticker, e)
        return None


# ─── Signal writer ────────────────────────────────────────────────────────────

def _write_signal(asset_type: str, identifier: str, price: float | None, signal) -> dict:
    base = {
        "asset_type":      asset_type,
        "identifier":      identifier,
        "direction":       signal.direction,
        "confidence":      signal.confidence,
        "reasoning":       signal.reasoning,
        "time_horizon":    signal.time_horizon,
        "price_at_signal": price,
        "news_context":    signal.news_context,
        "is_backtest":     False,
        "outcome":         "PENDING",
    }
    result = supabase.table("signals").insert(base).execute()
    return result.data[0] if result.data else base


# ─── Core scoring function ────────────────────────────────────────────────────

def score_asset(asset_type: str, identifier: str) -> dict | None:
    """
    Build context from Supabase, call Claude via Instructor,
    write validated signal. Returns signal dict or None if skipped.
    """
    # Skip if scored recently
    if _signal_exists_recently(asset_type, identifier):
        logger.debug("{}/{}: skipping — scored within {}h", asset_type, identifier, SIGNAL_COOLDOWN_H)
        return None

    price_row = _get_latest_price(asset_type, identifier)
    if not price_row:
        logger.warning("{}/{}: no price data found — skipping", asset_type, identifier)
        return None

    meta         = price_row.get("metadata") or {}
    current_price = price_row.get("price")
    news          = _get_recent_news(asset_type, identifier)

    # ── Build asset-specific context & call Claude ──────────────────────────

    try:
        if asset_type == "stock":
            context = {
                "identifier":           identifier,
                "current_price":        current_price,
                "change_24h":           price_row.get("change_24h"),
                "technical_indicators": meta,
                "news_headlines":       news,
                "earnings_context":     _get_earnings_context(identifier),
                "options_context":      _get_options_context(identifier),
                "short_interest_context": _get_short_interest_context(identifier),
            }
            signal: StockSignal = client.chat.completions.create(
                model=MODEL,
                max_tokens=MAX_TOKENS,
                system=stocks_prompt.SYSTEM_PROMPT,
                messages=[{"role": "user", "content": stocks_prompt.build_user_prompt(context)}],
                response_model=StockSignal,
            )

        elif asset_type == "crypto":
            context = {
                "identifier":          identifier,
                "current_price":       current_price,
                "change_24h":          price_row.get("change_24h"),
                "technical_indicators": meta,
                "fear_greed":          _get_fear_greed(),
                "market_cap":          meta.get("market_cap"),
                "news_headlines":      news,
            }
            signal: CryptoSignal = client.chat.completions.create(
                model=MODEL,
                max_tokens=MAX_TOKENS,
                system=crypto_prompt.SYSTEM_PROMPT,
                messages=[{"role": "user", "content": crypto_prompt.build_user_prompt(context)}],
                response_model=CryptoSignal,
            )

        elif asset_type == "prediction":
            context = {
                "identifier":    identifier,
                "current_price": current_price,
                "change_24h":    price_row.get("change_24h"),
                "volume":        price_row.get("volume"),
                "metadata":      meta,
                "close_time":    meta.get("close_time") or meta.get("end_date"),
                "news_headlines": news,
            }
            signal: PredictionSignal = client.chat.completions.create(
                model=MODEL,
                max_tokens=MAX_TOKENS,
                system=pred_prompt.SYSTEM_PROMPT,
                messages=[{"role": "user", "content": pred_prompt.build_user_prompt(context)}],
                response_model=PredictionSignal,
            )

        else:
            logger.error("Unknown asset_type: {}", asset_type)
            return None

    except Exception as e:
        logger.error("{}/{}: Claude scoring failed — {}", asset_type, identifier, e)
        sentry_sdk.capture_exception(e)
        return None

    # Write to Supabase
    try:
        record = _write_signal(asset_type, identifier, current_price, signal)
        logger.info(
            "{}/{}: {} {}% confidence — {}",
            asset_type, identifier,
            signal.direction, signal.confidence,
            signal.reasoning[:80],
        )
        return record
    except Exception as e:
        logger.error("{}/{}: signal write failed — {}", asset_type, identifier, e)
        sentry_sdk.capture_exception(e)
        return None


# ─── Batch scoring functions (called by scheduler) ───────────────────────────

def score_stocks() -> str:
    from ingestion.stocks import get_default_watchlist
    tickers = get_default_watchlist()
    logger.info("Scoring {} stocks", len(tickers))
    success, skipped, failed = 0, 0, 0

    for ticker in tickers:
        try:
            result = score_asset("stock", ticker)
            if result is None:
                skipped += 1
            else:
                success += 1
        except Exception as e:
            logger.error("score_stocks unhandled error for {}: {}", ticker, e)
            sentry_sdk.capture_exception(e)
            failed += 1

    return f"{success} scored, {skipped} skipped (cooldown), {failed} failed"


def score_crypto() -> str:
    try:
        result = (
            supabase.table("raw_prices")
            .select("identifier")
            .eq("asset_type", "crypto")
            .neq("identifier", "MARKET_SENTIMENT")
            .order("captured_at", desc=True)
            .limit(60)
            .execute()
        )
        # Deduplicate preserving order
        seen, identifiers = set(), []
        for r in result.data:
            sym = r["identifier"]
            if sym not in seen:
                seen.add(sym)
                identifiers.append(sym)
    except Exception as e:
        logger.error("score_crypto: failed to fetch identifiers — {}", e)
        return "failed to fetch identifiers"

    logger.info("Scoring {} crypto assets", len(identifiers))
    success, skipped, failed = 0, 0, 0

    for sym in identifiers:
        try:
            result = score_asset("crypto", sym)
            if result is None:
                skipped += 1
            else:
                success += 1
        except Exception as e:
            logger.error("score_crypto unhandled error for {}: {}", sym, e)
            sentry_sdk.capture_exception(e)
            failed += 1

    return f"{success} scored, {skipped} skipped (cooldown), {failed} failed"


def score_prediction_markets() -> str:
    try:
        result = (
            supabase.table("raw_prices")
            .select("identifier")
            .eq("asset_type", "prediction")
            .order("volume", desc=True)
            .limit(40)
            .execute()
        )
        seen, identifiers = set(), []
        for r in result.data:
            ident = r["identifier"]
            if ident not in seen:
                seen.add(ident)
                identifiers.append(ident)
    except Exception as e:
        logger.error("score_prediction_markets: failed to fetch identifiers — {}", e)
        return "failed to fetch identifiers"

    logger.info("Scoring {} prediction markets", len(identifiers))
    success, skipped, failed = 0, 0, 0

    for ident in identifiers:
        try:
            result = score_asset("prediction", ident)
            if result is None:
                skipped += 1
            else:
                success += 1
        except Exception as e:
            logger.error("score_prediction_markets unhandled error for {}: {}", ident, e)
            sentry_sdk.capture_exception(e)
            failed += 1

    return f"{success} scored, {skipped} skipped (cooldown), {failed} failed"
