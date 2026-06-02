import os
import sentry_sdk
from dotenv import load_dotenv
from loguru import logger

load_dotenv()

def init_sentry() -> None:
    dsn = os.environ.get("SENTRY_DSN", "")
    if not dsn:
        logger.warning("SENTRY_DSN not set — error tracking disabled")
        return

    sentry_sdk.init(
        dsn=dsn,
        traces_sample_rate=0.1,
        environment=os.environ.get("APP_ENV", "development"),
    )
    logger.info("Sentry initialized (env={})", os.environ.get("APP_ENV", "development"))
