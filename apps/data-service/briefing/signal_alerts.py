"""
High-confidence signal email alerts — automatic notifications for BUY/SELL signals.

Called from scoring/engine.py after a signal is written. Only fires for:
  - Direction: BUY or SELL (never HOLD)
  - Confidence: >= MIN_CONFIDENCE (70% default)
  - Tier: pro or elite subscribers only (free users get the newsletter CTA instead)
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

MIN_CONFIDENCE = 70
ACTIONABLE_DIRECTIONS = {"BUY", "SELL"}
PAID_TIERS = {"pro", "elite"}

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
    """Returns only pro/elite subscribers — free users don't get real-time signal alerts."""
    try:
        result = (
            supabase.table("newsletter_subscribers")
            .select("email, user_id, tier")
            .eq("unsubscribed", False)
            .in_("tier", list(PAID_TIERS))
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


MONO = "'SF Mono','Menlo','Consolas',monospace"


def _confidence_bar_color(confidence: int) -> str:
    if confidence >= 75:
        return "#22c55e"
    if confidence >= 50:
        return "#f59e0b"
    return "#71717a"


def _chunk_reasoning(reasoning: str) -> str:
    """Split reasoning into short lines instead of one dense paragraph —
    makes the technical setup scannable instead of read-as-prose."""
    import re
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", reasoning.strip()) if s.strip()]
    return "".join(
        f'<p style="color:#d4d4d8;font-size:15px;line-height:1.65;margin:0 0 10px;">{s}</p>'
        for s in sentences
    )


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
    bar_color = _confidence_bar_color(confidence)

    subject = f"{emoji} {direction} {identifier} — {confidence}% confidence"

    asset_url = f"{APP_URL}/dashboard/asset/{asset_type}/{identifier}"

    # Two-cell colored-<td> bar, not nested divs — the classic Outlook-safe
    # progress bar pattern, since Outlook won't reliably size/color nested
    # <div>s but does honor table cell widths + bgcolor.
    confidence_bar = f"""
      <table role="presentation" cellpadding="0" cellspacing="0" width="56" style="width:56px;">
        <tr>
          <td width="{confidence}%" bgcolor="{bar_color}" style="background-color:{bar_color};font-size:1px;line-height:5px;">&nbsp;</td>
          <td width="{100 - confidence}%" bgcolor="#27272a" style="background-color:#27272a;font-size:1px;line-height:5px;">&nbsp;</td>
        </tr>
      </table>"""

    card_inner = f"""
      <div style="font-family:{MONO};font-size:26px;font-weight:800;color:{color};margin-bottom:10px;">
        {direction} {identifier}
      </div>

      <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:18px;">
        <tr>
          <td style="font-family:{MONO};font-size:20px;font-weight:700;color:{bar_color};padding-right:8px;">{confidence}%</td>
          <td style="width:60px;">{confidence_bar}</td>
        </tr>
      </table>

      <div style="color:#71717a;font-size:12px;font-family:{MONO};margin-bottom:18px;text-transform:uppercase;letter-spacing:.06em;">
        {_horizon_label(horizon)} &middot; Entry {_fmt_price(price)}
      </div>

      {_chunk_reasoning(reasoning)}"""

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<!--[if mso]>
<style type="text/css">table {{border-collapse:collapse;}}</style>
<![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#09090b;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#09090b;">
<tr><td align="center">
<!--[if mso]>
<table role="presentation" align="center" width="560" cellpadding="0" cellspacing="0"><tr><td>
<![endif]-->
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;text-align:left;">
    <div style="font-size:20px;font-weight:800;color:#fff;margin-bottom:28px;letter-spacing:-0.01em;">
      plebs<span style="color:#22c55e;">.finance</span>
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#111113"
           style="background-color:#111113;border:1px solid #1e1e22;border-radius:10px;margin-bottom:20px;">
      <tr><td style="padding:24px;">
        {card_inner}
      </td></tr>
    </table>

    <a href="{asset_url}" style="display:inline-block;background:#22c55e;color:#000;font-weight:700;font-size:14px;text-decoration:none;padding:10px 20px;border-radius:6px;margin:0 0 24px;">
      View {identifier} on Plebs →
    </a>

    <hr style="border:none;border-top:1px solid #1e1e22;margin:24px 0;">
    <p style="color:#52525b;font-size:12px;line-height:1.5;margin:0;">
      This is a high-confidence signal alert from Plebs.finance.
      Not financial advice — always do your own research.
    </p>
  </div>
<!--[if mso]>
</td></tr></table>
<![endif]-->
</td></tr>
</table>
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


def _send_push_notifications(signal: dict, subscribers: list[dict]) -> int:
    """Send push notifications for a high-confidence signal to all subscribers
    who have push subscriptions registered."""
    try:
        from notifications.push import send_push_to_user
    except ImportError:
        return 0

    identifier = signal.get("identifier", "")
    direction = signal.get("direction", "")
    confidence = signal.get("confidence", 0)
    asset_type = signal.get("asset_type", "")
    market_title = signal.get("market_title")

    display_name = market_title or identifier
    title = f"{direction} {display_name} — {confidence}%"
    body = (signal.get("reasoning") or "")[:200]
    url = f"/dashboard/asset/{asset_type}/{identifier}"

    pushed = 0
    user_ids = {s["user_id"] for s in subscribers if s.get("user_id")}
    for uid in user_ids:
        pushed += send_push_to_user(uid, title, body, url)

    if pushed:
        logger.info("signal_alerts: pushed {} notification(s) for {} {}", pushed, direction, identifier)
    return pushed


def notify_high_confidence_signal(signal: dict) -> int:
    """Send email + push alerts for a high-confidence BUY/SELL signal.
    Returns number of emails sent."""
    if not _should_alert(signal):
        return 0

    subscribers = _get_subscribers()
    if not subscribers:
        return 0

    _send_push_notifications(signal, subscribers)

    if not resend.api_key:
        logger.debug("signal_alerts: no RESEND_API_KEY, skipping emails")
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
