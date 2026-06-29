"""
High-confidence signal email alerts — automatic notifications for BUY/SELL signals.

Called from scoring/engine.py after a signal is written. Only fires for:
  - Direction: BUY or SELL (never HOLD)
  - Confidence: >= MIN_CONFIDENCE (85% default, after accuracy penalty)

Sends to all active newsletter subscribers. Respects unsubscribed flag.
"""

import os
from datetime import datetime, timezone

import resend
import sentry_sdk
from loguru import logger

from supabase_client import supabase

resend.api_key = os.environ.get("RESEND_API_KEY", "") or os.environ.get("RESEND_API_KEY_", "")

FROM_ADDRESS = "Plebs Signals <signals@plebs.finance>"
APP_URL = os.environ.get("NEXT_PUBLIC_APP_URL", "https://plebs.finance")

MIN_CONFIDENCE = 85
ACTIONABLE_DIRECTIONS = {"BUY", "SELL"}

# Rate-limit: don't spam the same ticker within 6 hours
_recent_alerts: dict[str, datetime] = {}
COOLDOWN_HOURS = 6


def _should_alert(signal: dict) -> bool:
    direction = signal.get("direction", "")
    confidence = signal.get("confidence", 0)

    if direction not in ACTIONABLE_DIRECTIONS:
        return False
    if confidence < MIN_CONFIDENCE:
        return False
    if signal.get("is_backtest"):
        return False

    key = f"{signal.get('asset_type')}:{signal.get('identifier')}:{direction}"
    last_sent = _recent_alerts.get(key)
    if last_sent:
        hours_ago = (datetime.now(timezone.utc) - last_sent).total_seconds() / 3600
        if hours_ago < COOLDOWN_HOURS:
            logger.debug("signal_alerts: skipping {} — sent {:.1f}h ago", key, hours_ago)
            return False

    return True


def _get_subscribers() -> list[dict]:
    try:
        result = (
            supabase.table("newsletter_subscribers")
            .select("email, user_id")
            .eq("unsubscribed", False)
            .execute()
        )
        return result.data or []
    except Exception as e:
        logger.error("signal_alerts: subscriber fetch failed — {}", e)
        return []


def _direction_color(direction: str) -> str:
    return "#22c55e" if direction == "BUY" else "#ef4444"


def _direction_emoji(direction: str) -> str:
    return "🟢" if direction == "BUY" else "🔴"


def _fmt_price(price) -> str:
    if price is None:
        return "—"
    try:
        return f"${float(price):,.2f}"
    except (TypeError, ValueError):
        return "—"


def _horizon_label(horizon: str) -> str:
    return {
        "intraday": "Intraday (6h)",
        "swing": "Swing (5 days)",
        "longterm": "Long-term (15 days)",
        "before_close": "Before close",
    }.get(horizon, horizon or "—")


def _render_email(signal: dict) -> tuple[str, str, str]:
    direction = signal["direction"]
    identifier = signal["identifier"]
    asset_type = signal.get("asset_type", "stock")
    confidence = signal.get("confidence", 0)
    reasoning = signal.get("reasoning", "")
    price = signal.get("price_at_signal")
    horizon = signal.get("time_horizon", "")

    emoji = _direction_emoji(direction)
    color = _direction_color(direction)

    subject = f"{emoji} {direction} {identifier} — {confidence}% confidence"

    asset_url = f"{APP_URL}/dashboard/asset/{asset_type}/{identifier}"

    html = f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="font-size:22px;font-weight:800;color:#fff;margin-bottom:24px;">
      plebs<span style="color:#22c55e;">.finance</span>
    </div>

    <div style="background:#18181b;border:1px solid #27272a;border-radius:12px;padding:24px;margin-bottom:24px;">
      <div style="font-size:28px;font-weight:800;color:{color};margin-bottom:4px;">
        {direction} {identifier}
      </div>
      <div style="color:#a1a1aa;font-size:14px;margin-bottom:16px;">
        {confidence}% confidence &middot; {_horizon_label(horizon)} &middot; Entry {_fmt_price(price)}
      </div>
      <div style="color:#d4d4d8;font-size:15px;line-height:1.6;">
        {reasoning}
      </div>
    </div>

    <a href="{asset_url}" style="display:inline-block;background:#22c55e;color:#000;font-weight:600;font-size:14px;text-decoration:none;padding:10px 20px;border-radius:6px;margin:0 0 24px;">
      View {identifier} on Plebs →
    </a>

    <hr style="border:none;border-top:1px solid #27272a;margin:24px 0;">
    <p style="color:#52525b;font-size:12px;line-height:1.5;margin:0;">
      This is a high-confidence signal alert from Plebs.finance.
      Not financial advice — always do your own research.
    </p>
  </div>
</body>
</html>"""

    text = (
        f"{direction} {identifier} — {confidence}% confidence\n"
        f"Time horizon: {_horizon_label(horizon)}\n"
        f"Entry price: {_fmt_price(price)}\n\n"
        f"{reasoning}\n\n"
        f"View on Plebs: {asset_url}\n\n"
        f"Not financial advice — always do your own research."
    )

    return subject, html, text


def notify_high_confidence_signal(signal: dict) -> int:
    """Send email alerts for a high-confidence BUY/SELL signal.
    Returns number of emails sent."""
    if not _should_alert(signal):
        return 0

    if not resend.api_key:
        logger.debug("signal_alerts: no RESEND_API_KEY, skipping")
        return 0

    subscribers = _get_subscribers()
    if not subscribers:
        return 0

    subject, html, text = _render_email(signal)
    emails = [s["email"] for s in subscribers if s.get("email")]
    if not emails:
        return 0

    sent = 0
    for email in emails:
        try:
            resend.Emails.send({
                "from": FROM_ADDRESS,
                "to": [email],
                "subject": subject,
                "html": html,
                "text": text,
            })
            sent += 1
        except Exception as e:
            logger.warning("signal_alerts: failed to send to {} — {}", email, e)

    key = f"{signal.get('asset_type')}:{signal.get('identifier')}:{signal['direction']}"
    _recent_alerts[key] = datetime.now(timezone.utc)

    logger.info(
        "signal_alerts: {} {} {}% — sent to {}/{} subscribers",
        signal["direction"], signal["identifier"],
        signal.get("confidence"), sent, len(emails),
    )

    if sent < len(emails):
        sentry_sdk.capture_message(
            f"signal_alerts: partial delivery — {sent}/{len(emails)} for "
            f"{signal['direction']} {signal['identifier']}"
        )

    return sent
