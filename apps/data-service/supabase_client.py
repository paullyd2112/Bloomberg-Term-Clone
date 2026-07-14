import os

import httpx
from supabase import create_client, Client
from supabase.lib.client_options import SyncClientOptions
from dotenv import load_dotenv
from loguru import logger

load_dotenv()

_url  = os.environ.get("SUPABASE_URL", "")
_key  = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY_", "")

if not _url or not _key:
    logger.warning("Supabase credentials not set — client will fail on use")

_transport = httpx.HTTPTransport(
    retries=2,
    limits=httpx.Limits(
        max_connections=20,
        max_keepalive_connections=10,
        keepalive_expiry=30,
    ),
)

_httpx_client = httpx.Client(
    transport=_transport,
    timeout=httpx.Timeout(connect=5.0, read=30.0, write=10.0, pool=10.0),
)

_options = SyncClientOptions(
    postgrest_client_timeout=httpx.Timeout(connect=5.0, read=30.0, write=10.0, pool=10.0),
    httpx_client=_httpx_client,
)

supabase: Client = create_client(_url, _key, options=_options)
logger.info("Supabase client initialized (url={}, pool=20/10)", _url[:40] + "..." if _url else "NOT SET")
