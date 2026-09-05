"""
Webhook dispatch system for broadcasting signals to registered local agents.

Subscribers register a callback URL + shared secret. When a signal is written,
it's signed with HMAC-SHA256 and POSTed to all active subscribers.
"""

import hashlib
import hmac
import json
import os
import time
import threading

import httpx
from loguru import logger

from supabase_client import supabase


_DISPATCH_TIMEOUT = 5.0
_MAX_RETRIES = 2
_executor_pool = None


def _get_pool():
    global _executor_pool
    if _executor_pool is None:
        from concurrent.futures import ThreadPoolExecutor
        _executor_pool = ThreadPoolExecutor(max_workers=4)
    return _executor_pool


def sign_payload(payload_bytes: bytes, secret: str) -> str:
    return hmac.new(
        secret.encode("utf-8"),
        payload_bytes,
        hashlib.sha256,
    ).hexdigest()


def _deliver(url: str, payload_bytes: bytes, signature: str, sub_id: str):
    headers = {
        "Content-Type": "application/json",
        "X-Plebs-Signature": signature,
        "X-Plebs-Timestamp": str(int(time.time())),
    }
    for attempt in range(1, _MAX_RETRIES + 1):
        try:
            resp = httpx.post(url, content=payload_bytes, headers=headers, timeout=_DISPATCH_TIMEOUT)
            if resp.status_code < 300:
                logger.debug("webhook delivered to {} (attempt {})", sub_id, attempt)
                _record_delivery(sub_id, True)
                return
            logger.warning("webhook {} returned {} (attempt {})", sub_id, resp.status_code, attempt)
        except Exception as e:
            logger.warning("webhook {} failed (attempt {}): {}", sub_id, attempt, e)

    _record_delivery(sub_id, False)
    _increment_failure(sub_id)


def _record_delivery(sub_id: str, success: bool):
    try:
        update = {"last_delivery_at": "now()"}
        if success:
            update["consecutive_failures"] = 0
        supabase.table("webhook_subscriptions").update(update).eq("id", sub_id).execute()
    except Exception:
        pass


def _increment_failure(sub_id: str):
    try:
        row = supabase.table("webhook_subscriptions").select("consecutive_failures").eq("id", sub_id).single().execute()
        failures = (row.data.get("consecutive_failures") or 0) + 1
        update = {"consecutive_failures": failures}
        if failures >= 10:
            update["active"] = False
            logger.warning("webhook {} disabled after {} consecutive failures", sub_id, failures)
        supabase.table("webhook_subscriptions").update(update).eq("id", sub_id).execute()
    except Exception:
        pass


def dispatch_signal(signal: dict):
    """Broadcast a signal to all active webhook subscribers. Non-blocking."""
    if signal.get("direction") in ("HOLD", None) or signal.get("confidence", 0) < 50:
        return

    payload = {
        "event": "signal.created",
        "timestamp": int(time.time()),
        "signal": {
            "id": signal.get("id"),
            "asset_type": signal.get("asset_type"),
            "identifier": signal.get("identifier"),
            "direction": signal.get("direction"),
            "confidence": signal.get("confidence"),
            "reasoning": signal.get("reasoning"),
            "time_horizon": signal.get("time_horizon"),
            "price_at_signal": float(signal["price_at_signal"]) if signal.get("price_at_signal") else None,
            "market_title": signal.get("market_title"),
            "trade_setup": signal.get("trade_setup"),
            "created_at": signal.get("created_at"),
        },
    }

    try:
        subs = (
            supabase.table("webhook_subscriptions")
            .select("id, callback_url, secret")
            .eq("active", True)
            .execute()
        )
    except Exception as e:
        logger.debug("webhook subscriber query failed: {}", e)
        return

    if not subs.data:
        return

    payload_bytes = json.dumps(payload, default=str).encode("utf-8")
    pool = _get_pool()

    for sub in subs.data:
        sig = sign_payload(payload_bytes, sub["secret"])
        pool.submit(_deliver, sub["callback_url"], payload_bytes, sig, str(sub["id"]))


def register_subscriber(callback_url: str, secret: str, label: str = "") -> dict:
    row = {
        "callback_url": callback_url,
        "secret": secret,
        "label": label or callback_url,
        "active": True,
        "consecutive_failures": 0,
    }
    result = supabase.table("webhook_subscriptions").insert(row).execute()
    return result.data[0] if result.data else row


def unregister_subscriber(sub_id: str) -> bool:
    try:
        supabase.table("webhook_subscriptions").delete().eq("id", sub_id).execute()
        return True
    except Exception:
        return False


def list_subscribers() -> list[dict]:
    try:
        result = (
            supabase.table("webhook_subscriptions")
            .select("id, callback_url, label, active, consecutive_failures, last_delivery_at, created_at")
            .order("created_at", desc=True)
            .execute()
        )
        return result.data or []
    except Exception:
        return []
