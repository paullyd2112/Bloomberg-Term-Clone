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
SIGNAL_COOLDOWN_H  = 4      # skip if signal generated within this many hours
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
    cutoff = (datetime.now(timezone.utc) + timedelta(days=5)).date().isoformat()
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
        # report_date is a date — treat as start of that day UTC
        report_dt = report_dt.replace(tzinfo=timezone.utc)
        hours_until = int((report_dt - datetime.now(timezone.utc)).total_seconds() / 3600)
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


# ─── Macro context ───────────────────────────────────────────────────────────

def _get_market_benchmark() -> dict:
    """Fetch SPY + QQQ 24h change to give Claude broad market context."""
    benchmarks = {}
    for sym in ("SPY", "QQQ"):
        try:
            result = (
                supabase.table("raw_prices")
                .select("price, change_24h")
                .eq("asset_type", "stock")
                .eq("identifier", sym)
                .order("captured_at", desc=True)
                .limit(1)
                .execute()
            )
            if result.data:
                row = result.data[0]
                benchmarks[sym] = {
                    "price":     float(row["price"]) if row.get("price") else None,
                    "change_24h": float(row["change_24h"]) if row.get("change_24h") else None,
                }
        except Exception:
            pass
    return benchmarks


def _get_upcoming_macro(days: int = 2) -> list[str]:
    """Fetch macro events within next N days as short strings for context."""
    from ingestion.macro_events import get_upcoming_events
    events = get_upcoming_events(days=days)
    lines = []
    for e in events[:5]:
        name = e.get("event_name", "")
        importance = e.get("importance", "")
        event_date = e.get("event_date", "")
        lines.append(f"{event_date} — {name} ({importance})")
    return lines


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

    meta          = price_row.get("metadata") or {}
    current_price = price_row.get("price")
    news          = _get_recent_news(asset_type, identifier)

    # Without a valid price there is nothing meaningful to score
    if current_price is None:
        logger.warning("{}/{}: price is None — skipping", asset_type, identifier)
        return None
    current_price = float(current_price)

    # ── Build asset-specific context & call Claude ──────────────────────────

    # Fetch macro context once, share across asset types
    benchmarks  = _get_market_benchmark()
    macro_events = _get_upcoming_macro(days=2)

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
                "market_benchmarks":    benchmarks,
                "upcoming_macro":       macro_events,
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
                "market_benchmarks":   benchmarks,
                "upcoming_macro":      macro_events,
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

    # Circuit breaker — don't issue counter-trend signals after a large gap move.
    # A >8% gap up/down almost always means a fundamental catalyst repriced the stock;
    # fading it with a directional signal is the fastest way to burn users.
    change = price_row.get("change_24h")
    if change is not None:
        try:
            change_f = float(change)
            if change_f >= 8.0 and signal.direction == "SELL":
                logger.warning(
                    "{}/{}: circuit breaker — +{:.1f}% gap up, downgrading SELL to HOLD",
                    asset_type, identifier, change_f,
                )
                signal.direction   = "HOLD"
                signal.confidence  = min(signal.confidence, 45)
                signal.reasoning   = (
                    f"[Circuit breaker] Stock gapped up +{change_f:.1f}% — likely catalyst-driven. "
                    f"Fading a gap this large carries extreme risk. "
                    + signal.reasoning
                )
            elif change_f <= -8.0 and signal.direction == "BUY":
                logger.warning(
                    "{}/{}: circuit breaker — {:.1f}% gap down, downgrading BUY to HOLD",
                    asset_type, identifier, change_f,
                )
                signal.direction   = "HOLD"
                signal.confidence  = min(signal.confidence, 45)
                signal.reasoning   = (
                    f"[Circuit breaker] Stock gapped down {change_f:.1f}% — likely catalyst-driven. "
                    f"Catching this knife carries extreme risk. "
                    + signal.reasoning
                )
        except (TypeError, ValueError):
            pass

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
    from scoring.scanner import scan_stocks
    from scoring.haiku_prescreen import prescreen_stock, should_escalate_to_sonnet

    scan_results = scan_stocks(use_movers=True)
    core_always_score = {"AAPL", "NVDA", "TSLA", "GOOGL", "META", "AMZN", "MSFT", "SPY", "QQQ"}

    haiku_calls, sonnet_calls = 0, 0
    success, skipped, failed = 0, 0, 0

    for item in scan_results:
        ticker = item["ticker"]

        if ticker in core_always_score:
            try:
                result = score_asset("stock", ticker)
                sonnet_calls += 1
                if result is None:
                    skipped += 1
                else:
                    success += 1
            except Exception as e:
                logger.error("score_stocks error for {}: {}", ticker, e)
                sentry_sdk.capture_exception(e)
                failed += 1
            continue

        meta = {
            "rsi_14": item.get("rsi"),
            "volume_ratio": item.get("volume_ratio"),
            "change_24h": item.get("change_24h"),
        }
        quick = prescreen_stock(ticker, meta, price=item.get("price"),
                                change_24h=item.get("change_24h"))
        haiku_calls += 1

        if not should_escalate_to_sonnet(quick):
            skipped += 1
            continue

        try:
            result = score_asset("stock", ticker)
            sonnet_calls += 1
            if result is None:
                skipped += 1
            else:
                success += 1
        except Exception as e:
            logger.error("score_stocks error for {}: {}", ticker, e)
            sentry_sdk.capture_exception(e)
            failed += 1

    for core_ticker in core_always_score:
        if not any(s["ticker"] == core_ticker for s in scan_results):
            try:
                result = score_asset("stock", core_ticker)
                sonnet_calls += 1
                if result is None:
                    skipped += 1
                else:
                    success += 1
            except Exception as e:
                logger.error("score_stocks error for {}: {}", core_ticker, e)
                sentry_sdk.capture_exception(e)
                failed += 1

    return (f"{success} scored, {skipped} skipped, {failed} failed — "
            f"scanned {len(scan_results)} stocks, {haiku_calls} Haiku, {sonnet_calls} Sonnet")


def score_crypto() -> str:
    from scoring.haiku_prescreen import prescreen_crypto, should_escalate_to_sonnet

    try:
        result = (
            supabase.table("raw_prices")
            .select("identifier, price, change_24h, metadata")
            .eq("asset_type", "crypto")
            .neq("identifier", "MARKET_SENTIMENT")
            .order("captured_at", desc=True)
            .limit(20)
            .execute()
        )
        seen, rows = set(), []
        for r in result.data:
            sym = r["identifier"]
            if sym not in seen:
                seen.add(sym)
                rows.append(r)
    except Exception as e:
        logger.error("score_crypto: failed to fetch identifiers — {}", e)
        return "failed to fetch identifiers"

    core_always_score = {"BTC", "ETH", "SOL", "XRP", "ADA"}
    fg = _get_fear_greed()
    haiku_calls, sonnet_calls = 0, 0
    success, skipped, failed = 0, 0, 0

    for row in rows:
        sym = row["identifier"]
        meta = row.get("metadata") or {}

        if sym in core_always_score:
            try:
                result = score_asset("crypto", sym)
                sonnet_calls += 1
                if result is None:
                    skipped += 1
                else:
                    success += 1
            except Exception as e:
                logger.error("score_crypto error for {}: {}", sym, e)
                sentry_sdk.capture_exception(e)
                failed += 1
            continue

        quick = prescreen_crypto(sym, meta, price=row.get("price"),
                                 change_24h=row.get("change_24h"),
                                 fear_greed=fg.get("value"))
        haiku_calls += 1

        if not should_escalate_to_sonnet(quick):
            skipped += 1
            continue

        try:
            result = score_asset("crypto", sym)
            sonnet_calls += 1
            if result is None:
                skipped += 1
            else:
                success += 1
        except Exception as e:
            logger.error("score_crypto error for {}: {}", sym, e)
            sentry_sdk.capture_exception(e)
            failed += 1

    return (f"{success} scored, {skipped} skipped, {failed} failed — "
            f"{haiku_calls} Haiku, {sonnet_calls} Sonnet")


def score_prediction_markets() -> str:
    from scoring.haiku_prescreen import prescreen_prediction, should_escalate_to_sonnet

    try:
        result = (
            supabase.table("raw_prices")
            .select("identifier, price, volume, metadata")
            .eq("asset_type", "prediction")
            .order("volume", desc=True)
            .limit(20)
            .execute()
        )
        seen, rows = set(), []
        for r in result.data:
            ident = r["identifier"]
            if ident not in seen:
                seen.add(ident)
                rows.append(r)
    except Exception as e:
        logger.error("score_prediction_markets: failed to fetch identifiers — {}", e)
        return "failed to fetch identifiers"

    haiku_calls, sonnet_calls = 0, 0
    success, skipped, failed = 0, 0, 0

    for row in rows:
        ident = row["identifier"]

        quick = prescreen_prediction(ident, price=row.get("price"),
                                     volume=row.get("volume"),
                                     metadata=row.get("metadata"))
        haiku_calls += 1

        if not should_escalate_to_sonnet(quick):
            skipped += 1
            continue

        try:
            result = score_asset("prediction", ident)
            sonnet_calls += 1
            if result is None:
                skipped += 1
            else:
                success += 1
        except Exception as e:
            logger.error("score_prediction_markets error for {}: {}", ident, e)
            sentry_sdk.capture_exception(e)
            failed += 1

    return (f"{success} scored, {skipped} skipped, {failed} failed — "
            f"{haiku_calls} Haiku, {sonnet_calls} Sonnet")
