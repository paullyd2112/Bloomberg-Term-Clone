"""
Alpaca WebSocket streaming — maintains a persistent connection for live crypto quotes.
Feeds the ticker bar with real-time prices.

All crypto, 24/7 — no stock rotation needed.
"""

import json
import os
import threading
import time
from datetime import datetime, timezone

import websocket
from loguru import logger

ALPACA_KEY    = os.environ.get("ALPACA_API_KEY", "")
ALPACA_SECRET = os.environ.get("ALPACA_API_SECRET", "")

CRYPTO_WS_URL = "wss://stream.data.alpaca.markets/v1beta3/crypto/us"

PERSISTENT_CRYPTO = ["BTC/USD", "ETH/USD", "SOL/USD", "DOGE/USD", "XRP/USD"]

EXTENDED_CRYPTO = [
    "BNB/USD", "AVAX/USD", "ADA/USD", "LINK/USD", "DOT/USD",
    "MATIC/USD", "UNI/USD", "LTC/USD", "ATOM/USD", "SHIB/USD",
    "NEAR/USD", "APT/USD", "ARB/USD", "PEPE/USD", "SUI/USD",
    "WIF/USD", "FIL/USD", "HBAR/USD",
]

ALL_CRYPTO = PERSISTENT_CRYPTO + EXTENDED_CRYPTO

_price_cache: dict[str, dict] = {}
_cache_lock = threading.Lock()
_crypto_ws = None
_running = False


def get_live_prices() -> dict[str, dict]:
    with _cache_lock:
        return dict(_price_cache)


def _update_cache(symbol: str, price: float, volume: float | None = None):
    with _cache_lock:
        identifier = symbol.replace("/USD", "") if "/" in symbol else symbol
        _price_cache[identifier] = {
            "price": price,
            "asset_type": "crypto",
            "volume": volume,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }


def _on_crypto_message(ws, message):
    try:
        data = json.loads(message)
        for msg in data:
            if msg.get("T") == "q":
                price = msg.get("ap") or msg.get("bp")
                if price:
                    _update_cache(msg["S"], float(price))
            elif msg.get("T") == "t":
                _update_cache(msg["S"], float(msg["p"]), float(msg.get("s", 0)))
    except Exception as e:
        logger.debug("Crypto WS parse error: {}", e)


def _on_open_crypto(ws):
    auth = {"action": "auth", "key": ALPACA_KEY, "secret": ALPACA_SECRET}
    ws.send(json.dumps(auth))
    sub = {"action": "subscribe", "quotes": ALL_CRYPTO}
    ws.send(json.dumps(sub))
    logger.info("Crypto WS connected, subscribed to {} symbols", len(ALL_CRYPTO))


def _on_error(ws, error):
    logger.warning("Alpaca WS error: {}", error)


def _on_close(ws, close_status_code, close_msg):
    logger.info("Alpaca WS closed: {} {}", close_status_code, close_msg)


def _run_crypto_ws():
    global _crypto_ws
    while _running:
        try:
            _crypto_ws = websocket.WebSocketApp(
                CRYPTO_WS_URL,
                on_open=_on_open_crypto,
                on_message=_on_crypto_message,
                on_error=_on_error,
                on_close=_on_close,
            )
            _crypto_ws.run_forever(ping_interval=30, ping_timeout=10)
        except Exception as e:
            logger.warning("Crypto WS crashed, reconnecting in 5s: {}", e)
        if _running:
            time.sleep(5)


def _flush_to_db():
    """Periodically write cached prices to raw_prices for persistence."""
    from supabase_client import supabase

    while _running:
        time.sleep(60)
        try:
            with _cache_lock:
                snapshot = dict(_price_cache)

            if not snapshot:
                continue

            rows = []
            for identifier, data in snapshot.items():
                rows.append({
                    "asset_type": "crypto",
                    "identifier": identifier,
                    "price": data["price"],
                    "volume": data.get("volume"),
                    "change_24h": None,
                    "metadata": {"source": "alpaca_ws", "updated_at": data["updated_at"]},
                })

            if rows:
                supabase.table("raw_prices").insert(rows).execute()
                logger.debug("Flushed {} live prices to raw_prices", len(rows))
        except Exception as e:
            logger.warning("WS flush to DB failed: {}", e)


def start_streaming():
    """Start crypto WebSocket + DB flush threads."""
    global _running

    if not ALPACA_KEY or not ALPACA_SECRET:
        logger.info("Alpaca WS: skipping (no API keys)")
        return

    _running = True

    threading.Thread(target=_run_crypto_ws, daemon=True, name="alpaca-crypto-ws").start()
    threading.Thread(target=_flush_to_db, daemon=True, name="alpaca-flush").start()

    logger.info("Alpaca WebSocket streaming started (2 threads, crypto-only)")


def stop_streaming():
    global _running
    _running = False
    if _crypto_ws:
        _crypto_ws.close()
    logger.info("Alpaca WebSocket streaming stopped")
