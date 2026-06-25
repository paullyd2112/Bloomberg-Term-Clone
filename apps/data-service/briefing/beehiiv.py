"""
Beehiiv publisher — pushes the daily newsletter to Beehiiv as a post.
Beehiiv handles sending to all newsletter subscribers with their
analytics, open tracking, and click tracking.
"""

import html
import os
import re
from datetime import date

import httpx
from loguru import logger

API_KEY        = os.environ.get("BEEHIIV_API_KEY", "")
PUBLICATION_ID = os.environ.get("BEEHIIV_PUBLICATION_ID", "")
BASE_URL       = "https://api.beehiiv.com/v2"
APP_URL        = os.environ.get("NEXT_PUBLIC_APP_URL", "https://plebs.finance")


def _md_to_html(text: str) -> str:
    safe = html.escape(text)
    safe = re.sub(
        r'\[(.+?)\]\((.+?)\)',
        lambda m: f'<a href="{m.group(2)}" style="color:#22c55e;text-decoration:underline;">{m.group(1)}</a>',
        safe,
    )
    safe = re.sub(
        r'\*\*(.+?)\*\*',
        r'<strong style="color:#fff;font-weight:700;">\1</strong>',
        safe,
    )
    return safe


def _render_beehiiv_html(briefing: dict) -> str:
    content = briefing.get("content_json") or {}
    opening = _md_to_html(content.get("opening_line", ""))
    closing = _md_to_html(content.get("closing_line", ""))
    stories = content.get("stories", [])
    today   = date.today().strftime("%A, %B %-d")

    stories_html = ""
    for story in stories:
        category      = html.escape(story.get("category", ""))
        headline      = html.escape(story.get("headline", ""))
        what_happened = _md_to_html(story.get("what_happened", ""))
        what_we_know  = _md_to_html(story.get("what_we_know", ""))
        could_mean    = _md_to_html(story.get("could_mean", ""))
        watch         = _md_to_html(story.get("watch", ""))

        stories_html += f"""
        <div style="margin-bottom:32px;">
          <div style="margin-bottom:8px;">
            <span style="display:inline-block;background:#22c55e22;color:#22c55e;border:1px solid #22c55e55;border-radius:4px;padding:2px 8px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;">{category}</span>
          </div>
          <div style="font-size:18px;font-weight:700;color:#fff;margin-bottom:14px;line-height:1.3;">{headline}</div>
          <div style="margin-bottom:10px;">
            <span style="font-size:10px;font-weight:700;color:#52525b;text-transform:uppercase;letter-spacing:.08em;">What happened</span>
            <div style="color:#d4d4d8;font-size:14px;line-height:1.7;margin-top:4px;">{what_happened}</div>
          </div>
          <div style="margin-bottom:10px;">
            <span style="font-size:10px;font-weight:700;color:#52525b;text-transform:uppercase;letter-spacing:.08em;">What we know</span>
            <div style="color:#d4d4d8;font-size:14px;line-height:1.7;margin-top:4px;">{what_we_know}</div>
          </div>
          <div style="margin-bottom:10px;">
            <span style="font-size:10px;font-weight:700;color:#52525b;text-transform:uppercase;letter-spacing:.08em;">What it could mean</span>
            <div style="color:#d4d4d8;font-size:14px;line-height:1.7;margin-top:4px;">{could_mean}</div>
          </div>
          <div>
            <span style="font-size:10px;font-weight:700;color:#22c55e;text-transform:uppercase;letter-spacing:.08em;">What to watch</span>
            <div style="color:#d4d4d8;font-size:14px;line-height:1.7;margin-top:4px;">{watch}</div>
          </div>
        </div>"""

    cta = f"""
    <div style="margin:28px 0;padding:20px;background:#18181b;border:1px solid #27272a;border-radius:10px;text-align:center;">
      <div style="color:#fff;font-weight:700;font-size:15px;margin-bottom:6px;">Want AI-powered signals on every asset?</div>
      <div style="color:#71717a;font-size:13px;margin-bottom:16px;">Real-time signals, options flow, congressional trades — 14-day free trial.</div>
      <a href="{APP_URL}/signup" style="display:inline-block;background:#22c55e;color:#000;font-weight:700;font-size:13px;padding:10px 22px;border-radius:8px;text-decoration:none;">Try Plebs free →</a>
    </div>"""

    return f"""
    <div style="font-size:11px;color:#52525b;margin-bottom:16px;">{today}</div>
    <p style="color:#a1a1aa;font-size:15px;line-height:1.6;margin:0 0 28px;border-left:3px solid #27272a;padding-left:12px;">{opening}</p>
    <div style="border-top:1px solid #27272a;padding-top:24px;">
      {stories_html}
    </div>
    {cta}
    <p style="color:#71717a;font-size:14px;line-height:1.6;margin:24px 0;font-style:italic;">{closing}</p>
    <div style="border-top:1px solid #27272a;padding-top:16px;text-align:center;font-size:11px;color:#3f3f46;">
      Plebs.finance · Not financial advice
    </div>"""


def publish_to_beehiiv(briefing: dict) -> str:
    """Push today's newsletter to Beehiiv as a published post.

    Returns a status string for logging.
    """
    if not API_KEY or not PUBLICATION_ID:
        logger.warning("beehiiv: skipped — BEEHIIV_API_KEY or BEEHIIV_PUBLICATION_ID not set")
        return "skipped (not configured)"

    subject = briefing.get("headline", f"Plebs — {date.today().strftime('%b %-d')}")
    body_html = _render_beehiiv_html(briefing)

    try:
        resp = httpx.post(
            f"{BASE_URL}/publications/{PUBLICATION_ID}/posts",
            headers={
                "Authorization": f"Bearer {API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "title":           subject,
                "subtitle":        briefing.get("content_json", {}).get("opening_line", ""),
                "content":         [{"type": "html", "html": body_html}],
                "status":          "confirmed",
                "send_to":         "all",
            },
            timeout=30,
        )

        if resp.status_code in (200, 201):
            post_id = resp.json().get("data", {}).get("id", "unknown")
            logger.info("beehiiv: published post {} — subject: {}", post_id, subject)
            return f"published ({post_id})"
        else:
            logger.error("beehiiv: publish failed [{}]: {}", resp.status_code, resp.text[:500])
            return f"failed ({resp.status_code})"

    except Exception as e:
        logger.error("beehiiv: publish error — {}", e)
        return f"error ({e})"
