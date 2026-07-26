"""
Polymarket WebSocket streaming — real-time price updates for prediction markets.

Connects to Polymarket's Market WebSocket channel for live price ticks.
Caches prices in-memory and flushes to prediction_price_history every 5 min.
Serves a live cache via get_live_prediction_prices() for the REST endpoint.

No auth required — public market data. The 30-min Gamma API poll continues
as the primary discovery mechanism; this adds sub-minute price freshness.
"""

import json
import threading
import time
from datetime import datetime, timezone

import websocket
from loguru import logger

from supabase_client import supabase

WS_URL = "wss://ws-subscriptions-clob.polymarket.com/ws/market"
HEARTBEAT_S = 10
FLUSH_INTERVAL_S = 300
TOKEN_REFRESH_S = 1800
MAX_SUBSCRIBE_BATCH = 200

_price_cache: dict[str, dict] = {}
_cache_lock = threading.Lock()

_token_to_condition: dict[str, str] = {}
_token_direction: dict[str, str] = {}
_subscribed_tokens: set[str] = set()

_ws_instance = None
_running = False
_connected_at: float = 0
_last_message_at: float = 0
_reconnect_count = 0
_msg_count = 0


def get_live_prediction_prices() -> dict[str, dict]:
    with _cache_lock:
        return dict(_price_cache)


def _load_token_map() -> dict[str, tuple[str, str]]:
    try:
        result = (
            supabase.table("raw_prices")
            .select("identifier, metadata")
            .eq("asset_type", "prediction")
            .order("captured_at", desc=True)
            .limit(1500)
        ).execute()
    except Exception as e:
        logger.error("polymarket_ws: failed to load token map — {}", e)
        return {}

    token_map: dict[str, tuple[str, str]] = {}
    seen: set[str] = set()

    for row in result.data or []:
        cid = row["identifier"]
        if cid in seen:
            continue
        seen.add(cid)

        meta = row.get("metadata") or {}
        clob_ids = meta.get("clobTokenIds")
        if not isinstance(clob_ids, list) or len(clob_ids) < 2:
            continue

        token_map[str(clob_ids[0])] = (cid, "YES")
        token_map[str(clob_ids[1])] = (cid, "NO")

    return token_map


def _refresh_tokens():
    global _token_to_condition, _token_direction

    token_map = _load_token_map()
    if not token_map:
        return

    new_tokens: list[str] = []
    for tid, (cid, direction) in token_map.items():
        _token_to_condition[tid] = cid
        _token_direction[tid] = direction
        if tid not in _subscribed_tokens:
            new_tokens.append(tid)

    if new_tokens and _ws_instance:
        try:
            sock = _ws_instance.sock
            if sock and sock.connected:
                for i in range(0, len(new_tokens), MAX_SUBSCRIBE_BATCH):
                    batch = new_tokens[i:i + MAX_SUBSCRIBE_BATCH]
                    _ws_instance.send(json.dumps({
                        "assets_ids": batch,
                        "operation": "subscribe",
                    }))
                    _subscribed_tokens.update(batch)
                logger.debug("polymarket_ws: dynamically subscribed {} new tokens", len(new_tokens))
        except Exception as e:
            logger.warning("polymarket_ws: dynamic subscribe failed — {}", e)

    market_count = len(set(cid for cid, _ in token_map.values()))
    logger.info("polymarket_ws: token map — {} tokens, {} markets", len(token_map), market_count)


def _on_message(ws, message):
    global _last_message_at, _msg_count
    _last_message_at = time.time()

    if message == "PONG":
        return

    try:
        data = json.loads(message)
        events = data if isinstance(data, list) else [data]
    except (json.JSONDecodeError, TypeError):
        return

    for event in events:
        event_type = event.get("event_type", "")
        if event_type not in ("price_change", "last_trade_price"):
            continue

        asset_id = event.get("asset_id", "")
        if not asset_id:
            continue

        price = None
        for field in ("price", "last_trade_price", "mid_price"):
            val = event.get(field)
            if val is not None:
                try:
                    price = float(val)
                    break
                except (ValueError, TypeError):
                    continue

        if price is None or price <= 0 or price >= 1:
            continue

        condition_id = _token_to_condition.get(asset_id) or event.get("market", "")
        if not condition_id:
            continue

        direction = _token_direction.get(asset_id, "YES")
        _msg_count += 1

        with _cache_lock:
            existing = _price_cache.get(condition_id, {})
            if direction == "YES":
                existing["yes_price"] = round(price, 4)
                if "no_price" not in existing:
                    existing["no_price"] = round(1 - price, 4)
            else:
                existing["no_price"] = round(price, 4)
                if "yes_price" not in existing:
                    existing["yes_price"] = round(1 - price, 4)
            existing["updated_at"] = datetime.now(timezone.utc).isoformat()
            existing["condition_id"] = condition_id
            _price_cache[condition_id] = existing


def _on_open(ws):
    global _connected_at
    _connected_at = time.time()
    logger.info("polymarket_ws: connected")

    _refresh_tokens()

    all_tokens = list(_token_to_condition.keys())
    if not all_tokens:
        logger.warning("polymarket_ws: no tokens to subscribe to")
        return

    for i in range(0, len(all_tokens), MAX_SUBSCRIBE_BATCH):
        batch = all_tokens[i:i + MAX_SUBSCRIBE_BATCH]
        ws.send(json.dumps({
            "assets_ids": batch,
            "type": "market",
        }))
        _subscribed_tokens.update(batch)

    logger.info("polymarket_ws: subscribed to {} tokens", len(all_tokens))

    def heartbeat():
        while _running:
            try:
                sock = ws.sock
                if not sock or not sock.connected:
                    break
                ws.send("PING")
            except Exception:
                break
            time.sleep(HEARTBEAT_S)

    threading.Thread(target=heartbeat, daemon=True, name="pm-ws-heartbeat").start()


def _on_error(ws, error):
    logger.warning("polymarket_ws: error — {}", error)


def _on_close(ws, code, msg):
    global _connected_at
    _connected_at = 0
    _subscribed_tokens.clear()
    logger.info("polymarket_ws: closed ({} {})", code, msg)


def _run_ws():
    global _ws_instance, _reconnect_count

    while _running:
        try:
            _ws_instance = websocket.WebSocketApp(
                WS_URL,
                on_open=_on_open,
                on_message=_on_message,
                on_error=_on_error,
                on_close=_on_close,
            )
            _reconnect_count = 0
            _ws_instance.run_forever()
        except Exception as e:
            logger.warning("polymarket_ws: run_forever crashed — {}", e)

        if not _running:
            break

        delay = min(60, 2 ** min(_reconnect_count, 6))
        _reconnect_count += 1
        logger.info("polymarket_ws: reconnecting in {}s (attempt {})", delay, _reconnect_count)
        time.sleep(delay)


def _flush_to_db():
    while _running:
        time.sleep(FLUSH_INTERVAL_S)
        try:
            with _cache_lock:
                snapshot = dict(_price_cache)

            if not snapshot:
                continue

            rows = []
            for condition_id, data in snapshot.items():
                yes_p = data.get("yes_price")
                if yes_p is None:
                    continue
                rows.append({
                    "condition_id": condition_id,
                    "yes_price": yes_p,
                    "no_price": data.get("no_price"),
                    "volume": data.get("volume"),
                })

            if rows:
                batch_size = 100
                total = 0
                for i in range(0, len(rows), batch_size):
                    batch = rows[i:i + batch_size]
                    supabase.table("prediction_price_history").insert(batch).execute()
                    total += len(batch)

                logger.debug("polymarket_ws: flushed {} price snapshots to DB", total)
        except Exception as e:
            logger.warning("polymarket_ws: flush failed — {}", e)


def _token_refresh_loop():
    while _running:
        time.sleep(TOKEN_REFRESH_S)
        try:
            _refresh_tokens()
        except Exception as e:
            logger.warning("polymarket_ws: token refresh failed — {}", e)


def start_polymarket_streaming():
    global _running
    _running = True

    threading.Thread(target=_run_ws, daemon=True, name="polymarket-ws").start()
    threading.Thread(target=_flush_to_db, daemon=True, name="polymarket-flush").start()
    threading.Thread(target=_token_refresh_loop, daemon=True, name="polymarket-token-refresh").start()

    logger.info("Polymarket WebSocket streaming started (3 threads)")


def stop_polymarket_streaming():
    global _running
    _running = False
    if _ws_instance:
        _ws_instance.close()
    logger.info("Polymarket WebSocket streaming stopped")


def get_ws_health() -> dict:
    now = time.time()
    connected = _connected_at > 0
    last_msg_ago = round(now - _last_message_at, 1) if _last_message_at > 0 else None

    with _cache_lock:
        cached_markets = len(_price_cache)

    return {
        "connected": connected,
        "uptime_s": round(now - _connected_at, 1) if connected else 0,
        "last_message_ago_s": last_msg_ago,
        "cached_markets": cached_markets,
        "subscribed_tokens": len(_subscribed_tokens),
        "reconnect_count": _reconnect_count,
        "total_messages": _msg_count,
    }
