"""
Web push notifications — free notification channel for Pro/Elite users.

Sends browser push notifications when alerts fire. Uses VAPID keys
(VAPID_PUBLIC_KEY shared with the web client, VAPID_PRIVATE_KEY here).

Gracefully no-ops if VAPID keys aren't configured.
"""

import json
import os

from loguru import logger

from supabase_client import supabase

VAPID_PRIVATE_KEY = os.environ.get("VAPID_PRIVATE_KEY", "")
VAPID_PUBLIC_KEY  = os.environ.get("VAPID_PUBLIC_KEY", "")
VAPID_SUBJECT     = os.environ.get("VAPID_SUBJECT", "mailto:support@plebs.finance")


def _configured() -> bool:
    return bool(VAPID_PRIVATE_KEY and VAPID_PUBLIC_KEY)


def send_push_to_user(user_id: str, title: str, body: str, url: str = "/dashboard") -> int:
    """
    Send a web push notification to all of a user's registered devices.
    Returns the number of successful sends. Removes dead subscriptions.
    """
    if not _configured():
        logger.debug("Web push not configured — skipping push for {}", user_id)
        return 0

    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        logger.warning("pywebpush not installed — skipping push")
        return 0

    try:
        result = (
            supabase.table("push_subscriptions")
            .select("*")
            .eq("user_id", user_id)
            .execute()
        )
        subs = result.data or []
    except Exception as e:
        logger.error("push: failed to fetch subscriptions for {}: {}", user_id, e)
        return 0

    if not subs:
        return 0

    payload = json.dumps({"title": title, "body": body, "url": url})
    sent = 0

    for sub in subs:
        subscription_info = {
            "endpoint": sub["endpoint"],
            "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]},
        }
        try:
            webpush(
                subscription_info=subscription_info,
                data=payload,
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims={"sub": VAPID_SUBJECT},
            )
            sent += 1
        except WebPushException as e:
            # 404/410 mean the subscription is dead — remove it
            status = getattr(e.response, "status_code", None)
            if status in (404, 410):
                try:
                    supabase.table("push_subscriptions").delete().eq("id", sub["id"]).execute()
                    logger.info("push: removed dead subscription {}", sub["id"])
                except Exception:
                    pass
            else:
                logger.warning("push: send failed for sub {}: {}", sub["id"], e)
        except Exception as e:
            logger.warning("push: unexpected error for sub {}: {}", sub["id"], e)

    if sent:
        logger.info("push: sent {} notification(s) to user {}", sent, user_id)
    return sent


def send_alert_push(user_id: str, alert: dict) -> int:
    """Format and send a push notification for a fired alert."""
    asset = alert.get("identifier", "")
    asset_type = alert.get("asset_type", "")
    trigger = alert.get("trigger_type", "")

    if trigger == "signal_fired":
        title = f"New signal: {asset}"
        body = f"A new AI signal just fired for {asset} ({asset_type})."
    elif trigger == "price_threshold":
        title = f"Price alert: {asset}"
        body = f"{asset} hit your price threshold."
    elif trigger == "news_drop":
        title = f"News alert: {asset}"
        body = f"Breaking news for {asset}."
    else:
        title = f"Alert: {asset}"
        body = f"Your alert for {asset} triggered."

    url = f"/dashboard/asset/{asset_type}/{asset}"
    return send_push_to_user(user_id, title, body, url)
