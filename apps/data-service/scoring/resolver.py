"""
Outcome resolver — runs nightly at midnight UTC.
Marks PENDING signals as WIN / LOSS / NEUTRAL based on price movement.
Also handles alert evaluation every 30 minutes.

Resolution timing and thresholds are specific to asset type and time_horizon:
  - Stocks:  tighter thresholds, shorter eval windows
  - Crypto:  wider thresholds (higher vol), same eval windows
  - Predictions: settlement-based (no price thresholds)
"""

import asyncio
from datetime import datetime, timedelta, timezone

import httpx
import sentry_sdk
from loguru import logger

from supabase_client import supabase
from briefing.alert_emails import send_alert_notification

REQUEST_TIMEOUT = 10.0
# Settlement APIs paginate through their entire closed-market history with no
# natural end in sight for us — cap pages so a scheduler worker thread can't
# get tied up for minutes chasing history far older than any PENDING signal.
MAX_SETTLEMENT_PAGES = 25

# ─── Resolution config by (asset_type, time_horizon) ────────────────────────
# Each tuple: (min_age_hours, win_threshold, loss_threshold)
# min_age_hours  = how long to wait before evaluating
# win_threshold  = % move in signal direction to count as WIN
# loss_threshold = % move against signal direction to count as LOSS
#
# SYMMETRIC thresholds — win and loss use the same magnitude so that
# reported win rates are honest. The old asymmetric thresholds (e.g.
# 1.5% win / 4% loss) structurally inflated win rates because even
# random signals would show >50% wins.

RESOLUTION_CONFIG: dict[tuple[str, str], tuple[float, float, float]] = {
    # Stocks — symmetric thresholds derived from risk engine stop midpoints
    ("stock", "intraday"):  (6,    0.008,  0.008),   # 6h, 0.8% symmetric
    ("stock", "swing"):     (120,  0.0175, 0.0175),   # 5 trading days, 1.75% symmetric
    ("stock", "longterm"):  (360,  0.05,   0.05),     # 15 trading days, 5% symmetric
    # Crypto — check early so clear wins/losses resolve fast. Swing starts at
    # 24h (not 5d) because a 3% move can happen in hours; expiry at 2x (48h)
    # expires signals that never hit threshold. Prompt targets 3-10 day swings
    # but the resolver shouldn't wait 5 days to notice a coin already moved 5%.
    ("crypto", "intraday"): (4,    0.02,  0.02),      # 4h, 2% symmetric
    ("crypto", "swing"):    (24,   0.03,  0.03),      # 24h first check, 3% symmetric
    ("crypto", "longterm"): (168,  0.08,  0.08),      # 7 days, 8% symmetric
}

# Fallback for signals with missing/unknown time_horizon
DEFAULT_CONFIG: dict[str, tuple[float, float, float]] = {
    "stock":  (24, 0.015, 0.015),   # legacy 24h, 1.5% symmetric
    "crypto": (24, 0.03,  0.03),    # legacy 24h, 3% symmetric
}


def _get_resolution_config(asset_type: str, time_horizon: str | None) -> tuple[float, float, float]:
    if time_horizon:
        key = (asset_type, time_horizon)
        if key in RESOLUTION_CONFIG:
            return RESOLUTION_CONFIG[key]
    return DEFAULT_CONFIG.get(asset_type, (24, 0.015, 0.015))


def _get_signal_setup_thresholds(signal: dict) -> tuple[float, float] | None:
    """Extract stop/target from the trade_setup stored on the signal.

    When the risk engine attached a trade_setup at signal time, use its
    stop_pct as the definitive threshold (both win and loss) so that
    resolution matches the exact levels the user was shown.
    """
    setup = signal.get("trade_setup")
    if not setup or setup.get("suppressed"):
        return None
    stop_pct = setup.get("stop_pct")
    if stop_pct is not None and stop_pct > 0:
        threshold = stop_pct / 100
        return threshold, threshold
    return None


# ─── Price helpers ────────────────────────────────────────────────────────────

def _get_current_price(asset_type: str, identifier: str) -> float | None:
    try:
        result = (
            supabase.table("raw_prices")
            .select("price")
            .eq("asset_type", asset_type)
            .eq("identifier", identifier)
            .order("captured_at", desc=True)
            .limit(1)
            .execute()
        )
        return float(result.data[0]["price"]) if result.data else None
    except Exception as e:
        logger.warning("price fetch failed for {}/{}: {}", asset_type, identifier, e)
        return None


def _score_outcome(
    direction: str,
    entry: float,
    current: float,
    win_threshold: float,
    loss_threshold: float,
    is_expired: bool = False,
) -> str:
    """Score a signal outcome with symmetric thresholds.

    When is_expired=True (signal is past 2x its horizon), resolve as
    NEUTRAL — the trade thesis expired without hitting either target.
    The old behavior (any move = WIN) inflated win rates.
    """
    if direction == "HOLD":
        return "NEUTRAL"

    if entry == 0:
        return "NEUTRAL"

    pct_change = (current - entry) / entry

    if direction in ("BUY", "YES"):
        if pct_change >= win_threshold:
            return "WIN"
        if pct_change <= -loss_threshold:
            return "LOSS"
        if is_expired:
            return "NEUTRAL"
        return "NEUTRAL"

    if direction in ("SELL", "NO"):
        if pct_change <= -win_threshold:
            return "WIN"
        if pct_change >= loss_threshold:
            return "LOSS"
        if is_expired:
            return "NEUTRAL"
        return "NEUTRAL"

    return "NEUTRAL"


# ─── Prediction market settlement ─────────────────────────────────────────────

async def _fetch_settled_kalshi(identifiers: list[str]) -> dict[str, str]:
    """Returns {ticker: 'YES'|'NO'} for settled Kalshi markets."""
    resolved: dict[str, str] = {}
    id_set = set(identifiers)

    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
        cursor = None
        for _ in range(MAX_SETTLEMENT_PAGES):
            params: dict = {"status": "settled", "limit": 200}
            if cursor:
                params["cursor"] = cursor
            try:
                resp = await client.get(
                    "https://trading-api.kalshi.com/trade-api/v2/markets",
                    params=params,
                )
                resp.raise_for_status()
                data = resp.json()
            except Exception as e:
                logger.warning("Kalshi settled fetch error: {}", e)
                break

            for m in data.get("markets", []):
                ticker = m.get("ticker", "")
                if ticker not in id_set:
                    continue
                result = m.get("result")
                if result in ("yes", "no"):
                    resolved[ticker] = result.upper()

            cursor = data.get("cursor")
            if not cursor or not data.get("markets"):
                break

    return resolved


async def _fetch_resolved_polymarket(identifiers: list[str]) -> dict[str, str]:
    """Returns {condition_id: 'YES'|'NO'} for resolved Polymarket markets."""
    resolved: dict[str, str] = {}
    id_set = set(identifiers)

    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
        next_cursor = ""
        for _ in range(MAX_SETTLEMENT_PAGES):
            params: dict = {"closed": "true"}
            if next_cursor:
                params["next_cursor"] = next_cursor
            try:
                resp = await client.get("https://clob.polymarket.com/markets", params=params)
                resp.raise_for_status()
                data = resp.json()
            except Exception as e:
                logger.warning("Polymarket resolved fetch error: {}", e)
                break

            for m in data.get("data", []):
                cid = m.get("condition_id", "")
                if cid not in id_set:
                    continue
                # Find the winning token
                for token in m.get("tokens", []):
                    if token.get("winner"):
                        outcome = (token.get("outcome") or "").upper()
                        if outcome in ("YES", "NO"):
                            resolved[cid] = outcome

            next_cursor = data.get("next_cursor", "")
            if not next_cursor or next_cursor == "LTE=":
                break

    return resolved


# ─── Main resolver ────────────────────────────────────────────────────────────

def resolve_outcomes() -> str:
    """
    Find PENDING signals and resolve those that have aged past their
    time_horizon-specific evaluation window.

    Stocks/crypto: price-based WIN/LOSS/NEUTRAL with asset-specific thresholds.
    Predictions: settlement from Kalshi/Polymarket APIs.
    """
    # Fetch ALL pending non-backtest signals — we filter by age per-signal
    # using the earliest possible cutoff (6h for intraday)
    earliest_cutoff = (datetime.now(timezone.utc) - timedelta(hours=6)).isoformat()

    try:
        result = (
            supabase.table("signals")
            .select("*")
            .eq("outcome", "PENDING")
            .eq("is_backtest", False)
            .lte("created_at", earliest_cutoff)
            .execute()
        )
        pending = result.data or []
    except Exception as e:
        logger.error("resolve_outcomes: failed to fetch pending signals — {}", e)
        sentry_sdk.capture_exception(e)
        return f"failed to fetch pending signals: {e}"

    if not pending:
        logger.info("resolve_outcomes: no pending signals to resolve")
        return "0 resolved"

    logger.info("resolve_outcomes: {} pending signals past 6h cutoff", len(pending))

    now = datetime.now(timezone.utc)

    # Split by asset type
    stock_crypto = [s for s in pending if s["asset_type"] in ("stock", "crypto")]
    predictions  = [s for s in pending if s["asset_type"] == "prediction"]

    resolved_count = 0
    skipped_too_young = 0

    # ── Stocks & Crypto: price-based with per-signal thresholds ──────────────
    for signal in stock_crypto:
        try:
            asset_type   = signal["asset_type"]
            time_horizon = signal.get("time_horizon")
            min_age_h, win_thresh, loss_thresh = _get_resolution_config(asset_type, time_horizon)

            # Prefer the exact stop/target from the risk engine when available
            setup_thresholds = _get_signal_setup_thresholds(signal)
            if setup_thresholds:
                win_thresh, loss_thresh = setup_thresholds

            created = datetime.fromisoformat(
                signal["created_at"].replace("Z", "+00:00")
            )
            age_hours = (now - created).total_seconds() / 3600

            if age_hours < min_age_h:
                skipped_too_young += 1
                continue

            entry_price = signal.get("price_at_signal")
            if entry_price is None:
                continue

            current_price = _get_current_price(asset_type, signal["identifier"])
            if current_price is None:
                continue

            # Force binary resolution once signal is past 2x its intended horizon
            is_expired = age_hours >= (min_age_h * 2)

            outcome = _score_outcome(
                signal["direction"],
                float(entry_price),
                current_price,
                win_thresh,
                loss_thresh,
                is_expired=is_expired,
            )

            supabase.table("signals").update({
                "outcome":       outcome,
                "resolved_at":   now.isoformat(),
                "outcome_price": current_price,
            }).eq("id", signal["id"]).execute()

            resolved_count += 1
            logger.debug(
                "Resolved {}/{} signal {} → {} (horizon={}, entry={}, current={}, "
                "win_thresh={:.1%}, loss_thresh={:.1%})",
                asset_type, signal["identifier"],
                signal["id"], outcome, time_horizon,
                entry_price, current_price, win_thresh, loss_thresh,
            )
        except Exception as e:
            logger.error("resolve error for signal {}: {}", signal.get("id"), e)
            sentry_sdk.capture_exception(e)

    # ── Prediction markets: API settlement ───────────────────────────────────
    if predictions:
        kalshi_ids     = [s["identifier"] for s in predictions
                          if (s.get("metadata") or {}).get("source") == "kalshi"
                          or "-" in s["identifier"]]
        polymarket_ids = [s["identifier"] for s in predictions
                          if s["identifier"] not in kalshi_ids]

        async def _settle_predictions():
            # gather() must be constructed inside a running loop — passing it
            # directly as an asyncio.run() argument evaluates it eagerly,
            # before any loop exists on this (thread-pool) worker thread.
            return await asyncio.gather(
                _fetch_settled_kalshi(kalshi_ids),
                _fetch_resolved_polymarket(polymarket_ids),
                return_exceptions=True,
            )

        kalshi_results, poly_results = asyncio.run(_settle_predictions())

        settlement_map: dict[str, str] = {}
        if isinstance(kalshi_results, dict):
            settlement_map.update(kalshi_results)
        if isinstance(poly_results, dict):
            settlement_map.update(poly_results)

        for signal in predictions:
            ident     = signal["identifier"]
            settled   = settlement_map.get(ident)
            if not settled:
                continue  # market not yet resolved

            direction = signal["direction"]  # YES / NO / HOLD
            outcome = "NEUTRAL"
            if direction != "HOLD":
                outcome = "WIN" if direction == settled else "LOSS"

            try:
                supabase.table("signals").update({
                    "outcome":     outcome,
                    "resolved_at": datetime.now(timezone.utc).isoformat(),
                }).eq("id", signal["id"]).execute()
                resolved_count += 1
            except Exception as e:
                logger.error("prediction resolve write failed for {}: {}", ident, e)
                sentry_sdk.capture_exception(e)

    summary = (
        f"{resolved_count}/{len(pending)} signals resolved"
        f" ({skipped_too_young} too young for their time_horizon)"
    )
    logger.info("resolve_outcomes complete — {}", summary)
    return summary


# ─── Alert evaluator ──────────────────────────────────────────────────────────

def evaluate_alerts() -> str:
    """
    Check active alerts and update last_fired_at when triggered.
    Notification delivery handled separately (email / push in later prompts).
    """
    try:
        result = (
            supabase.table("alerts")
            .select("*")
            .eq("is_active", True)
            .execute()
        )
        alerts = result.data or []
    except Exception as e:
        logger.error("evaluate_alerts: fetch failed — {}", e)
        sentry_sdk.capture_exception(e)
        return "fetch failed"

    if not alerts:
        return "0 alerts active"

    fired = 0

    for alert in alerts:
        try:
            triggered = False

            if alert["trigger_type"] == "signal_fired":
                triggered = _check_signal_fired(alert)

            elif alert["trigger_type"] == "price_threshold":
                triggered = _check_price_threshold(alert)

            elif alert["trigger_type"] == "news_drop":
                triggered = _check_news_drop(alert)

            if triggered:
                supabase.table("alerts").update({
                    "last_fired_at": datetime.now(timezone.utc).isoformat(),
                }).eq("id", alert["id"]).execute()
                fired += 1
                logger.info(
                    "Alert fired: user={} asset={}/{} type={}",
                    alert["user_id"], alert["asset_type"],
                    alert["identifier"], alert["trigger_type"],
                )

                # Deliver the notification email (best-effort, never blocks).
                try:
                    ctx = _build_alert_context(alert)
                    send_alert_notification(alert, ctx)
                except Exception as e:
                    logger.error("alert email dispatch failed for alert {}: {}",
                                 alert.get("id"), e)
                    sentry_sdk.capture_exception(e)

                # Deliver web push notification (no-op if push not configured)
                try:
                    from notifications.push import send_alert_push
                    send_alert_push(alert["user_id"], alert)
                except Exception as e:
                    logger.warning("push delivery failed for alert {}: {}", alert.get("id"), e)

                # Deliver SMS notification (no-op if Twilio not configured)
                try:
                    from notifications.sms import send_alert_sms
                    send_alert_sms(alert["user_id"], alert)
                except Exception as e:
                    logger.warning("sms delivery failed for alert {}: {}", alert.get("id"), e)

        except Exception as e:
            logger.error("alert evaluation error for alert {}: {}", alert.get("id"), e)
            sentry_sdk.capture_exception(e)

    summary = f"{fired}/{len(alerts)} alerts fired"
    logger.info("evaluate_alerts complete — {}", summary)
    return summary


def _check_signal_fired(alert: dict) -> bool:
    """True if a new signal fired for this asset since last_fired_at (or past 31 min)."""
    last = alert.get("last_fired_at")
    if last:
        since = last.replace("Z", "+00:00")  # normalise Supabase UTC suffix
    else:
        since = (datetime.now(timezone.utc) - timedelta(minutes=31)).isoformat()
    try:
        result = (
            supabase.table("signals")
            .select("id")
            .eq("asset_type", alert["asset_type"])
            .eq("identifier", alert["identifier"])
            .eq("is_backtest", False)
            .gte("created_at", since)
            .limit(1)
            .execute()
        )
        return bool(result.data)
    except Exception:
        return False


def _check_price_threshold(alert: dict) -> bool:
    """True if price is at or above threshold AND hasn't fired since last crossing."""
    threshold = alert.get("threshold")
    if threshold is None:
        return False
    threshold = float(threshold)

    current = _get_current_price(alert["asset_type"], alert["identifier"])
    if current is None:
        return False

    if current < threshold:
        return False

    # Already fired while price was above — don't spam.
    # Re-arm only after price dips back below threshold.
    last_fired = alert.get("last_fired_at")
    if last_fired:
        # Check if the price at last_fired_at was also above threshold.
        # We can't look that up easily, so instead we check whether the
        # price is still continuously above by comparing against a small
        # hysteresis band (1% below threshold resets the alert).
        reset_band = threshold * 0.99
        # If we've fired before and price never dropped below the band,
        # we treat the alert as already-acknowledged until it resets.
        # Because we don't store historical prices here, we use a simple
        # rule: don't re-fire within 4 hours of last firing.
        last_fired_dt = datetime.fromisoformat(last_fired.replace("Z", "+00:00"))
        if datetime.now(timezone.utc) - last_fired_dt < timedelta(hours=4):
            return False

    return True


def _check_news_drop(alert: dict) -> bool:
    """True if a new news item appeared since last_fired_at (or past 31 min)."""
    last = alert.get("last_fired_at")
    if last:
        since = last.replace("Z", "+00:00")
    else:
        since = (datetime.now(timezone.utc) - timedelta(minutes=31)).isoformat()
    try:
        result = (
            supabase.table("news_items")
            .select("id")
            .eq("identifier", alert["identifier"])
            .gte("created_at", since)
            .limit(1)
            .execute()
        )
        return bool(result.data)
    except Exception:
        return False


def _build_alert_context(alert: dict) -> dict:
    """Gather the detail shown in a fired-alert email, keyed by trigger type."""
    kind       = alert.get("trigger_type")
    asset_type = alert["asset_type"]
    identifier = alert["identifier"]

    if kind == "signal_fired":
        try:
            res = (
                supabase.table("signals")
                .select("direction, confidence, reasoning")
                .eq("asset_type", asset_type)
                .eq("identifier", identifier)
                .eq("is_backtest", False)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            if res.data:
                return res.data[0]
        except Exception:
            pass
        return {}

    if kind == "price_threshold":
        return {"price": _get_current_price(asset_type, identifier)}

    if kind == "news_drop":
        try:
            res = (
                supabase.table("news_items")
                .select("headline")
                .eq("identifier", identifier)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            if res.data:
                return {"headline": res.data[0].get("headline", "")}
        except Exception:
            pass
        return {}

    return {}
