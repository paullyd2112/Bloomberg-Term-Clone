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
from prompts import options_flow as options_prompt

load_dotenv()

MODEL              = "claude-sonnet-4-6"
SIGNAL_COOLDOWN_H  = 4      # skip if signal generated within this many hours
MAX_TOKENS         = 1024
ENGINE_CUTOFF      = "2026-06-22T00:00:00Z"  # signals before this date are unreliable

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


class OptionsFlowSignal(BaseModel):
    direction:    Literal["BUY", "SELL", "HOLD"]
    confidence:   int    = Field(..., ge=0, le=100)
    reasoning:    str    = Field(..., min_length=20)
    time_horizon: Literal["intraday", "swing", "longterm"]
    key_risk:     str
    news_context: list[str] = Field(default_factory=list, max_length=3)


# ─── Supabase helpers ─────────────────────────────────────────────────────────

def _get_latest_price(asset_type: str, identifier: str) -> dict | None:
    # Delegates to the shared helper: the naive newest-row query returns
    # thin live-stream rows (no indicators, None change_24h) for streamed
    # tickers, silently blinding the prompt technicals and every
    # deterministic gate. See scoring/price_data.py.
    from scoring.price_data import get_scoring_price_row
    return get_scoring_price_row(asset_type, identifier)


def _get_recent_news(asset_type: str, identifier: str, limit: int = 3) -> list[str]:
    try:
        query = supabase.table("news_items").select("headline, url")
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


def _get_recent_news_with_urls(asset_type: str, identifier: str, limit: int = 3) -> list[dict]:
    try:
        query = supabase.table("news_items").select("headline, url")
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
        return [
            {"headline": r["headline"], "url": r.get("url") or ""}
            for r in result.data if r.get("headline")
        ]
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


def _get_corporate_actions_context(ticker: str) -> list[dict] | None:
    """Return upcoming/recent corporate actions (splits, dividends, spinoffs,
    mergers) for a ticker, most relevant to a swing-trade horizon."""
    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%d")
        result = (
            supabase.table("corporate_actions")
            .select("ca_type, ex_date, cash_amount, old_rate, new_rate")
            .eq("ticker", ticker)
            .gte("ex_date", cutoff)
            .order("ex_date", desc=False)
            .limit(5)
            .execute()
        )
        return result.data or None
    except Exception as e:
        logger.warning("corporate actions context failed for {}: {}", ticker, e)
        return None


# ─── Macro context ───────────────────────────────────────────────────────────

def _get_market_benchmark() -> dict:
    """Fetch SPY + QQQ price/change/SMA-50 position to give Claude broad market
    regime context. price_vs_sma50_pct is what the stocks prompt's market-regime
    gate actually checks -- it must come from here, not be inferred. Uses the
    indicator-merging helper: the naive newest-row query returns thin
    live-stream rows for SPY/QQQ, which silently disabled the regime gates."""
    from scoring.price_data import get_scoring_price_row
    benchmarks = {}
    for sym in ("SPY", "QQQ"):
        try:
            row = get_scoring_price_row("stock", sym)
            if row:
                meta = row.get("metadata") or {}
                benchmarks[sym] = {
                    "price":              float(row["price"]) if row.get("price") else None,
                    "change_24h":         float(row["change_24h"]) if row.get("change_24h") else None,
                    "price_vs_sma50_pct": float(meta["price_vs_sma50_pct"]) if meta.get("price_vs_sma50_pct") is not None else None,
                }
        except Exception:
            pass
    return benchmarks


def _get_upcoming_macro(days: int = 2) -> list[str]:
    """Fetch macro events + FRED indicator snapshot for scoring context."""
    from ingestion.macro_events import get_upcoming_events

    lines: list[str] = []

    # Current economic indicators from FRED
    try:
        from ingestion.fred import get_macro_context_for_scoring
        fred_lines = get_macro_context_for_scoring()
        if fred_lines:
            lines.extend(fred_lines)
    except Exception as e:
        logger.debug("FRED context unavailable: {}", e)

    # Upcoming calendar events
    events = get_upcoming_events(days=days)
    for e in events[:5]:
        name = e.get("event_name", "")
        importance = e.get("importance", "")
        event_date = e.get("event_date", "")
        actual = e.get("actual")
        previous = e.get("previous")
        detail = ""
        if actual is not None and previous is not None:
            detail = f" | Actual: {actual}, Previous: {previous}"
        elif actual is not None:
            detail = f" | Actual: {actual}"
        lines.append(f"{event_date} — {name} ({importance}){detail}")

    return lines


def _format_market_context(benchmarks: dict, macro_events: list[str] | None = None) -> str:
    """Render the shared benchmark/macro block once so it can be cached as its
    own system content block instead of being duplicated in every per-ticker
    user prompt within a scoring run."""
    lines = ["Broad market & macro context (shared across every asset scored this run):"]

    if benchmarks:
        lines.append("")
        lines.append("Benchmarks:")
        for sym, bm in benchmarks.items():
            if bm.get("price") is not None:
                chg = f"{bm['change_24h']:+.2f}%" if bm.get("change_24h") is not None else "N/A"
                vs50 = bm.get("price_vs_sma50_pct")
                if vs50 is not None:
                    if vs50 > 5:
                        regime = f"{vs50:+.1f}% vs SMA-50 — STRONG UPTREND"
                    elif vs50 < 0:
                        regime = f"{vs50:+.1f}% vs SMA-50 — DOWNTREND"
                    else:
                        regime = f"{vs50:+.1f}% vs SMA-50 — neutral"
                    lines.append(f"  {sym}: ${bm['price']:,.2f} (24h: {chg}) — {regime}")
                else:
                    lines.append(f"  {sym}: ${bm['price']:,.2f} (24h: {chg})")

    if macro_events:
        lines.append("")
        lines.append("Upcoming macro events (next 48h):")
        for m in macro_events:
            lines.append(f"  - {m}")

    return "\n".join(lines)


# ─── Accuracy penalty ────────────────────────────────────────────────────────

def _get_asset_accuracy(identifier: str, asset_type: str) -> dict | None:
    """Query resolved signals (WIN/LOSS only) for an asset since ENGINE_CUTOFF.

    Returns {"wins": N, "losses": N, "total": N, "win_rate": float} if
    there are 3+ resolved signals, otherwise None (not enough data).
    """
    try:
        result = (
            supabase.table("signals")
            .select("outcome")
            .eq("identifier", identifier)
            .eq("asset_type", asset_type)
            .in_("outcome", ["WIN", "LOSS"])
            .gte("created_at", ENGINE_CUTOFF)
            .execute()
        )
        rows = result.data or []
    except Exception as e:
        logger.warning("accuracy lookup failed for {}/{}: {}", asset_type, identifier, e)
        return None

    if len(rows) < 3:
        return None

    wins   = sum(1 for r in rows if r["outcome"] == "WIN")
    losses = sum(1 for r in rows if r["outcome"] == "LOSS")
    total  = wins + losses
    win_rate = round(wins / total * 100, 1) if total > 0 else 0.0

    return {"wins": wins, "losses": losses, "total": total, "win_rate": win_rate}


def _apply_accuracy_penalty(confidence: int, accuracy: dict | None) -> int:
    """Cap confidence when an asset has a poor historical win rate.

    Rules:
    - 3+ resolved signals AND win_rate < 15% → cap at 55
    - 3+ resolved signals AND win_rate < 30% → cap at 60
    - Fewer than 3 resolved signals → no penalty
    """
    if accuracy is None:
        return confidence

    win_rate = accuracy["win_rate"]

    if win_rate < 15:
        cap = 55
    elif win_rate < 30:
        cap = 60
    else:
        return confidence

    if confidence > cap:
        logger.warning(
            "Accuracy penalty: confidence {} → {} (win_rate={:.1f}%, {}/{} wins, {} resolved signals)",
            confidence, cap, win_rate, accuracy["wins"], accuracy["total"], accuracy["total"],
        )
        return cap

    return confidence


# ─── Signal writer ────────────────────────────────────────────────────────────

def _write_signal(asset_type: str, identifier: str, price: float | None, signal, news_with_urls: list[dict] | None = None) -> dict:
    accuracy = _get_asset_accuracy(identifier, asset_type)
    adjusted_confidence = _apply_accuracy_penalty(signal.confidence, accuracy)

    url_lookup = {}
    if news_with_urls:
        for item in news_with_urls:
            url_lookup[item["headline"].lower().strip()] = item.get("url", "")

    news_urls = []
    for headline in (signal.news_context or []):
        matched_url = url_lookup.get(headline.lower().strip(), "")
        news_urls.append(matched_url)

    base = {
        "asset_type":      asset_type,
        "identifier":      identifier,
        "direction":       signal.direction,
        "confidence":      adjusted_confidence,
        "reasoning":       signal.reasoning,
        "time_horizon":    signal.time_horizon,
        "price_at_signal": price,
        "news_context":    signal.news_context,
        "news_urls":       news_urls,
        "is_backtest":     False,
        "outcome":         "PENDING",
    }
    result = supabase.table("signals").insert(base).execute()
    return result.data[0] if result.data else base


# ─── Core scoring function ────────────────────────────────────────────────────

def score_asset(
    asset_type: str,
    identifier: str,
    model_override: str | None = None,
    benchmarks: dict | None = None,
    macro_events: list[str] | None = None,
    breadth_tracker: dict | None = None,
    btc_regime: dict | None = None,
) -> dict | None:
    """
    Build context from Supabase, call Claude via Instructor,
    write validated signal. Returns signal dict or None if skipped.

    `breadth_tracker` is a mutable dict shared across every ticker scored in
    the same score_stocks() run, used to cap how many simultaneously-extended
    BUY signals get issued in one batch -- see the breadth gate below.

    `benchmarks`/`macro_events` can be preloaded once by a calling loop
    (score_stocks, score_crypto) and passed in, since they're identical
    across every ticker scored in the same run — avoids refetching from
    Supabase per ticker and lets the shared context be cached as its own
    system content block instead of duplicated in every user prompt.
    """
    # Skip if scored recently
    use_model = model_override or MODEL

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
    news_with_urls = _get_recent_news_with_urls(asset_type, identifier)

    # Without a valid price there is nothing meaningful to score
    if current_price is None:
        logger.warning("{}/{}: price is None — skipping", asset_type, identifier)
        return None
    current_price = float(current_price)

    # Without technicals there is nothing to score either — the entire
    # signal ruleset (confluence, regime gates, evidence gate) is built on
    # them. Live smoke-testing caught the model issuing 72%-confidence BUYs
    # off options flow alone when the indicator merge found nothing; skip
    # instead of scoring blind (and save the Claude call).
    if asset_type in ("stock", "crypto") and meta.get("rsi_14") is None and meta.get("macd_hist") is None:
        logger.warning("{}/{}: no technical indicators within {} days — skipping rather than scoring blind",
                       asset_type, identifier, 5)
        return None

    # ── Build asset-specific context & call Claude ──────────────────────────

    # Reuse preloaded macro context if the caller supplied it (score_stocks/
    # score_crypto fetch this once per run); otherwise fetch fresh for
    # standalone callers (on-demand scoring, crypto momentum scan).
    if benchmarks is None:
        benchmarks = _get_market_benchmark()
    if macro_events is None:
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
                "corporate_actions":     _get_corporate_actions_context(identifier),
            }
            signal: StockSignal = client.chat.completions.create(
                model=use_model,
                max_tokens=MAX_TOKENS,
                system=[
                    {"type": "text", "text": stocks_prompt.SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}},
                    {"type": "text", "text": _format_market_context(benchmarks, macro_events),
                     "cache_control": {"type": "ephemeral"}},
                ],
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
                "btc_regime":          btc_regime,
            }
            signal: CryptoSignal = client.chat.completions.create(
                model=use_model,
                max_tokens=MAX_TOKENS,
                system=[
                    {"type": "text", "text": crypto_prompt.SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}},
                    {"type": "text", "text": _format_market_context(benchmarks, macro_events),
                     "cache_control": {"type": "ephemeral"}},
                ],
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
                model=use_model,
                max_tokens=MAX_TOKENS,
                system=[{"type": "text", "text": pred_prompt.SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
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

    # Deterministic SPY regime gate — code-enforced, not just prompt text.
    # The prompt's own "HARD GATE" is advisory to the model and can be
    # ignored; this is the backstop that can't be. Mirrors the enforcement
    # the backtest module has always had (_spy_regime_bearish/_bullish).
    if asset_type == "stock":
        spy_vs_sma50 = (benchmarks or {}).get("SPY", {}).get("price_vs_sma50_pct")
        if spy_vs_sma50 is not None:
            if spy_vs_sma50 < 0 and signal.direction == "BUY":
                logger.warning(
                    "{}/{}: regime gate — SPY {:.1f}% below SMA-50, downgrading BUY to HOLD",
                    asset_type, identifier, spy_vs_sma50,
                )
                signal.direction  = "HOLD"
                signal.confidence = min(signal.confidence, 45)
                signal.reasoning  = (
                    f"[Regime gate] SPY is {spy_vs_sma50:.1f}% below its SMA-50 — broad market "
                    f"downtrend. Suppressing a BUY on single-stock strength alone. "
                    + signal.reasoning
                )
            elif spy_vs_sma50 > 5 and signal.direction == "SELL":
                logger.warning(
                    "{}/{}: regime gate — SPY {:.1f}% above SMA-50, downgrading SELL to HOLD",
                    asset_type, identifier, spy_vs_sma50,
                )
                signal.direction  = "HOLD"
                signal.confidence = min(signal.confidence, 45)
                signal.reasoning  = (
                    f"[Regime gate] SPY is {spy_vs_sma50:.1f}% above its SMA-50 — strong broad-market "
                    f"uptrend. Suppressing a SELL on single-stock weakness alone. "
                    + signal.reasoning
                )

    # Deterministic BTC regime gate — same "prompt gate had no real data
    # behind it" bug as SPY above. The crypto prompt's HARD GATE tells the
    # model to check BTC's MACD, but nothing fetched BTC's indicators for
    # alt-coin scoring until now. Code-enforce it, don't just describe it.
    if asset_type == "crypto" and identifier != "BTC" and btc_regime and btc_regime.get("bearish") and signal.direction == "BUY":
        logger.warning(
            "{}/{}: BTC regime gate — BTC MACD bearish/deepening, downgrading BUY to HOLD",
            asset_type, identifier,
        )
        signal.direction  = "HOLD"
        signal.confidence = min(signal.confidence, 45)
        signal.reasoning  = (
            f"[BTC regime gate] BTC's MACD histogram is negative and deepening — alts follow BTC down. "
            f"Suppressing a BUY on {identifier}-specific strength alone. "
            + signal.reasoning
        )

    # Breadth/correlation cap — if several names in the same batch are all
    # deeply extended and getting BUY calls, that's a synchronized-momentum
    # signature, not N independent bets (see: 8 correlated BUYs on 2026-04-17
    # in backtesting, 5 of which hit -10% stops the same day). Cap how many
    # extended BUYs one run will issue.
    EXTENDED_VS_SMA50_PCT = 8.0
    MAX_EXTENDED_BUYS_PER_RUN = 4
    if asset_type == "stock" and signal.direction == "BUY" and breadth_tracker is not None:
        vs_sma50 = meta.get("price_vs_sma50_pct")
        if vs_sma50 is not None and vs_sma50 > EXTENDED_VS_SMA50_PCT:
            count = breadth_tracker.get("extended_buys", 0) + 1
            breadth_tracker["extended_buys"] = count
            if count > MAX_EXTENDED_BUYS_PER_RUN:
                logger.warning(
                    "{}/{}: breadth gate — {} extended BUYs already issued this run, downgrading to HOLD",
                    asset_type, identifier, count - 1,
                )
                signal.direction  = "HOLD"
                signal.confidence = min(signal.confidence, 45)
                signal.reasoning  = (
                    f"[Breadth gate] {count - 1} other names this run are already extended "
                    f">{EXTENDED_VS_SMA50_PCT:.0f}% above their SMA-50 with a BUY call — this looks "
                    f"like synchronized momentum-chasing, not an independent setup. "
                    + signal.reasoning
                )

    # Evidence gate — check the proposed direction against the empirically
    # validated pattern table (analysis/factor_discovery.py: 10 months, 62
    # stocks, ~9,800 observations, out-of-sample confirmed). If the current
    # indicator state matches a validated pattern favoring the OPPOSITE
    # direction, the historical data outvotes the model's read.
    if asset_type == "stock" and signal.direction in ("BUY", "SELL"):
        from scoring.validated_factors import check_signal_against_evidence
        proposed = signal.direction
        verdict, pattern_ids = check_signal_against_evidence(meta, proposed)
        if verdict == "contradict":
            logger.warning(
                "{}/{}: evidence gate — {} contradicts validated pattern(s) {}, downgrading to HOLD",
                asset_type, identifier, proposed, pattern_ids,
            )
            signal.direction  = "HOLD"
            signal.confidence = min(signal.confidence, 45)
            signal.reasoning  = (
                f"[Evidence gate] A 10-month, ~9,800-observation study shows this exact "
                f"indicator state historically resolved AGAINST a {proposed} "
                f"(validated pattern: {', '.join(pattern_ids)}). "
                + signal.reasoning
            )
        elif verdict == "confirm":
            signal.reasoning = (
                f"[Validated pattern: {', '.join(pattern_ids)}] " + signal.reasoning
            )

    # Skip HOLD signals entirely — users want actionable BUY/SELL only
    if signal.direction == "HOLD":
        logger.debug("{}/{}: skipping HOLD signal ({}%)", asset_type, identifier, signal.confidence)
        return None

    # Write to Supabase
    try:
        record = _write_signal(asset_type, identifier, current_price, signal, news_with_urls)
        logger.info(
            "{}/{}: {} {}% confidence — {}",
            asset_type, identifier,
            signal.direction, signal.confidence,
            signal.reasoning[:80],
        )

        # Fire email alert for high-confidence BUY/SELL signals
        try:
            from briefing.signal_alerts import notify_high_confidence_signal
            notify_high_confidence_signal(record)
        except Exception as e:
            logger.debug("signal_alerts dispatch failed: {}", e)

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

    # Fetch once per run — identical for every ticker scored below, so this
    # also lets the Claude call cache the shared block instead of paying
    # full price on it for every single ticker.
    benchmarks   = _get_market_benchmark()
    macro_events = _get_upcoming_macro(days=2)
    breadth_tracker: dict = {"extended_buys": 0}

    haiku_calls, sonnet_calls = 0, 0
    success, skipped, failed = 0, 0, 0

    for item in scan_results:
        ticker = item["ticker"]

        if ticker in core_always_score:
            try:
                result = score_asset("stock", ticker, benchmarks=benchmarks, macro_events=macro_events,
                                      breadth_tracker=breadth_tracker)
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
            result = score_asset("stock", ticker, benchmarks=benchmarks, macro_events=macro_events,
                                  breadth_tracker=breadth_tracker)
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
                result = score_asset("stock", core_ticker, benchmarks=benchmarks, macro_events=macro_events,
                                      breadth_tracker=breadth_tracker)
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


def score_stocks_event_only() -> str:
    """Midday event-driven scan — skips core tickers and daily-bar indicators.
    Only scores stocks with intraday events (gap moves, volume surges)."""
    from scoring.scanner import scan_stocks
    from scoring.haiku_prescreen import prescreen_stock, should_escalate_to_sonnet

    scan_results = scan_stocks(use_movers=True, event_only=True)

    benchmarks   = _get_market_benchmark()
    macro_events = _get_upcoming_macro(days=2)
    breadth_tracker: dict = {"extended_buys": 0}

    haiku_calls, sonnet_calls = 0, 0
    success, skipped, failed = 0, 0, 0

    for item in scan_results:
        ticker = item["ticker"]

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
            result = score_asset("stock", ticker, benchmarks=benchmarks, macro_events=macro_events,
                                  breadth_tracker=breadth_tracker)
            sonnet_calls += 1
            if result is None:
                skipped += 1
            else:
                success += 1
        except Exception as e:
            logger.error("score_stocks_event_only error for {}: {}", ticker, e)
            sentry_sdk.capture_exception(e)
            failed += 1

    return (f"[event-only] {success} scored, {skipped} skipped, {failed} failed — "
            f"scanned {len(scan_results)} stocks, {haiku_calls} Haiku, {sonnet_calls} Sonnet")


CORE_CRYPTO   = {"BTC", "ETH", "SOL", "XRP", "ADA"}
TIER1_CRYPTO  = {
    "BNB", "DOGE", "AVAX", "DOT", "LINK", "UNI", "ATOM",
    "LTC", "NEAR", "APT", "ARB", "OP", "FIL", "INJ", "SUI", "SEI",
    "PEPE", "WIF", "SHIB", "TIA", "AAVE", "MKR", "RENDER", "FET",
}
CRYPTO_MOVER_THRESHOLD = 5.0  # % change to qualify lower-tier coins


def score_crypto() -> str:
    from scoring.haiku_prescreen import prescreen_crypto, should_escalate_to_sonnet

    try:
        # Filter to indicator-bearing rows: the live stream flushes thin
        # {source, updated_at} rows every 60s, so without this filter the
        # newest row per streamed coin has no rsi/macd — blinding the
        # prescreen and the BTC regime computation below.
        result = (
            supabase.table("raw_prices")
            .select("identifier, price, change_24h, metadata")
            .eq("asset_type", "crypto")
            .neq("identifier", "MARKET_SENTIMENT")
            .filter("metadata->rsi_14", "not.is", "null")
            .order("captured_at", desc=True)
            .limit(200)
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

    fg = _get_fear_greed()
    benchmarks   = _get_market_benchmark()
    macro_events = _get_upcoming_macro(days=2)

    # BTC regime — computed once per run from the same rows already fetched
    # above, so alt-coin scoring can actually see (and gate on) it instead
    # of the prompt's HARD GATE checking data that was never provided.
    btc_regime: dict | None = None
    btc_row = next((r for r in rows if r["identifier"] == "BTC"), None)
    if btc_row:
        btc_meta = btc_row.get("metadata") or {}
        hist      = btc_meta.get("macd_hist")
        prev_hist = btc_meta.get("prev_macd_hist")
        try:
            bearish = hist is not None and prev_hist is not None and float(hist) < 0 and float(hist) < float(prev_hist)
        except (TypeError, ValueError):
            bearish = False
        btc_regime = {"macd_hist": hist, "prev_macd_hist": prev_hist, "bearish": bearish}

    haiku_calls, sonnet_calls = 0, 0
    success, skipped, failed = 0, 0, 0
    tier_skipped = 0

    for row in rows:
        sym = row["identifier"]
        meta = row.get("metadata") or {}

        if sym in CORE_CRYPTO:
            try:
                result = score_asset("crypto", sym, benchmarks=benchmarks, macro_events=macro_events,
                                      btc_regime=btc_regime)
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

        if sym not in TIER1_CRYPTO:
            change = row.get("change_24h")
            if change is None or abs(float(change)) < CRYPTO_MOVER_THRESHOLD:
                tier_skipped += 1
                continue

        quick = prescreen_crypto(sym, meta, price=row.get("price"),
                                 change_24h=row.get("change_24h"),
                                 fear_greed=fg.get("value"))
        haiku_calls += 1

        if not should_escalate_to_sonnet(quick):
            skipped += 1
            continue

        try:
            result = score_asset("crypto", sym, benchmarks=benchmarks, macro_events=macro_events,
                                  btc_regime=btc_regime)
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
            f"{haiku_calls} Haiku, {sonnet_calls} Sonnet, {tier_skipped} tier-skipped")


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


# ─── Options flow scoring ───────────────────────────────────────────────────

OPTIONS_FLOW_COOLDOWN_H = 6
MIN_UNUSUAL_CONTRACTS   = 3
MIN_TOTAL_PREMIUM       = 200_000


def _get_unusual_flow_grouped() -> dict[str, list[dict]]:
    """Fetch recent unusual options flow, grouped by ticker."""
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=6)).isoformat()
    try:
        result = (
            supabase.table("options_flow")
            .select("ticker, contract_type, strike, expiry, volume, open_interest, "
                    "volume_oi_ratio, premium_usd, captured_at")
            .eq("is_unusual", True)
            .gte("captured_at", cutoff)
            .order("premium_usd", desc=True)
            .limit(200)
            .execute()
        )
        rows = result.data or []
    except Exception as e:
        logger.error("options scoring: flow fetch failed — {}", e)
        return {}

    grouped: dict[str, list[dict]] = {}
    for r in rows:
        grouped.setdefault(r["ticker"], []).append(r)
    return grouped


def _build_flow_aggregate(flows: list[dict]) -> dict:
    calls = [f for f in flows if f.get("contract_type") == "call"]
    puts  = [f for f in flows if f.get("contract_type") == "put"]
    total_premium = sum(f.get("premium_usd") or 0 for f in flows)

    largest = max(flows, key=lambda f: f.get("premium_usd") or 0) if flows else {}

    return {
        "total_unusual":    len(flows),
        "unusual_calls":    len(calls),
        "unusual_puts":     len(puts),
        "put_call_ratio":   round(len(puts) / len(calls), 2) if calls else None,
        "total_premium":    total_premium,
        "largest_direction": largest.get("contract_type"),
        "largest_premium":   largest.get("premium_usd") or 0,
    }


def _options_signal_exists_recently(ticker: str) -> bool:
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=OPTIONS_FLOW_COOLDOWN_H)).isoformat()
    try:
        result = (
            supabase.table("signals")
            .select("id")
            .eq("asset_type", "stock")
            .eq("identifier", ticker)
            .eq("is_backtest", False)
            .gte("created_at", cutoff)
            .limit(1)
            .execute()
        )
        return bool(result.data)
    except Exception:
        return False


def _write_options_signal(ticker: str, price: float | None, signal: OptionsFlowSignal) -> dict:
    accuracy = _get_asset_accuracy(ticker, "stock")
    adjusted_confidence = _apply_accuracy_penalty(signal.confidence, accuracy)

    record = {
        "asset_type":      "stock",
        "identifier":      ticker,
        "direction":       signal.direction,
        "confidence":      adjusted_confidence,
        "reasoning":       f"[Options flow] {signal.reasoning}",
        "time_horizon":    signal.time_horizon,
        "price_at_signal": price,
        "news_context":    signal.news_context,
        "is_backtest":     False,
        "outcome":         "PENDING",
    }
    result = supabase.table("signals").insert(record).execute()
    return result.data[0] if result.data else record


def score_options_flow() -> str:
    """Score unusual options flow — generates directional signals on underlying stocks."""
    from scoring.haiku_prescreen import prescreen_options_flow, should_escalate_to_sonnet

    grouped = _get_unusual_flow_grouped()
    if not grouped:
        return "no unusual flow found"

    benchmarks = _get_market_benchmark()
    haiku_calls, sonnet_calls = 0, 0
    success, skipped, failed = 0, 0, 0

    for ticker, flows in grouped.items():
        agg = _build_flow_aggregate(flows)

        if agg["total_unusual"] < MIN_UNUSUAL_CONTRACTS:
            skipped += 1
            continue
        if agg["total_premium"] < MIN_TOTAL_PREMIUM:
            skipped += 1
            continue

        if _options_signal_exists_recently(ticker):
            skipped += 1
            continue

        quick = prescreen_options_flow(ticker, agg)
        haiku_calls += 1

        if not should_escalate_to_sonnet(quick):
            skipped += 1
            continue

        price_row = _get_latest_price("stock", ticker)
        current_price = float(price_row["price"]) if price_row and price_row.get("price") else None
        change_24h = price_row.get("change_24h") if price_row else None
        news = _get_recent_news("stock", ticker)

        context = {
            "ticker":            ticker,
            "current_price":     current_price,
            "change_24h":        change_24h,
            "flow":              flows[:15],
            "aggregate":         agg,
            "news_headlines":    news,
        }

        try:
            signal: OptionsFlowSignal = client.chat.completions.create(
                model=MODEL,
                max_tokens=MAX_TOKENS,
                system=[
                    {"type": "text", "text": options_prompt.SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}},
                    {"type": "text", "text": _format_market_context(benchmarks),
                     "cache_control": {"type": "ephemeral"}},
                ],
                messages=[{"role": "user", "content": options_prompt.build_user_prompt(context)}],
                response_model=OptionsFlowSignal,
            )
            sonnet_calls += 1
        except Exception as e:
            logger.error("options scoring: Claude call failed for {} — {}", ticker, e)
            sentry_sdk.capture_exception(e)
            failed += 1
            continue

        if signal.direction == "HOLD":
            skipped += 1
            continue

        try:
            _write_options_signal(ticker, current_price, signal)
            logger.info(
                "options_flow/{}: {} {}% — {}",
                ticker, signal.direction, signal.confidence,
                signal.reasoning[:80],
            )
            success += 1
        except Exception as e:
            logger.error("options scoring: write failed for {} — {}", ticker, e)
            sentry_sdk.capture_exception(e)
            failed += 1

    return (f"{success} scored, {skipped} skipped, {failed} failed — "
            f"{haiku_calls} Haiku, {sonnet_calls} Sonnet, "
            f"{len(grouped)} tickers with unusual flow")
