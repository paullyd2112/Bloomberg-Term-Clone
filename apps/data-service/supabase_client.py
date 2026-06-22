import os
from supabase import create_client, Client
from dotenv import load_dotenv
from loguru import logger

load_dotenv()

_url  = os.environ.get("SUPABASE_URL", "")
_key  = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY_", "")

if not _url or not _key:
    logger.warning("Supabase credentials not set — client will fail on use")

supabase: Client = create_client(_url, _key)
logger.info("Supabase client initialized (url={})", _url[:40] + "..." if _url else "NOT SET")
