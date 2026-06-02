"""
Newsletter emailer — sends daily newsletter at 7am ET.
Free subscribers get editorial + CTA.
Pro/Elite subscribers get the same editorial + their signal data layered on top.
"""

import html
import os
from datetime import date

import resend
import sentry_sdk
from loguru import logger

from supabase_client import supabase

resend.api_key   = os.environ.get("RESEND_API_KEY", "")
FROM_ADDRESS     = "Pleby from Plebs <daily@plebs.finance>"
APP_URL          = os.environ.get("NEXT_PUBLIC_APP_URL", "https://plebs.finance")


# ─── Fetch data ───────────────────────────────────────────────────────────────

def _get_todays_newsletter() -> dict | None:
    today = date.today().isoformat()
    try:
        result = (
            supabase.table("daily_briefings")
            .select("*")
            .eq("date", today)
            .limit(1)
            .execute()
        )
        return result.data[0] if result.data else None
    except Exception as e:
        logger.error("newsletter_emailer: fetch failed — {}", e)
        return None


def _get_subscribers() -> list[dict]:
    try:
        result = (
            supabase.table("newsletter_subscribers")
            .select("email, user_id, tier")
            .eq("unsubscribed", False)
            .execute()
        )
        return result.data or []
    except Exception as e:
        logger.error("newsletter_emailer: subscriber fetch failed — {}", e)
        sentry_sdk.capture_exception(e)
        return []


def _get_user_signals(user_id: str, top_signals: list[dict]) -> list[dict]:
    """For paid users, try to match signals to their watchlist."""
    if not user_id or not top_signals:
        return top_signals
    try:
        wl = (
            supabase.table("watchlist")
            .select("identifier")
            .eq("user_id", user_id)
            .execute()
        )
        tickers = {w["identifier"] for w in (wl.data or [])}
        if not tickers:
            return top_signals
        matched = [s for s in top_signals if s.get("identifier") in tickers]
        return matched if matched else top_signals
    except Exception:
        return top_signals


# ─── HTML renderers ───────────────────────────────────────────────────────────

def _story_html(story: dict) -> str:
    headline      = html.escape(story.get("headline", ""))
    what_happened = html.escape(story.get("what_happened", ""))
    what_we_know  = html.escape(story.get("what_we_know", ""))
    could_mean    = html.escape(story.get("could_mean", ""))
    watch         = html.escape(story.get("watch", ""))

    return f"""
    <div style="margin-bottom:28px;">
      <div style="font-size:16px;font-weight:700;color:#fff;margin-bottom:12px;line-height:1.3;">{headline}</div>
      <div style="margin-bottom:8px;">
        <span style="font-size:10px;font-weight:700;color:#52525b;text-transform:uppercase;letter-spacing:.08em;">What happened</span>
        <div style="color:#d4d4d8;font-size:14px;line-height:1.6;margin-top:3px;">{what_happened}</div>
      </div>
      <div style="margin-bottom:8px;">
        <span style="font-size:10px;font-weight:700;color:#52525b;text-transform:uppercase;letter-spacing:.08em;">What we know</span>
        <div style="color:#d4d4d8;font-size:14px;line-height:1.6;margin-top:3px;">{what_we_know}</div>
      </div>
      <div style="margin-bottom:8px;">
        <span style="font-size:10px;font-weight:700;color:#52525b;text-transform:uppercase;letter-spacing:.08em;">What it could mean</span>
        <div style="color:#d4d4d8;font-size:14px;line-height:1.6;margin-top:3px;">{could_mean}</div>
      </div>
      <div>
        <span style="font-size:10px;font-weight:700;color:#22c55e;text-transform:uppercase;letter-spacing:.08em;">What to watch</span>
        <div style="color:#d4d4d8;font-size:14px;line-height:1.6;margin-top:3px;">{watch}</div>
      </div>
    </div>"""


def _signals_html(signals: list[dict]) -> str:
    if not signals:
        return ""
    rows = ""
    for s in signals:
        direction  = html.escape(s.get("direction", ""))
        identifier = html.escape(s.get("identifier", ""))
        confidence = s.get("confidence", 0)
        horizon    = html.escape(s.get("time_horizon", ""))
        dir_color  = "#22c55e" if direction in ("BUY", "YES") else "#ef4444"
        rows += f"""
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #27272a;">
            <span style="font-family:monospace;font-weight:700;color:#fff;">{identifier}</span>
            &nbsp;
            <span style="background:{dir_color}22;color:{dir_color};border:1px solid {dir_color}55;border-radius:4px;padding:1px 6px;font-size:11px;font-weight:700;">{direction}</span>
          </td>
          <td style="padding:8px 12px;border-bottom:1px solid #27272a;color:#71717a;font-size:12px;">{confidence}% · {horizon}</td>
        </tr>"""
    return f"""
    <div style="margin:24px 0;padding:20px;background:#18181b;border-radius:10px;border:1px solid #27272a;">
      <div style="font-size:11px;font-weight:700;color:#52525b;text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px;">Your signals today</div>
      <table style="width:100%;border-collapse:collapse;">{rows}</table>
      <a href="{APP_URL}/dashboard" style="display:inline-block;margin-top:12px;color:#22c55e;font-size:12px;font-weight:600;text-decoration:none;">Full signal feed →</a>
    </div>"""


def _options_html(options: list[dict]) -> str:
    if not options:
        return ""
    items = ""
    for o in options:
        ticker      = html.escape(o.get("ticker", ""))
        option_type = html.escape(o.get("option_type", "").upper())
        volume      = o.get("volume", 0)
        oi          = o.get("open_interest", 0)
        color       = "#22c55e" if option_type == "CALL" else "#ef4444"
        items += f"""
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #27272a;">
          <span style="font-family:monospace;font-weight:700;color:#fff;">{ticker}</span>
          <span style="color:{color};font-size:12px;font-weight:700;">{option_type}</span>
          <span style="color:#71717a;font-size:12px;">vol {volume:,} / OI {oi:,}</span>
        </div>"""
    return f"""
    <div style="margin:16px 0;padding:20px;background:#18181b;border-radius:10px;border:1px solid #27272a;">
      <div style="font-size:11px;font-weight:700;color:#52525b;text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px;">Unusual options flow</div>
      {items}
    </div>"""


def _render_html(briefing: dict, tier: str, user_id: str | None) -> str:
    content      = briefing.get("content_json") or {}
    subject_line = html.escape(briefing.get("headline", ""))
    opening      = html.escape(content.get("opening_line", ""))
    closing      = html.escape(content.get("closing_line", ""))
    stories      = content.get("stories", [])
    today        = date.today().strftime("%A, %B %-d")
    is_paid      = tier in ("pro", "elite")

    stories_html = "".join(_story_html(s) for s in stories)

    paid_block = ""
    if is_paid:
        top_signals = _get_user_signals(user_id or "", content.get("top_signals", []))
        options     = content.get("options_flow", [])
        paid_block  = _signals_html(top_signals) + _options_html(options)

    free_cta = "" if is_paid else f"""
    <div style="margin:28px 0;padding:20px;background:#18181b;border:1px solid #27272a;border-radius:10px;text-align:center;">
      <div style="color:#fff;font-weight:700;font-size:15px;margin-bottom:6px;">Want the full signal feed?</div>
      <div style="color:#71717a;font-size:13px;margin-bottom:16px;">Real-time AI signals, options flow, congressional trades — 7-day free trial.</div>
      <a href="{APP_URL}/signup" style="display:inline-block;background:#22c55e;color:#000;font-weight:700;font-size:13px;padding:10px 22px;border-radius:8px;text-decoration:none;">Try Plebs free →</a>
    </div>"""

    return f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 20px;">
    <div style="margin-bottom:20px;">
      <div style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.02em;">
        plebs<span style="color:#22c55e;">.finance</span>
      </div>
      <div style="font-size:11px;color:#52525b;margin-top:2px;">{today}</div>
    </div>
    <h1 style="color:#fff;font-size:20px;font-weight:700;margin:0 0 16px;line-height:1.3;">{subject_line}</h1>
    <p style="color:#a1a1aa;font-size:15px;line-height:1.6;margin:0 0 28px;border-left:3px solid #27272a;padding-left:12px;">{opening}</p>
    <div style="border-top:1px solid #27272a;padding-top:24px;">
      {stories_html}
    </div>
    {paid_block}
    {free_cta}
    <p style="color:#71717a;font-size:14px;line-height:1.6;margin:24px 0;font-style:italic;">{closing}</p>
    <div style="border-top:1px solid #27272a;padding-top:16px;text-align:center;font-size:11px;color:#3f3f46;">
      Plebs.finance · Not financial advice ·
      <a href="{APP_URL}/unsubscribe" style="color:#52525b;">Unsubscribe</a>
    </div>
  </div>
</body>
</html>"""


def _render_text(briefing: dict) -> str:
    content  = briefing.get("content_json") or {}
    today    = date.today().strftime("%A, %B %-d")
    stories  = content.get("stories", [])

    lines = [
        f"PLEBS.FINANCE — {today}",
        briefing.get("headline", ""),
        "",
        content.get("opening_line", ""),
        "",
    ]
    for s in stories:
        lines += [
            s.get("headline", "").upper(),
            f"What happened: {s.get('what_happened', '')}",
            f"What we know: {s.get('what_we_know', '')}",
            f"What it could mean: {s.get('could_mean', '')}",
            f"What to watch: {s.get('watch', '')}",
            "",
        ]
    lines += [
        content.get("closing_line", ""),
        "",
        f"Full platform: {APP_URL}",
        f"Not financial advice. Unsubscribe: {APP_URL}/unsubscribe",
    ]
    return "\n".join(lines)


# ─── Main sender ──────────────────────────────────────────────────────────────

def send_newsletter() -> str:
    briefing = _get_todays_newsletter()
    if not briefing:
        logger.warning("newsletter_emailer: no briefing found for today — skipping")
        return "no briefing found"

    subscribers = _get_subscribers()
    if not subscribers:
        logger.info("newsletter_emailer: no subscribers")
        return "0 sent"

    subject   = briefing.get("headline", f"Plebs — {date.today().strftime('%b %-d')}")
    text_body = _render_text(briefing)
    sent, failed = 0, 0

    for sub in subscribers:
        email   = sub.get("email")
        tier    = sub.get("tier", "free")
        user_id = sub.get("user_id")

        if not email:
            continue

        try:
            html_body = _render_html(briefing, tier, user_id)
            resend.Emails.send({
                "from":    FROM_ADDRESS,
                "to":      [email],
                "subject": subject,
                "html":    html_body,
                "text":    text_body,
            })
            sent += 1
        except Exception as e:
            logger.error("newsletter_emailer: failed to send to {} — {}", email, e)
            sentry_sdk.capture_exception(e)
            failed += 1

    summary = f"{sent} sent, {failed} failed"
    logger.info("newsletter_emailer complete — {}", summary)
    return summary
