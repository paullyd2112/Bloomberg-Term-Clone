"""
Welcome email sequence — 4 emails sent over the 7-day trial.
  Day 0 (immediate): Welcome + getting started
  Day 2: Feature spotlight — signals & options flow
  Day 4: Feature spotlight — congressional trades & briefing
  Day 6: Trial ending soon — convert to paid
"""

import os
from datetime import date, timedelta

import resend
import sentry_sdk
from loguru import logger

from supabase_client import supabase

resend.api_key = os.environ.get("RESEND_API_KEY", "") or os.environ.get("RESEND_API_KEY_", "")

FROM_ADDRESS = "Paul at Plebs <paul@plebs.finance>"
APP_URL      = os.environ.get("NEXT_PUBLIC_APP_URL", "https://plebs.finance")


# ─── Email templates ──────────────────────────────────────────────────────────

def _email_day0(name: str) -> tuple[str, str, str]:
    subject = "Welcome to Plebs — here's where to start"
    html = f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="font-size:22px;font-weight:800;color:#fff;margin-bottom:24px;">
      plebs<span style="color:#22c55e;">.finance</span>
    </div>
    <h1 style="color:#fff;font-size:22px;font-weight:700;margin:0 0 12px;">
      Welcome{f", {name}" if name else ""} — your 7-day trial is live.
    </h1>
    <p style="color:#a1a1aa;font-size:15px;line-height:1.6;margin:0 0 24px;">
      You now have full access to everything Plebs offers. Here's where to start:
    </p>
    <div style="background:#18181b;border:1px solid #27272a;border-radius:10px;padding:20px;margin-bottom:20px;">
      <div style="font-size:12px;font-weight:700;color:#52525b;text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px;">Start here</div>
      <div style="margin-bottom:12px;">
        <a href="{APP_URL}/dashboard" style="color:#22c55e;font-weight:600;text-decoration:none;">→ Open your dashboard</a>
        <div style="color:#71717a;font-size:13px;margin-top:2px;">Check the live signal feed — stocks, crypto, and prediction markets.</div>
      </div>
      <div style="margin-bottom:12px;">
        <a href="{APP_URL}/dashboard" style="color:#22c55e;font-weight:600;text-decoration:none;">→ Add tickers to your watchlist</a>
        <div style="color:#71717a;font-size:13px;margin-top:2px;">Set up alerts so you never miss a signal on assets you follow.</div>
      </div>
      <div>
        <a href="{APP_URL}/dashboard/congress" style="color:#22c55e;font-weight:600;text-decoration:none;">→ Check congressional trades</a>
        <div style="color:#71717a;font-size:13px;margin-top:2px;">See what House and Senate members are buying and selling.</div>
      </div>
    </div>
    <p style="color:#71717a;font-size:13px;line-height:1.6;margin:0 0 24px;">
      Your morning briefing starts arriving at 7am ET on weekdays — it covers top signals, macro context, and what to watch for the day.
    </p>
    <a href="{APP_URL}/dashboard" style="display:inline-block;background:#22c55e;color:#000;font-weight:700;font-size:14px;padding:12px 24px;border-radius:8px;text-decoration:none;">
      Open dashboard →
    </a>
    <div style="margin-top:32px;padding-top:20px;border-top:1px solid #27272a;font-size:11px;color:#3f3f46;text-align:center;">
      Plebs.finance · Not financial advice · <a href="{APP_URL}/unsubscribe" style="color:#52525b;">Unsubscribe</a>
    </div>
  </div>
</body>
</html>"""
    text = f"""Welcome{f", {name}" if name else ""} — your 7-day trial is live.

Start here:
→ Open your dashboard: {APP_URL}/dashboard
→ Add tickers to your watchlist and set alerts
→ Check congressional trades: {APP_URL}/dashboard/congress

Your morning briefing starts arriving at 7am ET on weekdays.

Not financial advice. Unsubscribe: {APP_URL}/unsubscribe"""
    return subject, html, text


def _email_day2(name: str) -> tuple[str, str, str]:
    subject = "The two features most traders miss on Plebs"
    html = f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="font-size:22px;font-weight:800;color:#fff;margin-bottom:24px;">
      plebs<span style="color:#22c55e;">.finance</span>
    </div>
    <h1 style="color:#fff;font-size:20px;font-weight:700;margin:0 0 12px;">
      Two features worth checking out
    </h1>
    <p style="color:#a1a1aa;font-size:15px;line-height:1.6;margin:0 0 24px;">
      Day 2 of your trial. Most users find these two the most valuable:
    </p>
    <div style="background:#18181b;border:1px solid #27272a;border-radius:10px;padding:20px;margin-bottom:16px;">
      <div style="font-size:16px;font-weight:700;color:#fff;margin-bottom:6px;">⚡ Signal accuracy per asset</div>
      <div style="color:#a1a1aa;font-size:14px;line-height:1.6;margin-bottom:12px;">
        Every signal we generate gets tracked against the actual outcome. You can see win rates per ticker — so you know which signals actually make money over time.
      </div>
      <a href="{APP_URL}/dashboard" style="color:#22c55e;font-size:13px;font-weight:600;text-decoration:none;">View signal feed →</a>
    </div>
    <div style="background:#18181b;border:1px solid #27272a;border-radius:10px;padding:20px;margin-bottom:24px;">
      <div style="font-size:16px;font-weight:700;color:#fff;margin-bottom:6px;">🌊 Options flow</div>
      <div style="color:#a1a1aa;font-size:14px;line-height:1.6;margin-bottom:12px;">
        Unusual call and put sweeps flagged in real time. When institutions make big options bets, it shows up here before it shows up in the price.
      </div>
      <a href="{APP_URL}/dashboard/asset/stock/SPY" style="color:#22c55e;font-size:13px;font-weight:600;text-decoration:none;">Check options flow →</a>
    </div>
    <a href="{APP_URL}/dashboard" style="display:inline-block;background:#22c55e;color:#000;font-weight:700;font-size:14px;padding:12px 24px;border-radius:8px;text-decoration:none;">
      Open dashboard →
    </a>
    <div style="margin-top:32px;padding-top:20px;border-top:1px solid #27272a;font-size:11px;color:#3f3f46;text-align:center;">
      Plebs.finance · Not financial advice · <a href="{APP_URL}/unsubscribe" style="color:#52525b;">Unsubscribe</a>
    </div>
  </div>
</body>
</html>"""
    text = f"""Two features worth checking out — Day 2 of your trial.

Signal accuracy per asset:
Every signal gets tracked against actual outcomes. See win rates per ticker.
{APP_URL}/dashboard

Options flow:
Unusual call/put sweeps flagged in real time.
{APP_URL}/dashboard

Not financial advice. Unsubscribe: {APP_URL}/unsubscribe"""
    return subject, html, text


def _email_day4(name: str) -> tuple[str, str, str]:
    subject = "Congressional trades + your morning briefing"
    html = f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="font-size:22px;font-weight:800;color:#fff;margin-bottom:24px;">
      plebs<span style="color:#22c55e;">.finance</span>
    </div>
    <h1 style="color:#fff;font-size:20px;font-weight:700;margin:0 0 12px;">
      Two more things you should be using
    </h1>
    <div style="background:#18181b;border:1px solid #27272a;border-radius:10px;padding:20px;margin-bottom:16px;">
      <div style="font-size:16px;font-weight:700;color:#fff;margin-bottom:6px;">🏛 Congressional trade tracker</div>
      <div style="color:#a1a1aa;font-size:14px;line-height:1.6;margin-bottom:12px;">
        Every House and Senate STOCK Act disclosure in one feed. Politicians legally have to report trades within 45 days — you can see exactly what they're buying.
      </div>
      <a href="{APP_URL}/dashboard/congress" style="color:#22c55e;font-size:13px;font-weight:600;text-decoration:none;">View congressional trades →</a>
    </div>
    <div style="background:#18181b;border:1px solid #27272a;border-radius:10px;padding:20px;margin-bottom:24px;">
      <div style="font-size:16px;font-weight:700;color:#fff;margin-bottom:6px;">☀️ Morning briefing</div>
      <div style="color:#a1a1aa;font-size:14px;line-height:1.6;margin-bottom:12px;">
        Hits your inbox at 7am ET every weekday. Top signals, macro context, what to watch, and a risk note — written by AI, reviewed for accuracy. Five minutes and you're caught up.
      </div>
      <a href="{APP_URL}/dashboard/briefing" style="color:#22c55e;font-size:13px;font-weight:600;text-decoration:none;">Read today's briefing →</a>
    </div>
    <a href="{APP_URL}/dashboard" style="display:inline-block;background:#22c55e;color:#000;font-weight:700;font-size:14px;padding:12px 24px;border-radius:8px;text-decoration:none;">
      Open dashboard →
    </a>
    <div style="margin-top:32px;padding-top:20px;border-top:1px solid #27272a;font-size:11px;color:#3f3f46;text-align:center;">
      Plebs.finance · Not financial advice · <a href="{APP_URL}/unsubscribe" style="color:#52525b;">Unsubscribe</a>
    </div>
  </div>
</body>
</html>"""
    text = f"""Congressional trades + your morning briefing — Day 4.

Congressional trade tracker:
Every STOCK Act disclosure in one feed.
{APP_URL}/dashboard/congress

Morning briefing:
Hits your inbox at 7am ET weekdays. Top signals, macro context, risk note.
{APP_URL}/dashboard/briefing

Not financial advice. Unsubscribe: {APP_URL}/unsubscribe"""
    return subject, html, text


def _email_day6(name: str, tier: str) -> tuple[str, str, str]:
    subject = "Your trial ends tomorrow — here's what happens next"
    is_pro   = tier in ("pro", "elite")
    html = f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="font-size:22px;font-weight:800;color:#fff;margin-bottom:24px;">
      plebs<span style="color:#22c55e;">.finance</span>
    </div>
    <h1 style="color:#fff;font-size:20px;font-weight:700;margin:0 0 12px;">
      Your trial ends tomorrow
    </h1>
    <p style="color:#a1a1aa;font-size:15px;line-height:1.6;margin:0 0 24px;">
      {"You're already subscribed — nothing changes for you." if is_pro else "After tomorrow, you'll lose access to signals, options flow, congressional trades, and your morning briefing."}
    </p>
    {"" if is_pro else f'''
    <div style="background:#18181b;border:1px solid #27272a;border-radius:10px;padding:20px;margin-bottom:24px;">
      <div style="font-size:14px;font-weight:700;color:#fff;margin-bottom:12px;">Keep your access</div>
      <div style="margin-bottom:10px;display:flex;align-items:center;gap:12px;">
        <div style="flex:1;">
          <div style="color:#fff;font-weight:600;font-size:15px;">Pro</div>
          <div style="color:#71717a;font-size:13px;">Signals, options flow, briefing, congressional trades</div>
        </div>
        <div style="color:#22c55e;font-weight:800;font-size:18px;">$79<span style="font-size:12px;font-weight:400;color:#52525b;">/mo</span></div>
      </div>
      <div style="margin-bottom:16px;display:flex;align-items:center;gap:12px;">
        <div style="flex:1;">
          <div style="color:#fff;font-weight:600;font-size:15px;">Lifetime Pro</div>
          <div style="color:#71717a;font-size:13px;">Pay once, access forever</div>
        </div>
        <div style="color:#22c55e;font-weight:800;font-size:18px;">$399<span style="font-size:12px;font-weight:400;color:#52525b;"> once</span></div>
      </div>
      <a href="{APP_URL}/dashboard/upgrade" style="display:block;text-align:center;background:#22c55e;color:#000;font-weight:700;font-size:14px;padding:12px;border-radius:8px;text-decoration:none;">
        Upgrade now →
      </a>
    </div>
    '''}
    <p style="color:#52525b;font-size:12px;line-height:1.6;margin:0;">
      Questions? Reply to this email or reach us at support@plebs.finance.
    </p>
    <div style="margin-top:32px;padding-top:20px;border-top:1px solid #27272a;font-size:11px;color:#3f3f46;text-align:center;">
      Plebs.finance · Not financial advice · <a href="{APP_URL}/unsubscribe" style="color:#52525b;">Unsubscribe</a>
    </div>
  </div>
</body>
</html>"""
    text = f"""Your trial ends tomorrow.

{"You're already subscribed — nothing changes." if is_pro else f"Upgrade to keep access: {APP_URL}/dashboard/upgrade"}

Pro: $79/mo
Lifetime Pro: $399 once

Questions? support@plebs.finance

Not financial advice. Unsubscribe: {APP_URL}/unsubscribe"""
    return subject, html, text


# ─── Sender ───────────────────────────────────────────────────────────────────

def _send(to_email: str, subject: str, html: str, text: str) -> bool:
    try:
        resend.Emails.send({
            "from":    FROM_ADDRESS,
            "to":      [to_email],
            "subject": subject,
            "html":    html,
            "text":    text,
        })
        return True
    except Exception as e:
        logger.error("welcome_email: failed to send to {} — {}", to_email, e)
        sentry_sdk.capture_exception(e)
        return False


def send_welcome_sequence() -> str:
    """Send the appropriate welcome email to users based on their trial day."""
    from datetime import datetime, timezone as tz

    today  = date.today()
    sent   = 0
    failed = 0

    try:
        result = supabase.table("profiles").select("id, full_name, tier, created_at").execute()
        profiles = result.data or []
    except Exception as e:
        logger.error("welcome_sequence: failed to fetch profiles — {}", e)
        return "failed to fetch profiles"

    for profile in profiles:
        created = profile.get("created_at", "")
        if not created:
            continue

        try:
            signup_date = datetime.fromisoformat(created.replace("Z", "+00:00")).date()
        except Exception:
            continue

        day = (today - signup_date).days
        if day not in (0, 2, 4, 6):
            continue

        try:
            user_resp = supabase.auth.admin.get_user_by_id(profile["id"])
            email     = user_resp.user.email if user_resp.user else None
        except Exception:
            continue

        if not email:
            continue

        name = profile.get("full_name") or ""
        tier = profile.get("tier") or "free"

        if day == 0:
            subject, html, text = _email_day0(name)
        elif day == 2:
            subject, html, text = _email_day2(name)
        elif day == 4:
            subject, html, text = _email_day4(name)
        else:
            subject, html, text = _email_day6(name, tier)

        if _send(email, subject, html, text):
            sent += 1
        else:
            failed += 1

    summary = f"{sent} sent, {failed} failed"
    logger.info("welcome_sequence complete — {}", summary)
    return summary
