"""
Newsletter emailer — sends newsletter via Resend based on subscriber frequency.
Free subscribers get editorial + CTA.
Pro/Elite subscribers get the same editorial + personalized signal data.

Frequency options (stored on newsletter_subscribers.newsletter_frequency):
  daily          — every day (default)
  weekdays       — Monday–Friday only
  every_other_day — odd day-of-year
  weekly         — Monday only (week recap framing)
  weekends       — Saturday & Sunday only
"""

import html
import os
import re
import time
from datetime import date

import resend
import sentry_sdk
from loguru import logger

from supabase_client import supabase

MAX_RETRIES    = 3
RETRY_DELAYS   = [2, 5, 12]

resend.api_key   = os.environ.get("RESEND_API_KEY", "") or os.environ.get("RESEND_API_KEY_", "")
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
            .select("email, user_id, tier, newsletter_frequency")
            .eq("unsubscribed", False)
            .execute()
        )
        return result.data or []
    except Exception as e:
        logger.error("newsletter_emailer: subscriber fetch failed — {}", e)
        sentry_sdk.capture_exception(e)
        return []


def _should_send_today(frequency: str) -> bool:
    """Check if a subscriber's frequency matches today's date."""
    today = date.today()
    dow = today.weekday()  # 0=Mon … 6=Sun

    if frequency == "daily":
        return True
    if frequency == "weekdays":
        return dow < 5
    if frequency == "weekends":
        return dow >= 5
    if frequency == "weekly":
        return dow == 0  # Monday
    if frequency == "every_other_day":
        return today.timetuple().tm_yday % 2 == 1
    return True  # unknown frequency → send


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
#
# Outlook desktop renders HTML email with Microsoft Word's engine, not a real
# browser — it ignores `max-width` on <div>s (breaks centering), is
# inconsistent about `background` on <div>/<p> (breaks card backgrounds), and
# has no flexbox support. Every "card" below is built as a <table
# bgcolor="..."> instead of a styled <div>, since Outlook honors table
# background/padding reliably. `border-radius` is allowed to degrade to
# square corners in Outlook — cosmetic only, not a layout break.

MONO = "'SF Mono','Menlo','Consolas',monospace"

# Alternating story block colors inspired by the editorial design template.
_BLOCK_COLORS = ["#ade36b", "#ebee85"]


def _md_to_html(text: str) -> str:
    """Convert markdown links and bold to styled HTML for email."""
    safe = html.escape(text)
    safe = re.sub(
        r'\[(.+?)\]\((.+?)\)',
        lambda m: f'<a href="{m.group(2)}" style="color:#1a7a34;text-decoration:underline;font-weight:600;">{m.group(1)}</a>',
        safe,
    )
    safe = re.sub(
        r'\*\*(.+?)\*\*',
        r'<strong style="color:#000;font-weight:700;">\1</strong>',
        safe,
    )
    return safe


_CATEGORY_LABELS: dict[str, str] = {
    "crypto": "CRYPTO CORNER",
    "markets": "MARKET WATCH",
    "bitcoin": "BTC WATCH",
    "defi": "DEFI",
    "ai": "AI WATCH",
    "macro": "MACRO",
    "geopolitics": "WORLD",
    "politics": "POLITICS",
    "prediction": "PREDICTION MARKETS",
    "science": "SCIENCE",
    "health": "HEALTH",
    "sports": "SPORTS",
    "technology": "TECH",
}


def _story_html(story: dict, index: int) -> str:
    category      = story.get("category", "")
    cat_label     = _CATEGORY_LABELS.get(category.lower(), category.upper()) if category else ""
    headline      = html.escape(story.get("headline", ""))
    what_happened = _md_to_html(story.get("what_happened", ""))
    what_we_know  = _md_to_html(story.get("what_we_know", ""))
    could_mean    = _md_to_html(story.get("could_mean", ""))
    watch         = _md_to_html(story.get("watch", ""))
    bg_color      = _BLOCK_COLORS[index % 2]

    return f"""
    <tr><td style="text-align:left;vertical-align:top;background-color:{bg_color};">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr><td style="padding:32px 40px;" bgcolor="{bg_color}">
          <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;font-weight:800;color:#1a1a1a;text-transform:uppercase;letter-spacing:0.15em;margin-bottom:10px;">{cat_label}</div>
          <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:22px;font-weight:800;color:#000000;margin-bottom:18px;line-height:1.3;">{headline}</div>
          <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.65;margin-bottom:14px;">{what_happened}</div>
          <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;color:#333;line-height:1.65;margin-bottom:14px;">{what_we_know}</div>
          <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;color:#333;line-height:1.65;margin-bottom:14px;">{could_mean}</div>
          <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;font-weight:700;color:#1a7a34;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">What to watch</div>
          <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.65;">{watch}</div>
        </td></tr>
      </table>
    </td></tr>"""


def _confidence_bar_color(confidence: int) -> str:
    if confidence >= 75:
        return "#1a7a34"
    if confidence >= 50:
        return "#b45309"
    return "#71717a"


def _resolve_prediction_titles(signals: list[dict]) -> dict[str, str]:
    ids = list({s["identifier"] for s in signals if s.get("asset_type") == "prediction" and s.get("identifier")})
    if not ids:
        return {}
    try:
        rows = (
            supabase.table("raw_prices")
            .select("identifier, metadata")
            .eq("asset_type", "prediction")
            .in_("identifier", ids)
            .execute()
        )
        titles: dict[str, str] = {}
        for row in rows.data or []:
            title = (row.get("metadata") or {}).get("title")
            if title and row["identifier"] not in titles:
                titles[row["identifier"]] = title
        return titles
    except Exception as e:
        logger.warning("newsletter_emailer: prediction title lookup failed — {}", e)
        return {}


def _signals_html(signals: list[dict], prediction_titles: dict[str, str] | None = None) -> str:
    if not signals:
        return ""
    prediction_titles = prediction_titles or {}
    rows = ""
    for s in signals:
        direction  = html.escape(s.get("direction", ""))
        identifier = s.get("identifier", "")
        asset_type = html.escape(s.get("asset_type", "stock"))
        confidence = s.get("confidence", 0)
        horizon    = html.escape(s.get("time_horizon", ""))
        dir_color  = "#1a7a34" if direction in ("BUY", "YES") else "#dc2626"
        bar_color  = _confidence_bar_color(confidence)
        asset_url  = f"{APP_URL}/dashboard/asset/{asset_type}/{identifier}"
        display_name = prediction_titles.get(identifier, identifier) if s.get("asset_type") == "prediction" else identifier
        display_name = html.escape(display_name)
        rows += f"""
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #e5e5e5;">
            <a href="{asset_url}" style="font-family:{MONO};font-weight:700;color:#000;text-decoration:none;font-size:14px;">{display_name}</a>
            &nbsp;
            <span style="background:{dir_color}18;color:{dir_color};border:1px solid {dir_color}44;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:700;">{direction}</span>
          </td>
          <td style="padding:10px 14px;border-bottom:1px solid #e5e5e5;text-align:right;">
            <span style="font-family:{MONO};font-weight:700;color:{bar_color};font-size:14px;">{confidence}%</span>
            <span style="color:#71717a;font-size:11px;text-transform:uppercase;">&nbsp;{horizon}</span>
          </td>
        </tr>"""

    return f"""
    <tr><td style="text-align:left;vertical-align:top;background-color:#fdfdf3;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr><td style="padding:28px 40px;" bgcolor="#fdfdf3">
          <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;font-weight:800;color:#1a1a1a;text-transform:uppercase;letter-spacing:0.15em;margin-bottom:12px;">Your Signals Today</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff"
                 style="background-color:#ffffff;border:1px solid #e5e5e5;border-radius:8px;border-collapse:collapse;">{rows}</table>
          <div style="margin-top:14px;">
            <a href="{APP_URL}/dashboard" style="display:inline-block;background:#1a1a1a;color:#fff;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-weight:700;font-size:13px;padding:10px 22px;border-radius:6px;text-decoration:none;">View Full Signal Feed &rarr;</a>
          </div>
        </td></tr>
      </table>
    </td></tr>"""


def _options_html(options: list[dict]) -> str:
    if not options:
        return ""
    rows = ""
    for o in options:
        ticker      = html.escape(o.get("ticker", ""))
        option_type = html.escape(o.get("option_type", "").upper())
        volume      = o.get("volume", 0)
        oi          = o.get("open_interest", 0)
        color       = "#1a7a34" if option_type == "CALL" else "#dc2626"
        rows += f"""
        <tr>
          <td style="padding:8px 14px;border-bottom:1px solid #e5e5e5;font-family:{MONO};font-weight:700;color:#000;font-size:13px;">{ticker}</td>
          <td style="padding:8px 14px;border-bottom:1px solid #e5e5e5;color:{color};font-size:12px;font-weight:700;text-align:center;">{option_type}</td>
          <td style="padding:8px 14px;border-bottom:1px solid #e5e5e5;color:#71717a;font-size:12px;text-align:right;">vol {volume:,} / OI {oi:,}</td>
        </tr>"""

    return f"""
    <tr><td style="text-align:left;vertical-align:top;background-color:#fdfdf3;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr><td style="padding:0 40px 28px;" bgcolor="#fdfdf3">
          <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;font-weight:800;color:#1a1a1a;text-transform:uppercase;letter-spacing:0.15em;margin-bottom:12px;">Unusual Options Flow</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff"
                 style="background-color:#ffffff;border:1px solid #e5e5e5;border-radius:8px;border-collapse:collapse;">{rows}</table>
        </td></tr>
      </table>
    </td></tr>"""


_FREQUENCY_LABELS: dict[str, str] = {
    "weekly":   "Weekly recap",
    "weekends": "Weekend edition",
}


def _render_html(briefing: dict, tier: str, user_id: str | None, prediction_titles: dict[str, str] | None = None, frequency: str = "daily") -> str:
    content      = briefing.get("content_json") or {}
    subject_line = html.escape(briefing.get("headline", ""))
    opening      = _md_to_html(content.get("opening_line", ""))
    closing      = _md_to_html(content.get("closing_line", ""))
    stories      = content.get("stories", [])
    quick_hits   = content.get("quick_hits")
    today_str    = date.today().strftime("%A, %B %-d, %Y")
    today_short  = date.today().strftime("%B %-d").upper()
    is_paid      = tier in ("pro", "elite")

    freq_label = _FREQUENCY_LABELS.get(frequency)
    if freq_label:
        opening = _md_to_html(f"Here's what happened since your last briefing. {content.get('opening_line', '')}")

    stories_rows = "".join(_story_html(s, i) for i, s in enumerate(stories))

    quick_hits_row = ""
    if quick_hits:
        quick_hits_row = f"""
    <tr><td style="text-align:left;vertical-align:top;background-color:#fdfdf3;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr><td style="padding:20px 40px;" bgcolor="#fdfdf3">
          <div style="border-left:3px solid #ade36b;padding-left:14px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#555;font-size:13px;line-height:1.65;font-style:italic;">
            {_md_to_html(quick_hits)}
          </div>
        </td></tr>
      </table>
    </td></tr>"""

    paid_rows = ""
    if is_paid:
        top_signals = _get_user_signals(user_id or "", content.get("top_signals", []))
        options     = content.get("options_flow", [])
        paid_rows   = _signals_html(top_signals, prediction_titles) + _options_html(options)

    free_cta_row = ""
    if not is_paid:
        free_cta_row = f"""
    <tr><td style="text-align:center;vertical-align:top;background-color:#fdfdf3;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr><td style="padding:28px 40px;" bgcolor="#fdfdf3">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#1a1a1a"
                 style="background-color:#1a1a1a;border-radius:10px;">
            <tr><td style="padding:28px;text-align:center;">
              <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#fff;font-weight:700;font-size:16px;margin-bottom:8px;">Want the full signal feed?</div>
              <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#999;font-size:14px;margin-bottom:18px;line-height:1.5;">Real-time AI signals, portfolio tracking, and prediction markets. Start your free trial.</div>
              <a href="{APP_URL}/signup" style="display:inline-block;background:#ade36b;color:#000;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-weight:700;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none;">Try Plebs Free &rarr;</a>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </td></tr>"""

    headline_label = "DAILY BRIEF"
    if freq_label:
        headline_label = freq_label.upper()

    return f"""<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="format-detection" content="telephone=no,date=no,address=no,email=no" />
<title>Plebs Daily Brief</title>
<!--[if gte mso 9]><xml>
<o:OfficeDocumentSettings>
<o:AllowPNG/>
<o:PixelsPerInch>96</o:PixelsPerInch>
</o:OfficeDocumentSettings>
</xml><![endif]-->
<style type="text/css">
body,table,td,p,a,li,blockquote{{-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;}}
body{{margin:0;padding:0;background-color:#ffffff;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:16px;color:#1a1a1a;}}
table,td{{border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;}}
img{{border:0;height:auto;line-height:100%;outline:none;text-decoration:none;display:block;max-width:100%;}}
a{{color:inherit;text-decoration:none;}}
p{{margin:0;padding:0;}}
</style>
</head>
<body style="margin:0;padding:0;background-color:#ffffff;word-spacing:normal;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;width:100%;margin:0;padding:0;border-collapse:collapse;">
<tbody><tr><td align="center">
<!--[if mso]><table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" width="600"><tr><td><![endif]-->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;margin:0 auto;table-layout:fixed;border-collapse:collapse;">
<tbody>

<!-- Logo header -->
<tr><td style="text-align:center;vertical-align:top;padding:40px 40px 30px;background-color:#ffffff;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
    <tr><td align="center">
      <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:28px;font-weight:800;color:#1a1a1a;letter-spacing:-0.02em;">
        plebs<span style="color:#1a7a34;">.finance</span>
      </div>
    </td></tr>
  </table>
</td></tr>

<!-- Hero banner -->
<tr><td style="text-align:center;vertical-align:top;background-color:#ade36b;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
    <tr><td style="padding:36px 40px;" bgcolor="#ade36b">
      <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;font-weight:800;color:#1a1a1a;text-transform:uppercase;letter-spacing:0.2em;margin-bottom:10px;">{headline_label}</div>
      <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;color:#333;margin-bottom:16px;">Markets Don't Sleep. Neither Do We.</div>
      <div style="width:40px;height:3px;background-color:#1a1a1a;margin:0 auto 16px;"></div>
      <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;color:#333;line-height:1.5;">Your daily crypto signal digest. Data first, spin never.</div>
      <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;color:#555;margin-top:8px;">{today_str}</div>
      <div style="margin-top:18px;">
        <a href="{APP_URL}/dashboard" style="display:inline-block;background:#1a1a1a;color:#fff;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-weight:700;font-size:13px;padding:10px 24px;border-radius:6px;text-decoration:none;">Read Full Brief</a>
      </div>
    </td></tr>
  </table>
</td></tr>

<!-- Opening / intro -->
<tr><td style="text-align:left;vertical-align:top;padding:32px 40px;background-color:#fdfdf3;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
    <tr><td>
      <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;line-height:1.65;color:#1a1a1a;">{opening}</div>
    </td></tr>
  </table>
</td></tr>

<!-- Stories -->
{stories_rows}

{quick_hits_row}

<!-- Paid content (signals, options) -->
{paid_rows}

<!-- Free CTA -->
{free_cta_row}

<!-- Closing -->
<tr><td style="text-align:left;vertical-align:top;background-color:#fdfdf3;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
    <tr><td style="padding:28px 40px;" bgcolor="#fdfdf3">
      <div style="border-left:3px solid #ade36b;padding-left:14px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#555;font-size:15px;line-height:1.65;">{closing}</div>
      <div style="margin-top:20px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:16px;font-weight:600;color:#1a1a1a;">Stay sharp,</div>
      <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:16px;font-weight:800;color:#1a7a34;margin-top:2px;">Plebs</div>
    </td></tr>
  </table>
</td></tr>

<!-- Footer -->
<tr><td style="text-align:center;vertical-align:top;padding:40px 40px;background-color:#fdfdf3;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
    <tr><td style="padding-top:20px;border-top:1px solid #e5e5e5;">
      <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;color:#999;line-height:1.5;">
        Plebs Finance &middot; Not financial advice
      </div>
      <div style="margin-top:8px;">
        <a href="{APP_URL}/unsubscribe" style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;color:#999;text-decoration:underline;">Unsubscribe</a>
        &nbsp;&middot;&nbsp;
        <a href="{APP_URL}/dashboard/settings" style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;color:#999;text-decoration:underline;">Manage Preferences</a>
      </div>
    </td></tr>
  </table>
</td></tr>

</tbody>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</tbody>
</table>
</body>
</html>"""


def _md_to_text(text: str) -> str:
    """Strip markdown to plain text — links become 'text (url)', bold becomes plain."""
    result = re.sub(r'\[(.+?)\]\((.+?)\)', r'\1 (\2)', text)
    result = re.sub(r'\*\*(.+?)\*\*', r'\1', result)
    return result


def _render_text(briefing: dict) -> str:
    content  = briefing.get("content_json") or {}
    today    = date.today().strftime("%A, %B %-d")
    stories  = content.get("stories", [])

    lines = [
        f"PLEBS.FINANCE — {today}",
        briefing.get("headline", ""),
        "",
        _md_to_text(content.get("opening_line", "")),
        "",
    ]
    for s in stories:
        category = s.get("category", "").upper()
        lines += [
            f"[{category}] {s.get('headline', '').upper()}" if category else s.get("headline", "").upper(),
            f"What happened: {_md_to_text(s.get('what_happened', ''))}",
            f"What we know: {_md_to_text(s.get('what_we_know', ''))}",
            f"What it could mean: {_md_to_text(s.get('could_mean', ''))}",
            f"What to watch: {_md_to_text(s.get('watch', ''))}",
            "",
        ]
    quick_hits = content.get("quick_hits")
    if quick_hits:
        lines += [_md_to_text(quick_hits), ""]
    lines += [
        _md_to_text(content.get("closing_line", "")),
        "",
        f"Full platform: {APP_URL}",
        f"Not financial advice. Unsubscribe: {APP_URL}/unsubscribe",
    ]
    return "\n".join(lines)


# ─── Main sender ──────────────────────────────────────────────────────────────

def _send_with_retry(payload: dict) -> bool:
    for attempt in range(MAX_RETRIES):
        try:
            resend.Emails.send(payload)
            return True
        except Exception as e:
            if attempt < MAX_RETRIES - 1:
                delay = RETRY_DELAYS[attempt]
                logger.warning(
                    "newsletter_emailer: attempt {}/{} failed for {}, retrying in {}s: {}",
                    attempt + 1, MAX_RETRIES, payload["to"], delay, e,
                )
                time.sleep(delay)
            else:
                raise
    return False


def _already_sent_today() -> set[str]:
    today = date.today().isoformat()
    try:
        result = (
            supabase.table("newsletter_sends")
            .select("email")
            .eq("send_date", today)
            .execute()
        )
        return {r["email"] for r in (result.data or [])}
    except Exception:
        return set()


def _record_send(email: str) -> None:
    today = date.today().isoformat()
    try:
        supabase.table("newsletter_sends").upsert(
            {"email": email, "send_date": today},
            on_conflict="email,send_date",
        ).execute()
    except Exception as e:
        logger.warning("newsletter_emailer: failed to record send for {}: {}", email, e)


def _subject_for_frequency(base_subject: str, frequency: str) -> str:
    if frequency == "weekly":
        return f"This week on Plebs — {date.today().strftime('%b %-d')}"
    if frequency == "weekends":
        return f"Weekend briefing — {date.today().strftime('%b %-d')}"
    return base_subject


def send_newsletter() -> str:
    briefing = _get_todays_newsletter()
    if not briefing:
        logger.warning("newsletter_emailer: no briefing found for today, skipping")
        sentry_sdk.capture_message("Newsletter send skipped: no briefing found for today")
        return "no briefing found"

    subscribers = _get_subscribers()
    if not subscribers:
        logger.info("newsletter_emailer: no subscribers")
        return "0 sent"

    already_sent = _already_sent_today()
    base_subject = briefing.get("headline", f"Plebs — {date.today().strftime('%b %-d')}")
    text_body = _render_text(briefing)
    prediction_titles = _resolve_prediction_titles((briefing.get("content_json") or {}).get("top_signals", []))
    sent, skipped, freq_skipped, failed = 0, 0, 0, 0
    failed_emails: list[str] = []
    last_error: str = ""

    for sub in subscribers:
        email   = sub.get("email")
        tier    = sub.get("tier", "free")
        user_id = sub.get("user_id")
        frequency = sub.get("newsletter_frequency", "daily")

        if not email:
            continue

        if email in already_sent:
            skipped += 1
            continue

        if not _should_send_today(frequency):
            freq_skipped += 1
            continue

        try:
            subject = _subject_for_frequency(base_subject, frequency)
            html_body = _render_html(briefing, tier, user_id, prediction_titles, frequency)
            _send_with_retry({
                "from":    FROM_ADDRESS,
                "to":      [email],
                "subject": subject,
                "html":    html_body,
                "text":    text_body,
            })
            _record_send(email)
            sent += 1
        except Exception as e:
            last_error = f"{type(e).__name__}: {e}"
            logger.error("newsletter_emailer: all {} retries exhausted for {}: {}", MAX_RETRIES, email, last_error)
            sentry_sdk.capture_exception(e)
            failed += 1
            failed_emails.append(email)

    if failed > 0:
        sentry_sdk.capture_message(
            f"Newsletter send partially failed: {failed} of {sent + failed} emails failed. "
            f"Failed addresses: {', '.join(failed_emails)}"
        )

    summary = f"{sent} sent, {skipped} already sent, {freq_skipped} frequency skipped, {failed} failed"
    if last_error:
        summary += f" | last_error: {last_error}"
    logger.info("newsletter_emailer complete: {}", summary)
    return summary
