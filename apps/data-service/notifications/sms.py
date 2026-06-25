"""
SMS notifications via Twilio — sends alert texts to users with a phone number.

Gracefully no-ops if Twilio credentials aren't configured.
"""

import os

from loguru import logger

from supabase_client import supabase

TWILIO_ACCOUNT_SID  = os.environ.get("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN    = os.environ.get("TWILIO_AUTH_TOKEN", "")
TWILIO_PHONE_NUMBER = os.environ.get("TWILIO_PHONE_NUMBER", "")


def _configured() -> bool:
    return bool(TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER)


def _get_user_phone(user_id: str) -> str | None:
    try:
        result = (
            supabase.table("profiles")
            .select("phone_number, sms_alerts")
            .eq("id", user_id)
            .single()
            .execute()
        )
        if not result.data:
            return None
        profile = result.data
        if profile.get("sms_alerts") is False:
            return None
        return profile.get("phone_number") or None
    except Exception as e:
        logger.warning("sms: failed to fetch phone for {}: {}", user_id, e)
        return None


def send_sms_to_user(user_id: str, body: str) -> bool:
    if not _configured():
        logger.debug("Twilio not configured — skipping SMS for {}", user_id)
        return False

    phone = _get_user_phone(user_id)
    if not phone:
        return False

    try:
        from twilio.rest import Client
    except ImportError:
        logger.warning("twilio package not installed — skipping SMS")
        return False

    try:
        client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        client.messages.create(
            body=body,
            from_=TWILIO_PHONE_NUMBER,
            to=phone,
        )
        logger.info("sms: sent to user {} at {}", user_id, phone[:4] + "****")
        return True
    except Exception as e:
        logger.error("sms: failed to send to user {}: {}", user_id, e)
        return False


def send_alert_sms(user_id: str, alert: dict) -> bool:
    """Format and send an SMS for a fired alert."""
    asset = alert.get("identifier", "")
    asset_type = alert.get("asset_type", "")
    trigger = alert.get("trigger_type", "")

    if trigger == "signal_fired":
        body = f"Plebs Alert: New AI signal fired for {asset} ({asset_type}). Check plebs.finance for details."
    elif trigger == "price_threshold":
        body = f"Plebs Alert: {asset} hit your price threshold. Check plebs.finance for details."
    elif trigger == "news_drop":
        body = f"Plebs Alert: Breaking news for {asset}. Check plebs.finance for details."
    else:
        body = f"Plebs Alert: Your alert for {asset} triggered. Check plebs.finance for details."

    return send_sms_to_user(user_id, body)
