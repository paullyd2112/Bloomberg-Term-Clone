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
ENGINE_CUTOFF      = "2026-07-04T11:00:00Z"  # signals before this date are unreliable

# Emergency launch tuning — stricter stock BUY filters (July 2026)
STOCK_RVOL_MINIMUM        = 2.5   # minimum relative volume for equity signals
MAX_STOCK_SIGNALS_PER_DAY = 3     # hard cap on stock signals per calendar day

# High-beta semiconductor & crypto-proxy tickers — backtest showed these
# drove the entire -4.13% stock loss via intra-bar volatility whipsaws.
# Elevated RVOL threshold and sector-trend alignment required.
HIGH_BETA_VOLATILITY_WATCHLIST = frozenset({"AMD", "NVDA", "COIN", "SMCI", "AVGO"})
HIGH_BETA_RVOL_MINIMUM = 3.5
# Bumped from 2026-06-22 (the prior engine overhaul, #20) to just after
# 2026-07-04T10:27:30Z (#59), the fix for the case-sensitive ta indicator
# matcher + tz-aware ingest merge crash that left live stock/crypto scoring
# blind to RSI/MACD/Bollinger for an unknown prior stretch. Signals before
# this were generated from that broken pipeline and are not representative
# of current model performance.

_anthropic = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))
client     = instructor.from_anthropic(_anthropic)


# ─── Pydantic signal schemas ──────────────────────────────────────────────────

class StockSignal(BaseModel):
    direction:    Literal["BUY", "SELL", "HOLD"]
    confidence:   int    = Field(..., ge=0, le=100)
    reasoning:    str    = Field(..., min_length=20)
    time_horizon: Literal["intraday", "swing", "longterm"]
    key_risk:     str
    invalidation_price: float | None = Field(None, description="Price level where the trade thesis breaks (used for stop loss)")
    news_context: list[str] = Field(default_factory=list, max_length=3)


class CryptoSignal(BaseModel):
    direction:        Literal["BUY", "SELL", "HOLD"]
    confidence:       int    = Field(..., ge=0, le=100)
    reasoning:        str    = Field(..., min_length=20)
    time_horizon:     Literal["intraday", "swing", "longterm"]
    sentiment_driver: str
    invalidation_price: float | None = Field(None, description="Price level where the trade thesis breaks (used for stop loss)")
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

        vol_oi_ratios = [
            float(r["volume_oi_ratio"])
            for r in result.data
            if r.get("volume_oi_ratio") is not None
        ]
        max_vol_oi = round(max(vol_oi_ratios), 2) if vol_oi_ratios else None

        return {
            "unusual_calls":               len(calls),
            "unusual_puts":                len(puts),
            "put_call_ratio":              round(len(puts) / len(calls), 2) if calls else None,
            "max_vol_oi_ratio":            max_vol_oi,
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


# ─── Emergency launch tuning helpers ──────────────────────────────────────────

_spy_1h_cache: dict[str, tuple[float, bool]] = {}

def _spy_below_1h_sma20() -> bool:
    """Check if SPY is trading below its 20-period SMA on 1-hour candles.
    Returns True (= reject stock BUYs) when SPY < SMA-20 on the 1h chart.
    Caches the result for the current hour to avoid repeated API calls."""
    now = datetime.now(timezone.utc)
    cache_key = now.strftime("%Y-%m-%d-%H")
    if cache_key in _spy_1h_cache:
        return _spy_1h_cache[cache_key][1]

    try:
        from ingestion.alpaca_client import fetch_stock_bars
        df = fetch_stock_bars("SPY", days=5, timeframe="1Hour")
        if df is None or len(df) < 20:
            logger.warning("SPY 1h gate: insufficient data ({} bars) — defaulting to pass",
                           len(df) if df is not None else 0)
            _spy_1h_cache[cache_key] = (now.timestamp(), False)
            return False

        sma_20 = df["close"].rolling(20).mean()
        latest_close = float(df["close"].iloc[-1])
        latest_sma = float(sma_20.iloc[-1])
        below = latest_close < latest_sma
        _spy_1h_cache[cache_key] = (now.timestamp(), below)
        logger.info("SPY 1h SMA-20 gate: close={:.2f}, SMA-20={:.2f}, below={}",
                    latest_close, latest_sma, below)
        return below
    except Exception as e:
        logger.warning("SPY 1h gate error: {} — defaulting to pass", e)
        _spy_1h_cache[cache_key] = (now.timestamp(), False)
        return False


def _stock_signals_today_count() -> int:
    """Count how many stock signals have been written today (UTC)."""
    try:
        today_start = datetime.now(timezone.utc).strftime("%Y-%m-%dT00:00:00Z")
        result = (
            supabase.table("signals")
            .select("id", count="exact")
            .eq("asset_type", "stock")
            .gte("created_at", today_start)
            .neq("direction", "HOLD")
            .execute()
        )
        return result.count or 0
    except Exception as e:
        logger.warning("Daily stock signal count query failed: {} — defaulting to 0", e)
        return 0


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


# ─── XML batch context helpers ───────────────────────────────────────────────

def _build_macro_context_dict(benchmarks: dict | None) -> dict:
    """Build the macro_context dict consumed by build_batch_xml_payload."""
    bm = benchmarks or {}
    spy = bm.get("SPY", {})

    vix = "N/A"
    try:
        from ingestion.fred import get_indicator_snapshot
        snapshot = get_indicator_snapshot()
        vix_data = snapshot.get("VIXCLS")
        if vix_data:
            vix = round(vix_data["value"], 2)
    except Exception:
        pass

    return {
        "vix": vix,
        "sp500_price": spy.get("price", "N/A"),
        "sp500_trend": (
            "strong_uptrend" if (spy.get("price_vs_sma50_pct") or 0) > 5
            else "downtrend" if (spy.get("price_vs_sma50_pct") or 0) < 0
            else "neutral"
        ),
        "crypto_funding_rate": "N/A",
        "high_impact_news_day": False,
    }


def _build_asset_health_dict(meta: dict, identifier: str) -> dict:
    """Build the asset_health dict consumed by build_batch_xml_payload."""
    days_to_earnings = "N/A"
    uoa_multiplier = "N/A"

    earnings = _get_earnings_context(identifier)
    if earnings and earnings.get("hours_until") is not None:
        days_to_earnings = max(earnings["hours_until"] // 24, 0)

    options = _get_options_context(identifier)
    if options and options.get("max_vol_oi_ratio") is not None:
        uoa_multiplier = options["max_vol_oi_ratio"]

    return {
        "rvol": meta.get("volume_ratio", "N/A"),
        "pe_ratio": meta.get("pe_ratio", "N/A"),
        "days_to_earnings": days_to_earnings,
        "uoa_vol_oi_multiplier": uoa_multiplier,
    }


# ─── Signal writer ────────────────────────────────────────────────────────────

# Set by scheduler.py's manual /run-job/ endpoint around a {"force": true}
# call for a stock-hours job outside market hours, so signals generated
# from stale prior-close data during weekend/holiday debugging are tagged
# rather than silently indistinguishable from real ones. Module-level
# rather than threaded through every call site (mirrors breadth_tracker's
# scope) -- acceptable since this only applies to a single deliberate
# manual debug request, not concurrent normal traffic.
STALE_TEST_MODE = False


def _write_signal(
    asset_type: str,
    identifier: str,
    price: float | None,
    signal,
    news_with_urls: list[dict] | None = None,
    risk_budget: "RiskBudget | None" = None,
    atr: float | None = None,
    subscription: str | None = None,
) -> dict:
    from scoring.risk_engine import (
        score_setup, format_trade_setup, AssetClass,
        filter_by_subscription, SubscriptionTier,
    )

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

    # Map asset_type to AssetClass — prediction markets route through
    # retail_standard only (prop firms don't support binary contracts)
    _ASSET_CLASS_MAP = {
        "crypto": AssetClass.CRYPTO,
        "prediction": AssetClass.PREDICTION_MARKET,
    }

    # Subscription tier gating — Pro gets stocks/crypto only;
    # Elite gets all asset classes
    trade_setup_data = None
    direction_field = signal.direction
    if asset_type == "prediction":
        direction_field = "BUY" if getattr(signal, "direction", "HOLD") == "YES" else (
            "SELL" if getattr(signal, "direction", "HOLD") == "NO" else "HOLD"
        )

    asset_cls = _ASSET_CLASS_MAP.get(asset_type, AssetClass.STOCK)
    if subscription:
        sub_rejection = filter_by_subscription(asset_cls, subscription)
        if sub_rejection:
            logger.info("{}/{}: subscription gate — {}", asset_type, identifier, sub_rejection)
            base = {
                "asset_type":      asset_type,
                "identifier":      identifier,
                "direction":       "HOLD",
                "confidence":      0,
                "reasoning":       f"[Subscription gate] {sub_rejection}",
                "time_horizon":    signal.time_horizon,
                "price_at_signal": price,
                "news_context":    signal.news_context,
                "news_urls":       [],
                "is_backtest":     False,
                "is_stale_test":   STALE_TEST_MODE,
                "outcome":         "PENDING",
            }
            return base

    if price is not None and direction_field in ("BUY", "SELL"):
        invalidation = getattr(signal, "invalidation_price", None)
        setup = score_setup(
            direction=direction_field,
            asset_class=asset_cls,
            entry_price=price,
            confidence=adjusted_confidence,
            budget=risk_budget,
            atr=atr,
            invalidation_level=invalidation,
            identifier=identifier,
        )
        trade_setup_data = format_trade_setup(setup)

        if setup.suppressed:
            logger.warning(
                "{}/{}: SUPPRESSED by risk engine — {}",
                asset_type, identifier, setup.suppression_reason,
            )
            signal.direction = "HOLD"
            adjusted_confidence = 0
            signal.reasoning = (
                f"[SUPPRESSED — {setup.suppression_reason}] "
                + signal.reasoning
            )

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
        "is_stale_test":   STALE_TEST_MODE,
        "outcome":         "PENDING",
    }
    if trade_setup_data:
        base["trade_setup"] = trade_setup_data
    result = supabase.table("signals").insert(base).execute()
    return result.data[0] if result.data else base


# ─── Tier-gated API response formatting ──────────────────────────────────────

_PRO_ALLOWED_ASSET_TYPES = frozenset({"stock", "crypto"})

def format_signal_for_tier(signal: dict, tier: str | None) -> dict | None:
    """Filter a signal dict based on subscription tier before API delivery.

    Pro: stocks and crypto only — raw alpha (entry/stop/target), no futures
    proxy, no profile allocations.
    Elite: complete package including futures proxy and all profile allocations.
    None/missing: treated as pro (safest default).
    """
    from scoring.risk_engine import SubscriptionTier, PRO_TIERS, ELITE_TIERS

    if tier:
        try:
            sub = SubscriptionTier(tier)
        except ValueError:
            sub = None
    else:
        sub = None

    is_elite = sub in ELITE_TIERS if sub else False
    asset_type = signal.get("asset_type", "")

    if not is_elite and asset_type not in _PRO_ALLOWED_ASSET_TYPES:
        return None

    result = dict(signal)

    if not is_elite:
        ts = result.get("trade_setup")
        if isinstance(ts, dict):
            ts.pop("futures_proxy", None)
            ts.pop("profile_allocations", None)

    return result


# ─── Core scoring function ────────────────────────────────────────────────────

def score_asset(
    asset_type: str,
    identifier: str,
    model_override: str | None = None,
    benchmarks: dict | None = None,
    macro_events: list[str] | None = None,
    breadth_tracker: dict | None = None,
    btc_regime: dict | None = None,
    skip_hold: bool = True,
    risk_budget: "RiskBudget | None" = None,
    subscription: str | None = None,
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

    `skip_hold` discards HOLD signals instead of writing them (default,
    used by the batch scanners so the feed only shows actionable calls).
    On-demand scoring passes `skip_hold=False` — a user who explicitly
    asked "what does the AI think about this ticker" deserves the real
    answer even when that answer is neutral, instead of the generic
    "no actionable data" message a silently-discarded HOLD produces.
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

    # ── Time-of-day filter (stocks only — crypto/prediction trade 24/7) ────
    if asset_type == "stock":
        from scoring.risk_engine import is_after_market_cutoff
        if is_after_market_cutoff():
            logger.info("{}/{}: time gate — past 3:30 PM EST, skipping", asset_type, identifier)
            return None

    # ── Build asset-specific context & call Claude ──────────────────────────

    # Reuse preloaded macro context if the caller supplied it (score_stocks/
    # score_crypto fetch this once per run); otherwise fetch fresh for
    # standalone callers (on-demand scoring, crypto momentum scan).
    if benchmarks is None:
        benchmarks = _get_market_benchmark()
    if macro_events is None:
        macro_events = _get_upcoming_macro(days=2)

    from scoring.risk_engine import STATIC_EXAMPLES_XML, build_batch_xml_payload, AssetClass

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

            macro_ctx = _build_macro_context_dict(benchmarks)
            asset_health = _build_asset_health_dict(meta, identifier)
            batch_xml = build_batch_xml_payload(
                asset_class=AssetClass.STOCK,
                identifier=identifier,
                entry_price=current_price,
                direction="PENDING",
                profile_name="retail_standard",
                macro_context=macro_ctx,
                asset_health=asset_health,
            )

            signal: StockSignal = client.chat.completions.create(
                model=use_model,
                max_tokens=MAX_TOKENS,
                system=[
                    {"type": "text", "text": stocks_prompt.SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}},
                    {"type": "text", "text": STATIC_EXAMPLES_XML, "cache_control": {"type": "ephemeral"}},
                    {"type": "text", "text": _format_market_context(benchmarks, macro_events),
                     "cache_control": {"type": "ephemeral"}},
                ],
                messages=[{"role": "user", "content": batch_xml + "\n\n" + stocks_prompt.build_user_prompt(context)}],
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

            macro_ctx = _build_macro_context_dict(benchmarks)
            batch_xml = build_batch_xml_payload(
                asset_class=AssetClass.CRYPTO,
                identifier=identifier,
                entry_price=current_price,
                direction="PENDING",
                profile_name="retail_standard",
                macro_context=macro_ctx,
            )

            signal: CryptoSignal = client.chat.completions.create(
                model=use_model,
                max_tokens=MAX_TOKENS,
                system=[
                    {"type": "text", "text": crypto_prompt.SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}},
                    {"type": "text", "text": STATIC_EXAMPLES_XML, "cache_control": {"type": "ephemeral"}},
                    {"type": "text", "text": _format_market_context(benchmarks, macro_events),
                     "cache_control": {"type": "ephemeral"}},
                ],
                messages=[{"role": "user", "content": batch_xml + "\n\n" + crypto_prompt.build_user_prompt(context)}],
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

            macro_ctx = _build_macro_context_dict(benchmarks)
            batch_xml = build_batch_xml_payload(
                asset_class=AssetClass.PREDICTION_MARKET,
                identifier=identifier,
                entry_price=current_price,
                direction="PENDING",
                profile_name="retail_standard",
                macro_context=macro_ctx,
            )

            signal: PredictionSignal = client.chat.completions.create(
                model=use_model,
                max_tokens=MAX_TOKENS,
                system=[
                    {"type": "text", "text": pred_prompt.SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}},
                    {"type": "text", "text": STATIC_EXAMPLES_XML, "cache_control": {"type": "ephemeral"}},
                    {"type": "text", "text": _format_market_context(benchmarks, macro_events),
                     "cache_control": {"type": "ephemeral"}},
                ],
                messages=[{"role": "user", "content": batch_xml + "\n\n" + pred_prompt.build_user_prompt(context)}],
                response_model=PredictionSignal,
            )

        else:
            logger.error("Unknown asset_type: {}", asset_type)
            return None

    except Exception as e:
        logger.error("{}/{}: Claude scoring failed — {}", asset_type, identifier, e)
        sentry_sdk.capture_exception(e)
        return None

    # Confidence gate — reject low-confidence signals before any further processing
    from scoring.risk_engine import check_confidence_gate, CONFIDENCE_MINIMUM
    conf_rejection = check_confidence_gate(signal.confidence)
    if conf_rejection and signal.direction in ("BUY", "SELL"):
        logger.info(
            "{}/{}: confidence gate — {} ({}%), downgrading to HOLD",
            asset_type, identifier, signal.direction, signal.confidence,
        )
        signal.direction = "HOLD"
        signal.reasoning = (
            f"[Confidence gate] Score {signal.confidence}/100 below "
            f"minimum {CONFIDENCE_MINIMUM} threshold. " + signal.reasoning
        )

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

    # SPY 1-hour SMA-20 gate — stricter intraday regime check.
    # The daily SMA-50 gate above catches multi-week downtrends; this catches
    # intraday weakness. If SPY is below its 20-period SMA on 1h candles,
    # reject ALL stock BUYs regardless of single-stock strength.
    if asset_type == "stock" and signal.direction == "BUY":
        if _spy_below_1h_sma20():
            logger.warning(
                "{}/{}: SPY 1h SMA-20 gate — SPY below 20-period SMA on 1h chart, rejecting BUY",
                asset_type, identifier,
            )
            signal.direction  = "HOLD"
            signal.confidence = min(signal.confidence, 40)
            signal.reasoning  = (
                "[SPY 1h gate] SPY is trading below its 20-period SMA on the 1-hour chart — "
                "intraday momentum is bearish. Rejecting BUY. "
                + signal.reasoning
            )

    # RVOL minimum gate — require 2.5x relative volume for equity signals,
    # elevated to 3.5x for high-beta volatility watchlist tickers.
    if asset_type == "stock" and signal.direction in ("BUY", "SELL"):
        is_high_beta = identifier in HIGH_BETA_VOLATILITY_WATCHLIST
        rvol_threshold = HIGH_BETA_RVOL_MINIMUM if is_high_beta else STOCK_RVOL_MINIMUM
        rvol = meta.get("volume_ratio")
        if rvol is not None:
            try:
                rvol_f = float(rvol)
                if rvol_f < rvol_threshold:
                    tag = "High-beta RVOL gate" if is_high_beta else "RVOL gate"
                    logger.warning(
                        "{}/{}: {} — {:.2f}x < {:.1f}x minimum, downgrading {} to HOLD",
                        asset_type, identifier, tag, rvol_f, rvol_threshold, signal.direction,
                    )
                    signal.direction  = "HOLD"
                    signal.confidence = min(signal.confidence, 40)
                    signal.reasoning  = (
                        f"[{tag}] Relative volume {rvol_f:.2f}x is below the {rvol_threshold:.1f}x "
                        f"minimum — insufficient institutional participation"
                        f"{' for high-beta semiconductor/crypto-proxy' if is_high_beta else ''}. "
                        + signal.reasoning
                    )
            except (TypeError, ValueError):
                pass

    # High-beta sector trend alignment gate — for watchlist tickers that
    # passed the elevated RVOL check, verify the sector is trending favorably.
    # Uses QQQ as the sector proxy (all watchlist names are tech/semi-heavy).
    if (asset_type == "stock" and identifier in HIGH_BETA_VOLATILITY_WATCHLIST
            and signal.direction == "BUY"):
        qqq_data = (benchmarks or {}).get("QQQ", {})
        qqq_change = qqq_data.get("change_24h")
        if qqq_change is not None:
            try:
                qqq_change_f = float(qqq_change)
                if qqq_change_f < 0:
                    logger.warning(
                        "{}/{}: sector alignment gate — QQQ {:.2f}% today, "
                        "high-beta BUY requires sector above daily open",
                        asset_type, identifier, qqq_change_f,
                    )
                    signal.direction  = "HOLD"
                    signal.confidence = min(signal.confidence, 35)
                    signal.reasoning  = (
                        f"[Sector alignment gate] QQQ is {qqq_change_f:.2f}% today — "
                        f"sector trading below daily open. High-beta {identifier} BUY "
                        f"requires sector tailwind. "
                        + signal.reasoning
                    )
            except (TypeError, ValueError):
                pass

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
    # (batch scanners only; on-demand scoring passes skip_hold=False)
    if signal.direction == "HOLD" and skip_hold:
        logger.debug("{}/{}: skipping HOLD signal ({}%)", asset_type, identifier, signal.confidence)
        return None

    # Write to Supabase (risk engine runs inside _write_signal)
    atr_value = None
    if meta.get("atr_14") is not None:
        try:
            atr_value = float(meta["atr_14"])
        except (TypeError, ValueError):
            pass

    try:
        record = _write_signal(
            asset_type, identifier, current_price, signal, news_with_urls,
            risk_budget=risk_budget, atr=atr_value, subscription=subscription,
        )
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

def score_stocks(subscription: str | None = None) -> str:
    from scoring.scanner import scan_stocks
    from scoring.haiku_prescreen import prescreen_stock, should_escalate_to_sonnet
    from scoring.risk_engine import RiskBudget

    # Daily stock signal volume throttle — hard cap at MAX_STOCK_SIGNALS_PER_DAY
    existing_today = _stock_signals_today_count()
    if existing_today >= MAX_STOCK_SIGNALS_PER_DAY:
        logger.warning("Daily stock signal cap reached ({}/{}) — skipping entire stock scan",
                       existing_today, MAX_STOCK_SIGNALS_PER_DAY)
        return f"0 scored, 0 skipped, 0 failed — daily cap reached ({existing_today}/{MAX_STOCK_SIGNALS_PER_DAY})"

    scan_results = scan_stocks(use_movers=True)
    core_always_score = {"AAPL", "NVDA", "TSLA", "GOOGL", "META", "AMZN", "MSFT", "SPY", "QQQ"}

    benchmarks   = _get_market_benchmark()
    macro_events = _get_upcoming_macro(days=2)
    breadth_tracker: dict = {"extended_buys": 0}
    risk_budget = RiskBudget()
    signals_written_this_run = 0

    haiku_calls, sonnet_calls = 0, 0
    success, skipped, failed = 0, 0, 0

    remaining_budget = MAX_STOCK_SIGNALS_PER_DAY - existing_today
    cap_hit = False

    for item in scan_results:
        if cap_hit:
            skipped += 1
            continue
        ticker = item["ticker"]

        if ticker in core_always_score:
            try:
                result = score_asset("stock", ticker, benchmarks=benchmarks, macro_events=macro_events,
                                      breadth_tracker=breadth_tracker, risk_budget=risk_budget,
                                      subscription=subscription)
                sonnet_calls += 1
                if result is None:
                    skipped += 1
                else:
                    success += 1
                    signals_written_this_run += 1
                    if signals_written_this_run >= remaining_budget:
                        logger.warning("Daily stock signal cap reached mid-run ({}/{})",
                                       existing_today + signals_written_this_run, MAX_STOCK_SIGNALS_PER_DAY)
                        cap_hit = True
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
                                  breadth_tracker=breadth_tracker, risk_budget=risk_budget,
                                  subscription=subscription)
            sonnet_calls += 1
            if result is None:
                skipped += 1
            else:
                success += 1
                signals_written_this_run += 1
                if signals_written_this_run >= remaining_budget:
                    logger.warning("Daily stock signal cap reached mid-run ({}/{})",
                                   existing_today + signals_written_this_run, MAX_STOCK_SIGNALS_PER_DAY)
                    cap_hit = True
        except Exception as e:
            logger.error("score_stocks error for {}: {}", ticker, e)
            sentry_sdk.capture_exception(e)
            failed += 1

    for core_ticker in core_always_score:
        if cap_hit:
            skipped += 1
            continue
        if not any(s["ticker"] == core_ticker for s in scan_results):
            try:
                result = score_asset("stock", core_ticker, benchmarks=benchmarks, macro_events=macro_events,
                                      breadth_tracker=breadth_tracker, risk_budget=risk_budget,
                                      subscription=subscription)
                sonnet_calls += 1
                if result is None:
                    skipped += 1
                else:
                    success += 1
                    signals_written_this_run += 1
                    if signals_written_this_run >= remaining_budget:
                        logger.warning("Daily stock signal cap reached mid-run ({}/{})",
                                       existing_today + signals_written_this_run, MAX_STOCK_SIGNALS_PER_DAY)
                        cap_hit = True
            except Exception as e:
                logger.error("score_stocks error for {}: {}", core_ticker, e)
                sentry_sdk.capture_exception(e)
                failed += 1

    cap_note = f", daily cap: {existing_today + signals_written_this_run}/{MAX_STOCK_SIGNALS_PER_DAY}" if cap_hit else ""
    return (f"{success} scored, {skipped} skipped, {failed} failed — "
            f"scanned {len(scan_results)} stocks, {haiku_calls} Haiku, {sonnet_calls} Sonnet{cap_note}")


def score_stocks_event_only(subscription: str | None = None) -> str:
    """Midday event-driven scan — skips core tickers and daily-bar indicators.
    Only scores stocks with intraday events (gap moves, volume surges)."""
    from scoring.scanner import scan_stocks
    from scoring.haiku_prescreen import prescreen_stock, should_escalate_to_sonnet
    from scoring.risk_engine import RiskBudget

    existing_today = _stock_signals_today_count()
    if existing_today >= MAX_STOCK_SIGNALS_PER_DAY:
        logger.warning("[event-only] Daily stock signal cap reached ({}/{}) — skipping",
                       existing_today, MAX_STOCK_SIGNALS_PER_DAY)
        return f"[event-only] 0 scored — daily cap reached ({existing_today}/{MAX_STOCK_SIGNALS_PER_DAY})"

    scan_results = scan_stocks(use_movers=True, event_only=True)

    benchmarks   = _get_market_benchmark()
    macro_events = _get_upcoming_macro(days=2)
    breadth_tracker: dict = {"extended_buys": 0}
    risk_budget = RiskBudget()
    signals_written_this_run = 0
    remaining_budget = MAX_STOCK_SIGNALS_PER_DAY - existing_today
    cap_hit = False

    haiku_calls, sonnet_calls = 0, 0
    success, skipped, failed = 0, 0, 0

    for item in scan_results:
        if cap_hit:
            skipped += 1
            continue
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
                                  breadth_tracker=breadth_tracker, risk_budget=risk_budget,
                                  subscription=subscription)
            sonnet_calls += 1
            if result is None:
                skipped += 1
            else:
                success += 1
                signals_written_this_run += 1
                if signals_written_this_run >= remaining_budget:
                    logger.warning("[event-only] Daily stock signal cap reached mid-run ({}/{})",
                                   existing_today + signals_written_this_run, MAX_STOCK_SIGNALS_PER_DAY)
                    cap_hit = True
        except Exception as e:
            logger.error("score_stocks_event_only error for {}: {}", ticker, e)
            sentry_sdk.capture_exception(e)
            failed += 1

    cap_note = f", daily cap: {existing_today + signals_written_this_run}/{MAX_STOCK_SIGNALS_PER_DAY}" if cap_hit else ""
    return (f"[event-only] {success} scored, {skipped} skipped, {failed} failed — "
            f"scanned {len(scan_results)} stocks, {haiku_calls} Haiku, {sonnet_calls} Sonnet{cap_note}")


CORE_CRYPTO   = {"BTC", "ETH", "SOL", "XRP", "ADA"}
TIER1_CRYPTO  = {
    "BNB", "DOGE", "AVAX", "DOT", "LINK", "UNI", "ATOM",
    "LTC", "NEAR", "APT", "ARB", "OP", "FIL", "INJ", "SUI", "SEI",
    "PEPE", "WIF", "SHIB", "TIA", "AAVE", "MKR", "RENDER", "FET",
}
CRYPTO_MOVER_THRESHOLD = 5.0  # % change to qualify lower-tier coins


def score_crypto(subscription: str | None = None) -> str:
    from scoring.haiku_prescreen import prescreen_crypto, should_escalate_to_sonnet

    try:
        # raw_prices is a time-series table -- every coin gets a new row each
        # ~60s stream flush, so unbounded it holds millions of rows. Filtering
        # by a JSONB path (metadata->rsi_14 is not null) with no time bound
        # forces a full-table scan that hits Postgres's statement timeout
        # under service_role (57014, observed live 2026-07-04 through
        # 2026-07-06 -- crypto signal generation silently produced zero
        # output for two and a half days). ingest_crypto runs every 4h, so a
        # 5h window comfortably covers the freshest indicator-bearing row per
        # coin with buffer for a delayed run, while bounding the scan the
        # same way the prediction-market fetch does.
        result = (
            supabase.table("raw_prices")
            .select("identifier, price, change_24h, metadata")
            .eq("asset_type", "crypto")
            .neq("identifier", "MARKET_SENTIMENT")
            .gte("captured_at", (datetime.now(timezone.utc) - timedelta(hours=5)).isoformat())
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
        sentry_sdk.capture_exception(e)
        return f"failed to fetch identifiers — {type(e).__name__}: {e}"

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
                                      btc_regime=btc_regime, subscription=subscription)
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
                                  btc_regime=btc_regime, subscription=subscription)
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


PREDICTION_CANDIDATE_POOL  = 150  # raw pool pulled before diversification
PREDICTION_CANDIDATE_LIMIT = 20   # diversified candidates actually prescreened
PREDICTION_MAX_PER_EVENT   = 2    # cap per real-world event/topic


def score_prediction_markets(subscription: str | None = None) -> str:
    from scoring.haiku_prescreen import prescreen_prediction, should_escalate_to_sonnet

    # raw_prices is a time-series table -- every market gets a new row each
    # ~30min ingest cycle, so it holds many historical snapshots per identifier.
    # Sorting the whole table by volume and taking the top N (as this used to
    # do) returns raw snapshot rows, not distinct markets: a handful of
    # extremely high-volume markets (e.g. one sports event's country-to-win
    # sub-markets running $100M+ each) fill every slot with their own repeated
    # history, crowding out literally every other market on the platform
    # before the event-diversity cap below ever gets a chance to run. Fetch a
    # recent window ordered by recency first and dedupe to one (latest) row
    # per identifier -- that gives a true cross-section of currently-tracked
    # markets -- then sort that by volume before diversifying by event.
    try:
        result = (
            supabase.table("raw_prices")
            .select("identifier, price, volume, metadata, captured_at")
            .eq("asset_type", "prediction")
            .gte("captured_at", (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat())
            .order("captured_at", desc=True)
            .limit(5000)
            .execute()
        )
        seen, latest_per_market = set(), []
        for r in result.data:
            ident = r["identifier"]
            if ident not in seen:
                seen.add(ident)
                latest_per_market.append(r)
        pool = sorted(latest_per_market, key=lambda r: r.get("volume") or 0, reverse=True)[:PREDICTION_CANDIDATE_POOL]
    except Exception as e:
        logger.error("score_prediction_markets: failed to fetch identifiers — {}", e)
        return "failed to fetch identifiers"

    # Diversify across events -- Polymarket volume concentrates hard around
    # whatever the single biggest live event is (e.g. a marquee sports final
    # can run $100M+ in volume while everything else is a fraction of that),
    # so a naive volume-sorted top-N is effectively "the same event's markets,
    # over and over" rather than a cross-section of what's actually happening
    # on the platform. Cap how many candidates can come from the same event.
    event_counts: dict[str, int] = {}
    rows = []
    for r in pool:
        event_key = (r.get("metadata") or {}).get("event_slug") or r["identifier"]
        count = event_counts.get(event_key, 0)
        if count >= PREDICTION_MAX_PER_EVENT:
            continue
        event_counts[event_key] = count + 1
        rows.append(r)
        if len(rows) >= PREDICTION_CANDIDATE_LIMIT:
            break

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
            result = score_asset("prediction", ident, subscription=subscription)
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
