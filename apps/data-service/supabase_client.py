import os

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
    postgrest_client_timeout=httpx.Timeout(connect=5.0, read=30.0, write=10.0, pool=10.0),
    storage_client_timeout=httpx.Timeout(connect=5.0, read=30.0, write=10.0, pool=10.0),
)

supabase: Client = create_client(_url, _key, options=_options)
logger.info("Supabase client initialized (url={})", _url[:40] + "..." if _url else "NOT SET")
