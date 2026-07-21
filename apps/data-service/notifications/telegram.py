"""
Telegram signal alerts — instant delivery via Bot API.

Users link their account by messaging the bot with /start <link_code>.
The bot's token is TELEGRAM_BOT_TOKEN env var. Gracefully no-ops if unconfigured.

Delivery is sub-second vs web push which can be delayed 5-30s by OS batching.
"""

import os
import urllib.request
import urllib.parse
import json

from loguru import logger

from supabase_client import supabase

BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
API_BASE = f"https://api.telegram.org/bot{BOT_TOKEN}"


def _configured() -> bool:
    return bool(BOT_TOKEN)


def _send_message(chat_id: str, text: str, parse_mode: str = "HTML") -> bool:
    if not _configured():
        return False

    payload = json.dumps({
        "chat_id": chat_id,
        "text": text,
        "parse_mode": parse_mode,
        "disable_web_page_preview": True,
    }).encode()

    req = urllib.request.Request(
        f"{API_BASE}/sendMessage",
        data=payload,
        headers={"Content-Type": "application/json"},
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status == 200
    except Exception as e:
        logger.warning("telegram: send failed for chat {} — {}", chat_id, e)
        return False


def _fmt_price(price) -> str:
    if price is None:
        return "—"
    try:
        return f"${float(price):,.2f}"
    except (TypeError, ValueError):
        return "—"


def send_signal_to_user(chat_id: str, signal: dict, app_url: str = "https://plebs.finance") -> bool:
    direction = signal.get("direction", "")
    identifier = signal.get("identifier", "")
    confidence = signal.get("confidence", 0)
    asset_type = signal.get("asset_type", "")
    reasoning = signal.get("reasoning", "")
    market_title = signal.get("market_title")

    display_name = market_title or identifier
    emoji = "🟢" if direction in ("BUY", "YES") else "🔴"

    trade_setup = signal.get("trade_setup") or {}
    stop = trade_setup.get("stop_loss")
    target = trade_setup.get("take_profit")

    lines = [
        f"{emoji} <b>{direction} {display_name}</b> — {confidence}%",
        "",
    ]

    if stop or target:
        parts = []
        if stop:
            parts.append(f"Stop {_fmt_price(stop)}")
        if target:
            parts.append(f"Target {_fmt_price(target)}")
        lines.append(f"📊 {' / '.join(parts)}")
        lines.append("")

    if reasoning:
        lines.append(reasoning[:300])
        lines.append("")

    signal_id = signal.get("id", "")
    signal_url = f"{app_url}/dashboard/signals?highlight={signal_id}" if signal_id else f"{app_url}/dashboard"
    lines.append(f'<a href="{signal_url}">View on Plebs →</a>')

    return _send_message(chat_id, "\n".join(lines))


def send_signal_to_all_subscribers(signal: dict) -> int:
    if not _configured():
        return 0

    try:
        result = (
            supabase.table("profiles")
            .select("id, telegram_chat_id")
            .not_.is_("telegram_chat_id", "null")
            .execute()
        )
        profiles = result.data or []
    except Exception as e:
        logger.error("telegram: failed to fetch profiles — {}", e)
        return 0

    if not profiles:
        return 0

    app_url = os.environ.get("NEXT_PUBLIC_APP_URL", "https://plebs.finance")
    sent = 0
    for p in profiles:
        chat_id = p.get("telegram_chat_id")
        if chat_id and send_signal_to_user(chat_id, signal, app_url):
            sent += 1

    if sent:
        logger.info("telegram: sent {} message(s) for {} {}", sent, signal.get("direction"), signal.get("identifier"))
    return sent
