import os
import time
import threading

import httpx
from supabase import create_client, Client
from supabase.lib.client_options import ClientOptions
from dotenv import load_dotenv
from loguru import logger

load_dotenv()

_url  = os.environ.get("SUPABASE_URL", "")
_key  = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY_", "")

if not _url or not _key:
    logger.warning("Supabase credentials not set — client will fail on use")

_options = ClientOptions(
    postgrest_client_timeout=httpx.Timeout(connect=10.0, read=60.0, write=30.0, pool=30.0),
    storage_client_timeout=httpx.Timeout(connect=10.0, read=60.0, write=30.0, pool=30.0),
)

_lock = threading.Lock()
_created_at: float = 0.0
_CLIENT_MAX_AGE_S = 300  # recreate every 5 min to shed stale Cloudflare connections

supabase: Client = create_client(_url, _key, options=_options)
_created_at = time.monotonic()
logger.info("Supabase client initialized (url={})", _url[:40] + "..." if _url else "NOT SET")


def refresh_client() -> None:
    """Recreate the global Supabase client to clear stale httpx connections.
    Called periodically by the scheduler and available for manual use."""
    global supabase, _created_at
    with _lock:
        supabase = create_client(_url, _key, options=_options)
        _created_at = time.monotonic()
    logger.debug("Supabase client refreshed")


def refresh_if_stale() -> None:
    """Refresh the client only if it's older than _CLIENT_MAX_AGE_S."""
    if time.monotonic() - _created_at > _CLIENT_MAX_AGE_S:
        refresh_client()
