"""
Alpaca WebSocket streaming — maintains a persistent connection for live quotes.
Feeds the ticker bar with real-time prices (30-symbol limit).

Rotation schedule (all times ET):
  9:00am  → subscribe 18 stocks + 12 persistent (stocks + crypto)
  4:30pm  → swap 18 stocks for 18 crypto + keep 12 persistent

The latest prices are cached in-memory and exposed via get_live_prices().
A background thread flushes to raw_prices every 60 seconds.
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

STOCKS_WS_URL = "wss://stream.data.alpaca.markets/v2/iex"
CRYPTO_WS_URL = "wss://stream.data.alpaca.markets/v1beta3/crypto/us"

PERSISTENT_STOCKS = ["AAPL", "NVDA", "TSLA", "SPY", "QQQ", "MSFT", "AMZN"]
PERSISTENT_CRYPTO = ["BTC/USD", "ETH/USD", "SOL/USD", "DOGE/USD", "XRP/USD"]

DAY_STOCKS = [
    "META", "GOOGL", "AMD", "PLTR", "JPM", "V", "AVGO",
    "NFLX", "COIN", "SOFI", "ARM", "SMCI", "CRWD", "HOOD",
    "LLY", "XOM", "COST", "BAC",
]

NIGHT_CRYPTO = [
    "BNB/USD", "AVAX/USD", "ADA/USD", "LINK/USD", "DOT/USD",
    "MATIC/USD", "UNI/USD", "LTC/USD", "ATOM/USD", "SHIB/USD",
    "NEAR/USD", "APT/USD", "ARB/USD", "PEPE/USD", "SUI/USD",
    "WIF/USD", "FIL/USD", "HBAR/USD",
]

_price_cache: dict[str, dict] = {}
_cache_lock = threading.Lock()
_stock_ws = None
_crypto_ws = None
_running = False


def get_live_prices() -> dict[str, dict]:
    with _cache_lock:
        return dict(_price_cache)


def _update_cache(symbol: str, price: float, asset_type: str, volume: float | None = None):
    with _cache_lock:
        identifier = symbol.replace("/USD", "") if "/" in symbol else symbol
        _price_cache[identifier] = {
            "price": price,
            "asset_type": asset_type,
            "volume": volume,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }


def _on_stock_message(ws, message):
    try:
        data = json.loads(message)
        for msg in data:
            if msg.get("T") == "q":
                price = msg.get("ap") or msg.get("bp")
                if price:
                    _update_cache(msg["S"], float(price), "stock")
            elif msg.get("T") == "t":
                _update_cache(msg["S"], float(msg["p"]), "stock", float(msg.get("s", 0)))
    except Exception as e:
        logger.debug("Stock WS parse error: {}", e)


def _on_crypto_message(ws, message):
    try:
        data = json.loads(message)
        for msg in data:
            if msg.get("T") == "q":
                price = msg.get("ap") or msg.get("bp")
                if price:
                    _update_cache(msg["S"], float(price), "crypto")
            elif msg.get("T") == "t":
                _update_cache(msg["S"], float(msg["p"]), "crypto", float(msg.get("s", 0)))
    except Exception as e:
        logger.debug("Crypto WS parse error: {}", e)


def _on_open_stock(ws):
    auth = {"action": "auth", "key": ALPACA_KEY, "secret": ALPACA_SECRET}
    ws.send(json.dumps(auth))
    symbols = PERSISTENT_STOCKS + DAY_STOCKS
    sub = {"action": "subscribe", "quotes": symbols}
    ws.send(json.dumps(sub))
    logger.info("Stock WS connected, subscribed to {} symbols", len(symbols))


def _on_open_crypto(ws):
    auth = {"action": "auth", "key": ALPACA_KEY, "secret": ALPACA_SECRET}
    ws.send(json.dumps(auth))
    sub = {"action": "subscribe", "quotes": PERSISTENT_CRYPTO}
    ws.send(json.dumps(sub))
    logger.info("Crypto WS connected, subscribed to {} symbols", len(PERSISTENT_CRYPTO))


def _on_error(ws, error):
    logger.warning("Alpaca WS error: {}", error)


def _on_close(ws, close_status_code, close_msg):
    logger.info("Alpaca WS closed: {} {}", close_status_code, close_msg)


def _run_stock_ws():
    global _stock_ws
    while _running:
        try:
            _stock_ws = websocket.WebSocketApp(
                STOCKS_WS_URL,
                on_open=_on_open_stock,
                on_message=_on_stock_message,
                on_error=_on_error,
                on_close=_on_close,
            )
            _stock_ws.run_forever(ping_interval=30, ping_timeout=10)
        except Exception as e:
            logger.warning("Stock WS crashed, reconnecting in 5s: {}", e)
        if _running:
            time.sleep(5)


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


def _rotate_subscriptions():
    """Swap stock/crypto subscriptions based on market hours (ET).
    Stocks: 9:00am - 4:30pm ET, Crypto fills the rest."""
    from zoneinfo import ZoneInfo
    et = ZoneInfo("America/New_York")

    while _running:
        try:
            now = datetime.now(et)
            hour, minute = now.hour, now.minute
            market_hours = (hour == 9 and minute >= 0) or (9 < hour < 16) or (hour == 16 and minute < 30)

            if market_hours and _stock_ws:
                _stock_ws.send(json.dumps({
                    "action": "subscribe", "quotes": DAY_STOCKS,
                }))
                if _crypto_ws:
                    _crypto_ws.send(json.dumps({
                        "action": "unsubscribe", "quotes": NIGHT_CRYPTO,
                    }))
                logger.debug("Rotation: market hours, stocks active")
            elif not market_hours and _crypto_ws:
                _crypto_ws.send(json.dumps({
                    "action": "subscribe", "quotes": NIGHT_CRYPTO,
                }))
                if _stock_ws:
                    _stock_ws.send(json.dumps({
                        "action": "unsubscribe", "quotes": DAY_STOCKS,
                    }))
                logger.debug("Rotation: after hours, crypto active")
        except Exception as e:
            logger.debug("Rotation check failed: {}", e)

        time.sleep(300)


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
                    "asset_type": data["asset_type"],
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
    """Start WebSocket connections + rotation + DB flush threads."""
    global _running

    if not ALPACA_KEY or not ALPACA_SECRET:
        logger.info("Alpaca WS: skipping (no API keys)")
        return

    _running = True

    threading.Thread(target=_run_stock_ws, daemon=True, name="alpaca-stock-ws").start()
    threading.Thread(target=_run_crypto_ws, daemon=True, name="alpaca-crypto-ws").start()
    threading.Thread(target=_rotate_subscriptions, daemon=True, name="alpaca-rotation").start()
    threading.Thread(target=_flush_to_db, daemon=True, name="alpaca-flush").start()

    logger.info("Alpaca WebSocket streaming started (4 threads)")


def stop_streaming():
    global _running
    _running = False
    if _stock_ws:
        _stock_ws.close()
    if _crypto_ws:
        _crypto_ws.close()
    logger.info("Alpaca WebSocket streaming stopped")
