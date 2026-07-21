import sys
import os
from datetime import datetime, timezone
from loguru import logger
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
import sentry_sdk
from flask import Flask, jsonify
from dotenv import load_dotenv

from sentry_setup import init_sentry
from ingestion.prediction_markets import ingest_prediction_markets
from ingestion.crypto import ingest_crypto
from ingestion.congressional import ingest_congressional
from ingestion.macro_events import seed_macro_events
from ingestion.fred import enrich_macro_events
from ingestion.news import ingest_news
from ingestion.tech_news import ingest_tech_news
from ingestion.geopolitics_news import ingest_geopolitics_news
from ingestion.sports_news import ingest_sports_news
from ingestion.health_science_news import ingest_health_science_news
from ingestion.world_news import ingest_world_news
from ingestion.rss_utils import check_feed_health
from ingestion.crypto_momentum import ingest_momentum_coins
from ingestion.apewisdom import ingest_apewisdom
from scoring.engine import score_prediction_markets
from scoring.rules_engine import score_crypto_rules
from scoring.whale_sentinel import ingest_whale_alerts, get_recent_whale_alerts
from scoring.resolver import resolve_outcomes, evaluate_alerts
from scoring.accuracy import refresh_asset_accuracy
from briefing.newsletter import generate_newsletter
from briefing.newsletter_emailer import send_newsletter
from briefing.elite_briefing import send_elite_briefings
from briefing.welcome_emails import send_welcome_sequence

load_dotenv()

# ─── Logging ──────────────────────────────────────────────────────────────────────
os.makedirs("logs", exist_ok=True)
logger.remove()
logger.add(sys.stdout, level="INFO", colorize=True,
           format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level}</level> | {message}")
logger.add("logs/data-service.log", level="DEBUG", rotation="1 day",
           retention="7 days", compression="zip")

# ─── Sentry ─────────────────────────────────────────────────────────────────────
init_sentry()

# ─── Scheduler ──────────────────────────────────────────────────────────────────
scheduler = BackgroundScheduler(timezone="America/New_York")

# Track last run times and error counts for health endpoint
_job_state: dict = {}

def _run_job(name: str, fn):
    """Wrapper: logs, times, captures errors, never crashes scheduler."""
    with sentry_sdk.start_transaction(op="job", name=name):
        logger.info("Job started: {}", name)
        start = datetime.now(timezone.utc)
        try:
            result = fn()
            elapsed = (datetime.now(timezone.utc) - start).total_seconds()
            _job_state[name] = {"last_run": datetime.now(timezone.utc).isoformat(), "status": "ok", "elapsed_s": elapsed}
            logger.info("Job completed: {} ({:.1f}s) — {}", name, elapsed, result)
        except Exception as e:
            elapsed = (datetime.now(timezone.utc) - start).total_seconds()
            _job_state[name] = {"last_run": datetime.now(timezone.utc).isoformat(), "status": "error", "error": str(e)}
            sentry_sdk.capture_exception(e)
            logger.error("Job failed: {} — {}", name, e)


# ─── Job stubs (bodies filled in subsequent prompts) ─────────────────────

def job_ingest_prediction_markets():
    return ingest_prediction_markets()

def job_score_prediction_markets():
    return score_prediction_markets()

def job_ingest_crypto():
    return ingest_crypto()

def job_score_crypto():
    return score_crypto_rules()

def job_ingest_whale_alerts():
    return ingest_whale_alerts()

def job_seed_macro_events():
    return seed_macro_events()

def job_enrich_fred():
    return enrich_macro_events()

def job_ingest_congressional():
    return ingest_congressional()

def job_ingest_news():
    return ingest_news()

def job_ingest_tech_news():
    return ingest_tech_news()

def job_ingest_geopolitics_news():
    return ingest_geopolitics_news()

def job_ingest_sports_news():
    return ingest_sports_news()

def job_ingest_health_science_news():
    return ingest_health_science_news()

def job_ingest_world_news():
    return ingest_world_news()

def job_check_feed_health():
    return check_feed_health()

def job_crypto_momentum():
    return ingest_momentum_coins()

def job_ingest_apewisdom():
    return ingest_apewisdom()

def job_generate_newsletter():
    return generate_newsletter()

def job_send_newsletter():
    return send_newsletter()

def job_send_newsletter_retry():
    """The 7:45am safety net. Previously just re-called send_newsletter(),
    which only re-attempts SENDING -- if 7am generation failed (returns None
    on Claude/DB errors, no exception), there was still nothing to send and
    the retry was a no-op. Now actually retries generation first if today's
    briefing is missing, so a transient 7am failure has a real second chance
    instead of silently becoming a missed day."""
    from datetime import date as _date
    from briefing.newsletter_emailer import _get_todays_newsletter
    if _get_todays_newsletter() is None:
        logger.warning("send_newsletter_retry: no briefing for {} — regenerating before send", _date.today())
        result = generate_newsletter()
        if result is None:
            logger.error("send_newsletter_retry: regeneration also failed — giving up for today")
            return "regeneration failed, nothing to send"
    return send_newsletter()

def job_send_elite_briefings():
    return send_elite_briefings()

def job_send_welcome_sequence():
    return send_welcome_sequence()

def job_resolve_outcomes():
    return resolve_outcomes()

def job_refresh_asset_accuracy():
    return refresh_asset_accuracy()

def job_evaluate_alerts():
    return evaluate_alerts()


_uptime_fail_count = 0
UPTIME_ALERT_THRESHOLD = 2  # alert after 2 consecutive failures (10 min)
UPTIME_URLS = [
    os.environ.get("NEXT_PUBLIC_APP_URL", "https://plebs.finance"),
]
ALERT_EMAIL = os.environ.get("ALERT_EMAIL", "paulsolomonaqua@gmail.com")


def job_uptime_check():
    import httpx
    import resend as _resend

    global _uptime_fail_count

    _resend.api_key = os.environ.get("RESEND_API_KEY", "") or os.environ.get("RESEND_API_KEY_", "")
    down_urls = []

    for url in UPTIME_URLS:
        if not url:
            continue
        try:
            resp = httpx.get(url, timeout=10, follow_redirects=True)
            if resp.status_code >= 500:
                down_urls.append(f"{url} — HTTP {resp.status_code}")
        except Exception as e:
            down_urls.append(f"{url} — {e}")

    if not down_urls:
        if _uptime_fail_count > 0:
            logger.info("Uptime recovered after {} consecutive failures", _uptime_fail_count)
            if _uptime_fail_count >= UPTIME_ALERT_THRESHOLD and _resend.api_key:
                try:
                    _resend.Emails.send({
                        "from": "Plebs Uptime <alerts@plebs.finance>",
                        "to": [ALERT_EMAIL],
                        "subject": "Plebs.finance is BACK UP",
                        "text": f"All endpoints recovered after {_uptime_fail_count} consecutive failures.",
                    })
                except Exception:
                    pass
        _uptime_fail_count = 0
        return "all endpoints healthy"

    _uptime_fail_count += 1
    logger.warning("Uptime check failed ({}/{}): {}", _uptime_fail_count, UPTIME_ALERT_THRESHOLD, down_urls)

    if _uptime_fail_count == UPTIME_ALERT_THRESHOLD and _resend.api_key:
        try:
            _resend.Emails.send({
                "from": "Plebs Uptime <alerts@plebs.finance>",
                "to": [ALERT_EMAIL],
                "subject": "Plebs.finance is DOWN",
                "text": f"The following endpoints are unreachable:\n\n" + "\n".join(down_urls) +
                        f"\n\nFailing for {_uptime_fail_count * 5} minutes.",
            })
            logger.info("Uptime alert email sent to {}", ALERT_EMAIL)
        except Exception as e:
            logger.error("Failed to send uptime alert: {}", e)

    return f"DOWN: {down_urls}"


# ─── US Market Holiday Guard ──────────────────────────────────────────────

US_MARKET_HOLIDAYS_2026 = {
    "2026-01-01",  # New Year's Day
    "2026-01-19",  # MLK Day
    "2026-02-16",  # Presidents' Day
    "2026-04-03",  # Good Friday
    "2026-05-25",  # Memorial Day
    "2026-06-19",  # Juneteenth
    "2026-07-03",  # Independence Day (observed)
    "2026-09-07",  # Labor Day
    "2026-11-26",  # Thanksgiving
    "2026-12-25",  # Christmas
}

US_MARKET_HOLIDAYS_2027 = {
    "2027-01-01",  # New Year's Day
    "2027-01-18",  # MLK Day
    "2027-02-15",  # Presidents' Day
    "2027-03-26",  # Good Friday
    "2027-05-31",  # Memorial Day
    "2027-06-18",  # Juneteenth (observed)
    "2027-07-05",  # Independence Day (observed)
    "2027-09-06",  # Labor Day
    "2027-11-25",  # Thanksgiving
    "2027-12-24",  # Christmas (observed)
}

US_MARKET_HOLIDAYS = US_MARKET_HOLIDAYS_2026 | US_MARKET_HOLIDAYS_2027


def _is_market_open() -> bool:
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")
    if today in US_MARKET_HOLIDAYS:
        logger.info("Market holiday — skipping stock jobs for {}", today)
        return False
    if now.weekday() >= 5:
        logger.info("Weekend — skipping stock jobs for {}", today)
        return False
    # Hard cutoff: no stock/options scoring after 3:30 PM ET
    try:
        import zoneinfo
        et_now = now.astimezone(zoneinfo.ZoneInfo("America/New_York"))
        cutoff_minutes = 15 * 60 + 30  # 15:30 ET
        current_minutes = et_now.hour * 60 + et_now.minute
        if current_minutes >= cutoff_minutes:
            logger.info("Past 3:30 PM ET hard cutoff — skipping stock jobs")
            return False
        if current_minutes < 9 * 60 + 30:  # before 9:30 AM ET open
            logger.info("Before 9:30 AM ET market open — skipping stock jobs")
            return False
    except Exception:
        pass
    return True


def _run_stock_job(name: str, fn):
    if not _is_market_open():
        logger.info("Skipping {} — market closed (holiday)", name)
        return
    _run_job(name, fn)


# ─── Schedule ─────────────────────────────────────────────────────────────────

# Prediction markets — dual-scan (9 AM + 6 PM ET), not a flat loop.
# Ingest runs 15 min before each scoring window to refresh live prices.
# On-demand trigger via POST /api/v1/scanners/prediction-markets/trigger
scheduler.add_job(lambda: _run_job("ingest_prediction_markets", job_ingest_prediction_markets),
                  CronTrigger(hour="8,17", minute=45, timezone="America/New_York"),
                  id="ingest_prediction_markets")
scheduler.add_job(lambda: _run_job("score_prediction_markets_am", job_score_prediction_markets),
                  CronTrigger(hour=9, minute=0, timezone="America/New_York"),
                  id="score_prediction_markets_am")
scheduler.add_job(lambda: _run_job("score_prediction_markets_pm", job_score_prediction_markets),
                  CronTrigger(hour=18, minute=0, timezone="America/New_York"),
                  id="score_prediction_markets_pm")

# ─── Crypto: flat 2-hour loop (24/7) ────
scheduler.add_job(lambda: _run_job("ingest_crypto", job_ingest_crypto),
                  CronTrigger(minute=0, hour="*/2"), id="ingest_crypto")
scheduler.add_job(lambda: _run_job("score_crypto", job_score_crypto),
                  CronTrigger(minute=20, hour="*/2"), id="score_crypto")

# Whale Sentinel — poll Polymarket CLOB for large trades every 5 min
scheduler.add_job(lambda: _run_job("ingest_whale_alerts", job_ingest_whale_alerts),
                  IntervalTrigger(minutes=5), id="ingest_whale_alerts")

# Crypto momentum screener — every 2 hours, catches pumps/breakouts outside watchlist
scheduler.add_job(lambda: _run_job("crypto_momentum", job_crypto_momentum),
                  CronTrigger(minute=45, hour="*/2"), id="crypto_momentum")

# ApeWisdom Reddit sentiment — hourly (matches their 30-min scan cadence)
scheduler.add_job(lambda: _run_job("ingest_apewisdom", job_ingest_apewisdom),
                  CronTrigger(minute=30, hour="*/1"), id="ingest_apewisdom")


# Enrichment — macro data for predictions/briefings
scheduler.add_job(lambda: _run_job("seed_macro_events", job_seed_macro_events),
                  CronTrigger(hour=6, minute=30, day_of_week="mon-fri"), id="seed_macro_events")
scheduler.add_job(lambda: _run_job("enrich_fred", job_enrich_fred),
                  CronTrigger(hour=6, minute=45, day_of_week="mon-fri"), id="enrich_fred")

# Congressional — daily at 8am ET (Senate EFD scraper)
scheduler.add_job(lambda: _run_job("ingest_congressional", job_ingest_congressional),
                  CronTrigger(hour=8, minute=0), id="ingest_congressional")

# Market news — ingest at 6:45am ET weekdays, before newsletter generation
scheduler.add_job(lambda: _run_job("ingest_news", job_ingest_news),
                  CronTrigger(hour=6, minute=45, day_of_week="mon-fri", timezone="America/New_York"), id="ingest_news")
# AI/tech industry news (RSS, no API key) — same window, gives the newsletter
# model-launch and product-news coverage Finnhub's finance-wire feed misses
scheduler.add_job(lambda: _run_job("ingest_tech_news", job_ingest_tech_news),
                  CronTrigger(hour=6, minute=45, day_of_week="mon-fri", timezone="America/New_York"), id="ingest_tech_news")
# Geopolitics/defense news (RSS, no API key) — same window, covers wars,
# sanctions, and Congress/defense activity the finance-wire feed misses
scheduler.add_job(lambda: _run_job("ingest_geopolitics_news", job_ingest_geopolitics_news),
                  CronTrigger(hour=6, minute=45, day_of_week="mon-fri", timezone="America/New_York"), id="ingest_geopolitics_news")
# Sports news (RSS, no API key) — ESPN + BBC Sport, 7 days/week
scheduler.add_job(lambda: _run_job("ingest_sports_news", job_ingest_sports_news),
                  CronTrigger(hour=6, minute=45, timezone="America/New_York"), id="ingest_sports_news")
# Health/science news (RSS, no API key) — NPR Health + STAT News, 7 days/week
scheduler.add_job(lambda: _run_job("ingest_health_science_news", job_ingest_health_science_news),
                  CronTrigger(hour=6, minute=45, timezone="America/New_York"), id="ingest_health_science_news")
# General world/US news (RSS, no API key) — BBC World + NPR + NYT, 7 days/week
scheduler.add_job(lambda: _run_job("ingest_world_news", job_ingest_world_news),
                  CronTrigger(hour=6, minute=45, timezone="America/New_York"), id="ingest_world_news")
# Feed health monitor — alert if any RSS source goes silent for 72h
scheduler.add_job(lambda: _run_job("check_feed_health", job_check_feed_health),
                  CronTrigger(hour=8, minute=0, timezone="America/New_York"), id="check_feed_health")

# Newsletter — generate at 7:00am, send via Resend at 7:15am ET, retry at 7:45am
# Runs 7 days/week (weekend editions draw from daily feeds: sports, world, health, crypto)
scheduler.add_job(lambda: _run_job("generate_newsletter", job_generate_newsletter),
                  CronTrigger(hour=7, minute=0, timezone="America/New_York"), id="generate_newsletter")
scheduler.add_job(lambda: _run_job("send_newsletter", job_send_newsletter),
                  CronTrigger(hour=7, minute=15, timezone="America/New_York"), id="send_newsletter")
scheduler.add_job(lambda: _run_job("send_newsletter_retry", job_send_newsletter_retry),
                  CronTrigger(hour=7, minute=45, timezone="America/New_York"), id="send_newsletter_retry")
scheduler.add_job(lambda: _run_job("send_elite_briefings", job_send_elite_briefings),
                  CronTrigger(hour=7, minute=20, timezone="America/New_York"), id="send_elite_briefings")
scheduler.add_job(lambda: _run_job("send_welcome_sequence", job_send_welcome_sequence),
                  CronTrigger(hour=9, minute=0, timezone="America/New_York"), id="send_welcome_sequence")

# Resolution & accuracy — every 4 hours so intraday signals resolve same-day
scheduler.add_job(lambda: _run_job("resolve_outcomes", job_resolve_outcomes),
                  CronTrigger(hour="0,4,8,12,16,20", minute=0, timezone="UTC"), id="resolve_outcomes")
scheduler.add_job(lambda: _run_job("refresh_asset_accuracy", job_refresh_asset_accuracy),
                  CronTrigger(hour="1,5,9,13,17,21", minute=0, timezone="UTC"), id="refresh_asset_accuracy")

# Alerts — every 30 min
scheduler.add_job(lambda: _run_job("evaluate_alerts", job_evaluate_alerts),
                  IntervalTrigger(minutes=30), id="evaluate_alerts")

# Uptime monitor — every 5 min, alerts via Resend if web app is down
scheduler.add_job(lambda: _run_job("uptime_check", job_uptime_check),
                  IntervalTrigger(minutes=5), id="uptime_check")

# Portfolio allocations — notify users on the 1st of each month at 8am ET
# Actual regeneration is user-triggered via the dashboard or Pleby
scheduler.add_job(
    lambda: logger.info("Monthly allocation reminder — users should refresh their allocations"),
    CronTrigger(day=1, hour=8, minute=0, timezone="America/New_York"),
    id="monthly_allocation_reminder"
)


# ─── Health endpoint ────────────────────────────────────────────────────────
app = Flask(__name__)

@app.after_request
def add_cors(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response

@app.route("/validate-ticker", methods=["POST"])
def validate_ticker_endpoint():
    """
    Quick validation: checks if a ticker symbol is real via CoinGecko.
    Returns basic info without ingesting. Used by search to show untracked tickers.
    """
    from flask import request as flask_request

    body = flask_request.get_json(silent=True) or {}
    query = body.get("query", "").upper().strip()

    if not query or len(query) > 10:
        return jsonify({"results": []})

    results = []

    try:
        import httpx
        cg_resp = httpx.get(
            "https://api.coingecko.com/api/v3/simple/price",
            params={"ids": query.lower(), "vs_currencies": "usd"},
            timeout=5.0,
        )
        if cg_resp.status_code == 200:
            data = cg_resp.json()
            if query.lower() in data:
                results.append({
                    "identifier": query,
                    "asset_type": "crypto",
                    "name": query,
                    "price": data[query.lower()].get("usd"),
                })
    except Exception:
        pass

    return jsonify({"results": results})


@app.route("/ingest-asset", methods=["POST"])
def ingest_asset_endpoint():
    """
    On-demand ingestion for a single ticker not already in the pipeline.
    Fetches price data, indicators, and news, writes to raw_prices.
    """
    from flask import request as flask_request

    body = flask_request.get_json(silent=True) or {}
    asset_type = body.get("asset_type")
    identifier = body.get("identifier", "").upper()

    if asset_type != "crypto":
        return jsonify({"error": "Only crypto ingestion is supported"}), 400
    if not identifier:
        return jsonify({"error": "Missing identifier"}), 400

    try:
        from ingestion.crypto import _ingest_coin_ohlcv_only
        ok = _ingest_coin_ohlcv_only(identifier)

        if ok:
            return jsonify({"status": "ok", "identifier": identifier})
        return jsonify({"status": "failed", "reason": "Could not fetch data for this ticker"}), 404
    except Exception as e:
        logger.error("On-demand ingest failed for {}/{}: {}", asset_type, identifier, e)
        return jsonify({"error": str(e)}), 500


@app.route("/score-asset", methods=["POST"])
def score_asset_endpoint():
    """
    On-demand scoring for a single asset. Called by the web app
    when an Elite user views a ticker with no recent signal.
    Auto-ingests if no price data exists yet.
    """
    from flask import request as flask_request
    from scoring.engine import score_asset

    body = flask_request.get_json(silent=True) or {}
    asset_type = body.get("asset_type")
    identifier = body.get("identifier", "").upper()

    if asset_type not in ("stock", "crypto", "prediction"):
        return jsonify({"error": "Invalid asset_type"}), 400
    if not identifier:
        return jsonify({"error": "Missing identifier"}), 400

    # Auto-ingest if no price data exists
    from supabase_client import supabase
    price_check = supabase.table("raw_prices") \
        .select("id") \
        .eq("asset_type", asset_type) \
        .eq("identifier", identifier) \
        .limit(1) \
        .execute()

    if not price_check.data and asset_type == "crypto":
        logger.info("No price data for {}/{}, auto-ingesting first", asset_type, identifier)
        try:
            from ingestion.crypto import _ingest_coin_ohlcv_only
            _ingest_coin_ohlcv_only(identifier)
        except Exception as e:
            logger.warning("Auto-ingest failed for {}/{}: {}", asset_type, identifier, e)

    subscription = body.get("subscription")

    try:
        result = score_asset(asset_type, identifier, skip_hold=False, subscription=subscription)
        if result is None:
            return jsonify({"status": "skipped", "reason": "recently scored or no data"})

        from scoring.engine import format_signal_for_tier
        filtered = format_signal_for_tier(result, subscription)
        if filtered is None:
            return jsonify({
                "status": "rejected",
                "reason": f"{asset_type} not available on this subscription tier",
            }), 403
        return jsonify({"status": "ok", "signal": filtered})
    except Exception as e:
        logger.error("On-demand score failed for {}/{}: {}", asset_type, identifier, e)
        return jsonify({"error": str(e)}), 500


@app.route("/score-now", methods=["GET", "POST"])
def score_now():
    """
    Manually trigger ingestion + scoring for all asset types.
    Runs in background since it takes a few minutes.
    """
    import threading
    import traceback

    def _run():
        try:
            _job_state["score_now"] = {
                "last_run": datetime.now(timezone.utc).isoformat(),
                "status": "running",
            }

            from ingestion.crypto import ingest_crypto
            from ingestion.prediction_markets import ingest_prediction_markets
            from scoring.rules_engine import score_crypto_rules
            from scoring.engine import score_prediction_markets

            results = {}
            results["ingest_crypto"] = ingest_crypto()
            results["ingest_predictions"] = ingest_prediction_markets()
            results["score_crypto"] = score_crypto_rules()
            results["score_predictions"] = score_prediction_markets()

            _job_state["score_now"] = {
                "last_run": datetime.now(timezone.utc).isoformat(),
                "status": "ok",
                "results": results,
            }
            logger.info("Manual score-now complete: {}", results)
        except Exception as e:
            tb = traceback.format_exc()
            _job_state["score_now"] = {
                "last_run": datetime.now(timezone.utc).isoformat(),
                "status": "error",
                "error": str(e),
                "traceback": tb,
            }
            logger.error("Manual score-now failed: {}\n{}", e, tb)

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()

    return jsonify({
        "status": "started",
        "message": "Ingestion + scoring running in background. Check /score-now/status for results.",
    })


@app.route("/score-now/status")
def score_now_status():
    state = _job_state.get("score_now", {"status": "never_run"})
    return jsonify(state)


STOCK_MARKET_HOURS_JOBS: set[str] = set()


@app.route("/run-job/<job_name>", methods=["POST"])
def run_job_manual(job_name: str):
    """Manually trigger any registered job by name.

    Stock-specific jobs skip outside market hours (weekend/holiday) unless
    {"force": true} is passed -- otherwise they generate real signals off
    stale data with no guard, same as the scheduled path would skip via
    _is_market_open()/day_of_week, but manual calls bypass both entirely."""
    import threading
    import traceback
    from flask import request as flask_request

    forced_outside_market_hours = False
    if job_name in STOCK_MARKET_HOURS_JOBS and not _is_market_open():
        body = flask_request.get_json(silent=True) or {}
        if not body.get("force"):
            return jsonify({
                "status": "skipped",
                "job": job_name,
                "reason": "market closed (weekend/holiday) — pass {\"force\": true} to override for debugging",
            })
        forced_outside_market_hours = True

    job_map = {
        "ingest_congressional": job_ingest_congressional,
        "resolve_outcomes": job_resolve_outcomes,
        "refresh_asset_accuracy": job_refresh_asset_accuracy,
        "ingest_news": job_ingest_news,
        "ingest_tech_news": job_ingest_tech_news,
        "ingest_geopolitics_news": job_ingest_geopolitics_news,
        "ingest_sports_news": job_ingest_sports_news,
        "ingest_health_science_news": job_ingest_health_science_news,
        "ingest_world_news": job_ingest_world_news,
        "check_feed_health": job_check_feed_health,
        "ingest_crypto": job_ingest_crypto,
        "ingest_prediction_markets": job_ingest_prediction_markets,
        "score_crypto": job_score_crypto,
        "score_prediction_markets": job_score_prediction_markets,
        "score_crypto_rules": job_score_crypto,
        "crypto_momentum": job_crypto_momentum,
        "ingest_apewisdom": job_ingest_apewisdom,
        "generate_newsletter": job_generate_newsletter,
        "send_newsletter": job_send_newsletter,
        "send_elite_briefings": job_send_elite_briefings,
        "ingest_whale_alerts": job_ingest_whale_alerts,
    }

    fn = job_map.get(job_name)
    if not fn:
        return jsonify({"error": f"Unknown job: {job_name}", "available": list(job_map.keys())}), 404

    def _run():
        import scoring.engine as _engine
        if forced_outside_market_hours:
            _engine.STALE_TEST_MODE = True
            logger.warning("Manual {}: forced outside market hours — tagging any signals is_stale_test=true", job_name)
        try:
            _job_state[f"manual_{job_name}"] = {"status": "running", "started": datetime.now(timezone.utc).isoformat()}
            result = fn()
            _job_state[f"manual_{job_name}"] = {"status": "ok", "result": str(result), "finished": datetime.now(timezone.utc).isoformat()}
            logger.info("Manual {}: {}", job_name, result)
        except Exception as e:
            _job_state[f"manual_{job_name}"] = {"status": "error", "error": str(e), "traceback": traceback.format_exc()}
            logger.error("Manual {} failed: {}", job_name, e)
        finally:
            if forced_outside_market_hours:
                _engine.STALE_TEST_MODE = False

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()
    return jsonify({"status": "started", "job": job_name, "check": f"/run-job/{job_name}/status"})


@app.route("/run-job/<job_name>/status")
def run_job_status(job_name: str):
    state = _job_state.get(f"manual_{job_name}", {"status": "never_run"})
    return jsonify(state)


@app.route("/whale-alerts")
def whale_alerts_endpoint():
    """Serve recent whale alerts for the frontend."""
    from flask import request as flask_request
    limit = flask_request.args.get("limit", 20, type=int)
    limit = min(limit, 100)
    alerts = get_recent_whale_alerts(limit)
    return jsonify({"alerts": alerts, "count": len(alerts)})


@app.route("/api/v1/scanners/prediction-markets/trigger", methods=["POST"])
def trigger_prediction_scan():
    """On-demand prediction market scan — call 5 min after CPI/FOMC/Jobs via webhook."""
    import threading
    from flask import request as flask_request

    body = flask_request.get_json(silent=True) or {}
    catalyst = body.get("catalyst", "manual")

    def _run():
        try:
            _job_state["prediction_trigger"] = {
                "status": "running", "catalyst": catalyst,
                "started": datetime.now(timezone.utc).isoformat(),
            }
            ingest_result = job_ingest_prediction_markets()
            score_result = job_score_prediction_markets()
            _job_state["prediction_trigger"] = {
                "status": "ok", "catalyst": catalyst,
                "ingest": str(ingest_result), "score": str(score_result),
                "finished": datetime.now(timezone.utc).isoformat(),
            }
            logger.info("Prediction trigger ({}): ingest={}, score={}", catalyst, ingest_result, score_result)
        except Exception as e:
            import traceback
            _job_state["prediction_trigger"] = {
                "status": "error", "catalyst": catalyst,
                "error": str(e), "traceback": traceback.format_exc(),
            }
            logger.error("Prediction trigger ({}) failed: {}", catalyst, e)

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()
    return jsonify({
        "status": "started",
        "catalyst": catalyst,
        "check": "/api/v1/scanners/prediction-markets/trigger/status",
    })


@app.route("/api/v1/scanners/prediction-markets/trigger/status")
def trigger_prediction_status():
    state = _job_state.get("prediction_trigger", {"status": "never_run"})
    return jsonify(state)


@app.route("/api/v1/reddit-trending")
def reddit_trending():
    """Reddit trending tickers from ApeWisdom. Used by the dashboard widget."""
    from flask import request as flask_request
    from ingestion.apewisdom import get_trending_tickers
    limit = min(int(flask_request.args.get("limit", 20)), 50)
    return jsonify({"trending": get_trending_tickers(limit=limit)})


@app.route("/score-now/debug")
def score_now_debug():
    """
    Run just crypto ingestion + scoring in foreground so errors are visible.
    """
    import traceback

    # Show what the app sees for Supabase config (redacted)
    env_diag = {}
    url = os.environ.get("SUPABASE_URL", "")
    key1 = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    key2 = os.environ.get("SUPABASE_SERVICE_ROLE_KEY_", "")
    env_diag["SUPABASE_URL"] = f"{url[:30]}..." if url else "NOT SET"
    env_diag["SUPABASE_SERVICE_ROLE_KEY"] = f"SET ({len(key1)} chars)" if key1 else "NOT SET"
    env_diag["SUPABASE_SERVICE_ROLE_KEY_"] = f"SET ({len(key2)} chars)" if key2 else "NOT SET"
    env_diag["key_used"] = "SUPABASE_SERVICE_ROLE_KEY" if key1 else ("SUPABASE_SERVICE_ROLE_KEY_" if key2 else "NONE")

    # Test a direct Supabase insert
    db_test = {}
    try:
        from supabase_client import supabase
        supabase.table("raw_prices").insert({
            "asset_type": "crypto", "identifier": "DIAG_TEST",
            "price": 1.0, "volume": 1.0, "change_24h": 0.0,
            "metadata": {"test": True},
        }).execute()
        supabase.table("raw_prices").delete().eq("identifier", "DIAG_TEST").execute()
        db_test["insert"] = "OK"
    except Exception as e:
        db_test["insert"] = f"FAILED: {e}"

    steps = {}
    try:
        from ingestion.crypto import ingest_crypto
        steps["ingest_crypto"] = ingest_crypto()
    except Exception as e:
        steps["ingest_crypto_error"] = traceback.format_exc()
        return jsonify({"status": "error", "env": env_diag, "db_test": db_test, "steps": steps})

    try:
        from scoring.rules_engine import score_crypto_rules
        steps["score_crypto"] = score_crypto_rules()
    except Exception as e:
        steps["score_crypto_error"] = traceback.format_exc()
        return jsonify({"status": "error", "env": env_diag, "db_test": db_test, "steps": steps})

    return jsonify({"status": "ok", "env": env_diag, "db_test": db_test, "steps": steps})


@app.route("/diag/crypto-indicators")
def diag_crypto_indicators():
    """Show current indicator data for CORE_CRYPTO — diagnostic only."""
    from scoring.price_data import get_scoring_price_row
    from scoring.engine import CORE_CRYPTO, _get_fear_greed
    from supabase_client import supabase as sb
    from datetime import timedelta

    results = {}
    cutoff_5d = (datetime.now(timezone.utc) - timedelta(days=5)).isoformat()
    for sym in sorted(CORE_CRYPTO):
        row = get_scoring_price_row("crypto", sym)
        if not row:
            results[sym] = {"error": "no data"}
            continue
        meta = row.get("metadata") or {}

        ind_count = 0
        try:
            r = (sb.table("raw_prices").select("id", count="exact")
                 .eq("asset_type", "crypto").eq("identifier", sym)
                 .filter("metadata->rsi_14", "not.is", "null")
                 .gte("captured_at", cutoff_5d).execute())
            ind_count = r.count or 0
        except Exception:
            pass

        total_count = 0
        try:
            r = (sb.table("raw_prices").select("id", count="exact")
                 .eq("asset_type", "crypto").eq("identifier", sym)
                 .gte("captured_at", cutoff_5d).execute())
            total_count = r.count or 0
        except Exception:
            pass

        results[sym] = {
            "price": row.get("price"),
            "change_24h": row.get("change_24h"),
            "rsi_14": meta.get("rsi_14"),
            "macd_hist": meta.get("macd_hist"),
            "macd_line": meta.get("macd_line"),
            "macd_signal": meta.get("macd_signal"),
            "prev_macd_hist": meta.get("prev_macd_hist"),
            "volume_ratio": meta.get("volume_ratio"),
            "captured_at": row.get("captured_at"),
            "sources": meta.get("sources"),
            "rows_5d_total": total_count,
            "rows_5d_with_indicators": ind_count,
        }
    fg = _get_fear_greed()

    ohlcv_test = {}
    try:
        from ingestion.crypto import _fetch_ohlcv
        for sym in ("BTC", "ETH"):
            df = _fetch_ohlcv(sym)
            if df is None:
                ohlcv_test[sym] = "ALL SOURCES FAILED"
            else:
                ohlcv_test[sym] = f"{len(df)} rows, cols={list(df.columns)}, range={df.index.min()} to {df.index.max()}"
    except Exception as e:
        ohlcv_test["error"] = str(e)

    return jsonify({"fear_greed": fg, "indicators": results, "ohlcv_live_test": ohlcv_test})


@app.route("/resolve-now", methods=["GET", "POST"])
def resolve_now():
    """
    Manually trigger resolver + accuracy refresh right now.
    Runs in foreground so you get results immediately.
    """
    from scoring.resolver import resolve_outcomes
    from scoring.accuracy import refresh_asset_accuracy
    from supabase_client import supabase

    # Diagnostic: count signals by outcome
    diag = {}
    try:
        for outcome in ("PENDING", "WIN", "LOSS", "NEUTRAL"):
            r = (
                supabase.table("signals")
                .select("id", count="exact")
                .eq("outcome", outcome)
                .eq("is_backtest", False)
                .execute()
            )
            diag[outcome] = r.count or 0
        diag["total"] = sum(diag.values())
    except Exception as e:
        diag = {"error": str(e)}

    resolver_result = resolve_outcomes()
    accuracy_result = refresh_asset_accuracy()

    _job_state["manual_resolve"] = {
        "last_run": datetime.now(timezone.utc).isoformat(),
        "resolver": resolver_result,
        "accuracy": accuracy_result,
    }

    return jsonify({
        "status": "ok",
        "resolver": resolver_result,
        "accuracy": accuracy_result,
        "signal_counts": diag,
    })

@app.route("/send-newsletter-now", methods=["GET", "POST"])
def send_newsletter_now():
    """Manually trigger today's newsletter send. Optionally send to a single email."""
    from flask import request as flask_request
    body = flask_request.get_json(silent=True) or {}
    single_email = body.get("email") or flask_request.args.get("email")
    # Defaults to "free" to preserve prior behavior. Pass tier=pro/elite to
    # preview the paid rendering (signals + options flow cards) -- this was
    # previously hardcoded to "free" with no way to test the paid path at all.
    tier = (body.get("tier") or flask_request.args.get("tier") or "free").lower()
    if tier not in ("free", "pro", "elite"):
        return jsonify({"error": f"Invalid tier '{tier}' — must be free, pro, or elite"}), 400

    if single_email:
        from briefing.newsletter_emailer import _get_todays_newsletter, _render_html, _render_text, _resolve_prediction_titles
        import resend as _resend
        _resend.api_key = os.environ.get("RESEND_API_KEY", "") or os.environ.get("RESEND_API_KEY_", "")

        briefing = _get_todays_newsletter()
        if not briefing:
            return jsonify({"error": "No briefing found for today"}), 404

        from datetime import date as _date
        subject = briefing.get("headline", f"Plebs — {_date.today().strftime('%b %-d')}")
        prediction_titles = _resolve_prediction_titles((briefing.get("content_json") or {}).get("top_signals", []))
        html_body = _render_html(briefing, tier, None, prediction_titles)
        text_body = _render_text(briefing)

        try:
            _resend.Emails.send({
                "from": "Pleby from Plebs <daily@plebs.finance>",
                "to": [single_email],
                "subject": subject,
                "html": html_body,
                "text": text_body,
            })
            return jsonify({"status": "ok", "sent_to": single_email, "subject": subject, "tier": tier})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    result = send_newsletter()
    return jsonify({"status": "ok", "result": result})


@app.route("/health")
def health():
    from supabase_client import supabase
    try:
        signals_today = (
            supabase.table("signals")
            .select("id", count="exact")
            .gte("created_at", datetime.now(timezone.utc).date().isoformat())
            .execute()
        ).count or 0
    except Exception:
        signals_today = -1

    jobs = [{"id": job.id, "next_run": str(job.next_run_time)} for job in scheduler.get_jobs()]

    errors_24h = sum(1 for s in _job_state.values() if s.get("status") == "error")

    return jsonify({
        "status": "ok",
        "scheduler_running": scheduler.running,
        "signals_today": signals_today,
        "errors_24h": errors_24h,
        "job_states": _job_state,
        "scheduled_jobs": jobs,
    })


# ─── Accuracy dashboard endpoint ───────────────────────────────────────────

@app.route("/accuracy")
def accuracy_dashboard():
    """
    Live accuracy dashboard — win rate by asset class, top/bottom tickers,
    overall stats. Reads from asset_accuracy table (refreshed nightly).
    """
    from supabase_client import supabase

    try:
        result = (
            supabase.table("asset_accuracy")
            .select("*")
            .order("last_updated", desc=True)
            .execute()
        )
        rows = result.data or []
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    if not rows:
        return jsonify({"message": "No accuracy data yet — resolver hasn't run"})

    total_wins    = sum(r.get("wins", 0) for r in rows)
    total_losses  = sum(r.get("losses", 0) for r in rows)
    total_neutral = sum(r.get("neutrals", 0) for r in rows)
    total_signals = sum(r.get("total_signals", 0) for r in rows)
    decisive      = total_wins + total_losses

    by_class = {}
    for asset_type in ("stock", "crypto", "prediction"):
        class_rows  = [r for r in rows if r.get("asset_type") == asset_type]
        class_wins  = sum(r.get("wins", 0) for r in class_rows)
        class_loss  = sum(r.get("losses", 0) for r in class_rows)
        class_dec   = class_wins + class_loss
        class_sigs  = sum(r.get("total_signals", 0) for r in class_rows)

        ranked = sorted(
            [r for r in class_rows if (r.get("wins", 0) + r.get("losses", 0)) >= 3],
            key=lambda r: r.get("win_rate") or 0,
            reverse=True,
        )

        by_class[asset_type] = {
            "total_signals":  class_sigs,
            "wins":           class_wins,
            "losses":         class_loss,
            "win_rate":       round(class_wins / class_dec * 100, 1) if class_dec else None,
            "tracked_assets": len(class_rows),
            "top_5": [
                {"identifier": r["identifier"], "win_rate": r.get("win_rate"),
                 "signals": r.get("total_signals")}
                for r in ranked[:5]
            ],
            "bottom_5": [
                {"identifier": r["identifier"], "win_rate": r.get("win_rate"),
                 "signals": r.get("total_signals")}
                for r in ranked[-5:]
            ] if len(ranked) > 5 else [],
        }

    # Options-flow-driven signals are written as regular "stock" signals (see
    # _write_options_signal) with a "[Options flow] " reasoning prefix rather
    # than a distinct asset_type, so they're indistinguishable from ordinary
    # stock signals in asset_accuracy, which aggregates by (identifier,
    # asset_type) and loses that distinction. Query signals directly instead
    # of the pre-aggregated table to isolate them. This is live forward
    # tracking, not a backtest -- there's no historical options-chain data in
    # this pipeline to backtest against (see CLAUDE.md launch checklist).
    try:
        of_result = (
            supabase.table("signals")
            .select("outcome")
            .like("reasoning", "[Options flow]%")
            .eq("is_backtest", False)
            .execute()
        )
        of_rows     = of_result.data or []
        of_wins     = sum(1 for r in of_rows if r["outcome"] == "WIN")
        of_losses   = sum(1 for r in of_rows if r["outcome"] == "LOSS")
        of_decisive = of_wins + of_losses
        options_flow_accuracy = {
            "total_signals": len(of_rows),
            "wins":          of_wins,
            "losses":        of_losses,
            "pending":       sum(1 for r in of_rows if r["outcome"] == "PENDING"),
            "win_rate":      round(of_wins / of_decisive * 100, 1) if of_decisive else None,
            "note": ("Live forward-tracked accuracy, not backtested — no historical "
                     "options-chain data exists in this pipeline to backtest against."),
        }
    except Exception as e:
        options_flow_accuracy = {"error": str(e)}

    return jsonify({
        "overall": {
            "total_signals":   total_signals,
            "wins":            total_wins,
            "losses":          total_losses,
            "neutral":         total_neutral,
            "decisive":        decisive,
            "win_rate":        round(total_wins / decisive * 100, 1) if decisive else None,
            "tracked_assets":  len(rows),
        },
        "by_asset_class": by_class,
        "options_flow":   options_flow_accuracy,
        "last_updated": rows[0].get("last_updated") if rows else None,
    })


# ─── Backtest endpoint ────────────────────────────────────────────────────
@app.route("/backtest", methods=["GET", "POST"])
def run_backtest_endpoint():
    """
    Trigger the historical backtest from Railway.
    POST /backtest
    Optional JSON body: {"write_db": true, "output_dir": "/tmp/backtest"}
    Returns aggregate results JSON.
    """
    from flask import request as flask_request
    from analysis.backtest import run_backtest, _print_report
    import threading

    body       = flask_request.get_json(silent=True) or {}
    write_db   = bool(body.get("write_db", False))
    output_dir = str(body.get("output_dir", "/tmp/backtest"))

    def _run():
        try:
            agg = run_backtest(write_db=write_db, output_dir=output_dir)
            _job_state["backtest"] = {
                "last_run": datetime.now(timezone.utc).isoformat(),
                "status": "ok",
                "summary": {
                    "final_portfolio":   agg.get("paper_trading", {}).get("final_portfolio"),
                    "total_return_pct":  agg.get("paper_trading", {}).get("total_return_pct"),
                    "max_drawdown_pct":  agg.get("paper_trading", {}).get("max_drawdown_pct"),
                    "win_rate":          agg.get("win_rate"),
                    "sharpe_ratio":      agg.get("sharpe_ratio"),
                    "date_range":        agg.get("date_range"),
                    "actionable_signals": agg.get("actionable_signals"),
                    "buy_win_rate":      agg.get("buy_win_rate"),
                    "sell_win_rate":     agg.get("sell_win_rate"),
                    "by_asset_class":    agg.get("by_asset_class"),
                    "by_archetype":      agg.get("by_archetype"),
                    "paper_by_direction": agg.get("paper_trading", {}).get("by_direction"),
                    "worst_individual_signals": agg.get("worst_individual_signals"),
                    "json_path": agg.get("json_path"),
                },
            }
            _print_report(agg)
        except Exception as e:
            _job_state["backtest"] = {
                "last_run": datetime.now(timezone.utc).isoformat(),
                "status": "error",
                "error": str(e),
            }
            logger.error("Backtest failed: {}", e)

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()

    return jsonify({
        "status": "started",
        "message": "Backtest running in background. Check /backtest/status for results.",
        "write_db": write_db,
        "output_dir": output_dir,
    })


@app.route("/backtest/status")
def backtest_status():
    state = _job_state.get("backtest", {"status": "never_run"})
    return jsonify(state)


@app.route("/factor-discovery", methods=["GET", "POST"])
def run_factor_discovery_endpoint():
    """
    Empirical, model-free study of which technical-indicator states actually
    predicted forward returns over the past ~10 months, train/test split.
    No LLM calls, no pre-baked scoring weights.
    POST /factor-discovery
    """
    from flask import request as flask_request
    from analysis.factor_discovery import run_factor_discovery
    import threading

    body       = flask_request.get_json(silent=True) or {}
    output_dir = str(body.get("output_dir", "/tmp/factor_discovery"))

    def _run():
        try:
            agg = run_factor_discovery(output_dir=output_dir)
            _job_state["factor_discovery"] = {
                "last_run": datetime.now(timezone.utc).isoformat(),
                "status": "ok" if "error" not in agg else "error",
                "summary": agg,
            }
        except Exception as e:
            _job_state["factor_discovery"] = {
                "last_run": datetime.now(timezone.utc).isoformat(),
                "status": "error",
                "error": str(e),
            }
            logger.error("Factor discovery failed: {}", e)

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()

    return jsonify({
        "status": "started",
        "message": "Factor discovery running in background. Check /factor-discovery/status for results.",
        "output_dir": output_dir,
    })


@app.route("/factor-discovery/status")
def factor_discovery_status():
    state = _job_state.get("factor_discovery", {"status": "never_run"})
    return jsonify(state)


# ─── Claude backtest endpoint ──────────────────────────────────────────

@app.route("/backtest/claude", methods=["GET", "POST"])
def run_claude_backtest_endpoint():
    """
    Run sampled Claude backtest — calls the real scoring engine on historical
    data points. ~40 API calls, ~$0.50.
    POST /backtest/claude
    """
    from flask import request as flask_request
    from analysis.claude_backtest import run_claude_backtest
    import threading

    body        = flask_request.get_json(silent=True) or {}
    output_dir  = str(body.get("output_dir", "/tmp/claude_backtest"))
    stocks_only = bool(body.get("stocks_only", False)) or flask_request.args.get("stocks_only") == "true"

    def _run():
        import traceback
        _job_state["claude_backtest"] = {
            "status": "running",
            "started_at": datetime.now(timezone.utc).isoformat(),
            "mode": "stocks_only" if stocks_only else "full",
        }
        try:
            crypto_list = [] if stocks_only else None
            agg = run_claude_backtest(output_dir=output_dir, crypto=crypto_list)
            _job_state["claude_backtest"] = {
                "last_run": datetime.now(timezone.utc).isoformat(),
                "status": "ok",
                "summary": {
                    "total_signals": agg.get("total_signals", 0),
                    "win_rate":      agg.get("win_rate", 0),
                    "api_calls":     agg.get("api_calls", 0),
                    "errors":        agg.get("errors", 0),
                    "avg_return":    agg.get("avg_return_pct", 0),
                    "avg_win_pct":   agg.get("avg_win_pct", 0),
                    "avg_loss_pct":  agg.get("avg_loss_pct", 0),
                    "profit_factor": agg.get("profit_factor", 0),
                    "portfolio_sim": agg.get("portfolio_sim", {}),
                    "by_asset_class": agg.get("by_asset_class", {}),
                    "by_time_horizon": agg.get("by_time_horizon", {}),
                    "by_direction": agg.get("by_direction", {}),
                    "filters": agg.get("filters", {}),
                    "error_samples": agg.get("error_samples", []),
                },
                "signals": agg.get("signals", []),
            }
        except Exception as e:
            _job_state["claude_backtest"] = {
                "last_run": datetime.now(timezone.utc).isoformat(),
                "status": "error",
                "error": str(e),
                "traceback": traceback.format_exc(),
            }
            logger.error("Claude backtest failed: {}", e)

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()

    return jsonify({
        "status": "started",
        "message": "Claude backtest running in background. Check /backtest/claude/status for results.",
        "output_dir": output_dir,
    })


@app.route("/backtest/claude/status")
def claude_backtest_status():
    state = _job_state.get("claude_backtest", {"status": "never_run"})
    return jsonify(state)


@app.route("/backtest/rules", methods=["GET", "POST"])
def run_rules_backtest_endpoint():
    """
    Run rules-engine backtest — deterministic pattern matching, $0 API cost.
    POST /backtest/rules
    """
    from flask import request as flask_request
    from analysis.claude_backtest import run_rules_backtest
    import threading

    body = flask_request.get_json(silent=True) or {}
    output_dir = str(body.get("output_dir", "/tmp/rules_backtest"))
    stocks_only = bool(body.get("stocks_only", False)) or flask_request.args.get("stocks_only") == "true"

    def _run():
        import traceback
        _job_state["rules_backtest"] = {
            "status": "running",
            "started_at": datetime.now(timezone.utc).isoformat(),
            "mode": "stocks_only" if stocks_only else "full",
        }
        try:
            crypto_list = [] if stocks_only else None
            agg = run_rules_backtest(output_dir=output_dir, crypto=crypto_list)
            _job_state["rules_backtest"] = {
                "last_run": datetime.now(timezone.utc).isoformat(),
                "status": "ok",
                "summary": {
                    "total_signals": agg.get("total_signals", 0),
                    "win_rate":      agg.get("win_rate", 0),
                    "avg_return":    agg.get("avg_return_pct", 0),
                    "profit_factor": agg.get("profit_factor", 0),
                    "stocks":        agg.get("by_asset_class", {}).get("stocks", {}),
                    "crypto":        agg.get("by_asset_class", {}).get("crypto", {}),
                    "portfolio_sim": agg.get("portfolio_sim", {}),
                    "filters":       agg.get("filters", {}),
                    "api_cost":      "$0.00",
                },
                "signals": agg.get("signals", []),
                "stock_diagnostics": agg.get("stock_diagnostics"),
            }
        except Exception as e:
            _job_state["rules_backtest"] = {
                "last_run": datetime.now(timezone.utc).isoformat(),
                "status": "error",
                "error": str(e),
                "traceback": traceback.format_exc(),
            }
            logger.error("Rules backtest failed: {}", e)

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()

    return jsonify({
        "status": "started",
        "message": "Rules backtest running in background ($0 cost). Check /backtest/rules/status for results.",
        "output_dir": output_dir,
    })


@app.route("/backtest/rules/status")
def rules_backtest_status():
    state = _job_state.get("rules_backtest", {"status": "never_run"})
    return jsonify(state)


@app.route("/backfill-alpaca", methods=["GET", "POST"])
def backfill_alpaca():
    """Backfill crypto bars from Alpaca. Writes to raw_prices."""
    from flask import request as flask_request
    import threading

    body = flask_request.get_json(silent=True) or {}
    days = int(body.get("days", 60))

    def _run():
        from supabase_client import supabase
        from ingestion.alpaca_client import fetch_crypto_bars, _is_configured
        from ingestion.crypto import PRIORITY_SYMBOLS, _compute_crypto_indicators

        if not _is_configured():
            _job_state["backfill_alpaca"] = {"status": "error", "error": "ALPACA_API_KEY or ALPACA_API_SECRET not set"}
            return

        _job_state["backfill_alpaca"] = {"status": "running", "started": datetime.now(timezone.utc).isoformat()}
        results = {"crypto": {"success": 0, "failed": 0, "errors": []}}

        for symbol in PRIORITY_SYMBOLS:
            try:
                df = fetch_crypto_bars(symbol, days=days)
                if df is None or df.empty:
                    results["crypto"]["failed"] += 1
                    results["crypto"]["errors"].append(f"{symbol}: no data returned")
                    continue
                indicators = _compute_crypto_indicators(df)
                supabase.table("raw_prices").insert({
                    "asset_type": "crypto",
                    "identifier": symbol,
                    "price": indicators["close"],
                    "volume": indicators.get("volume_24h"),
                    "change_24h": None,
                    "metadata": {**indicators, "source": "alpaca_backfill"},
                }).execute()
                results["crypto"]["success"] += 1
            except Exception as e:
                logger.warning("Backfill failed for {}: {}", symbol, e)
                results["crypto"]["failed"] += 1
                results["crypto"]["errors"].append(f"{symbol}: {e}")
            import time
            time.sleep(0.3)

        results["crypto"]["errors"] = results["crypto"]["errors"][:5]
        _job_state["backfill_alpaca"] = {"status": "ok", "finished": datetime.now(timezone.utc).isoformat(), "results": results}
        logger.info("Alpaca backfill complete: {}", results)

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()
    return jsonify({"status": "started", "days": days, "check": "/backfill-alpaca/status"})


@app.route("/backfill-alpaca/status")
def backfill_alpaca_status():
    state = _job_state.get("backfill_alpaca", {"status": "never_run"})
    return jsonify(state)


@app.route("/alpaca-test")
def alpaca_test():
    """Quick diagnostic: test Alpaca crypto API."""
    import httpx
    key = os.environ.get("ALPACA_API_KEY", "")
    secret = os.environ.get("ALPACA_API_SECRET", "")
    results = {
        "key_set": bool(key),
        "secret_set": bool(secret),
        "key_prefix": key[:8] + "..." if len(key) > 8 else "(short)",
    }
    headers = {"APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret}
    try:
        resp = httpx.get(
            "https://data.alpaca.markets/v1beta3/crypto/us/bars",
            params={"symbols": "BTC/USD", "timeframe": "1Day", "limit": 1},
            headers=headers,
            timeout=10,
        )
        results["crypto_test"] = {
            "status": resp.status_code,
            "body": resp.text[:300] if resp.status_code != 200 else f"{len(resp.json().get('bars', {}).get('BTC/USD', []))} bars",
        }
    except Exception as e:
        results["crypto_test"] = {"error": str(e)}
    return jsonify(results)


@app.route("/scanner")
def scanner_endpoint():
    """Stock scanner disabled (crypto-only pivot)."""
    return jsonify({"status": "disabled", "reason": "Stock scanner removed in crypto-only pivot"})


@app.route("/backtest/diag")
def backtest_data_diagnostic():
    """
    Zero-cost data-layer check — tries all 4 stock sources for a few tickers
    and reports exactly what each returns. No Claude calls, no cost.
    Use ?tickers=AAPL,NVDA to override the default sample.
    """
    from flask import request as flask_request
    from analysis.claude_backtest import diagnose_stock_sources

    raw = flask_request.args.get("tickers", "")
    tickers = [t.strip().upper() for t in raw.split(",") if t.strip()] or None
    try:
        return jsonify(diagnose_stock_sources(tickers))
    except Exception as e:
        import traceback
        return jsonify({"status": "error", "error": str(e),
                        "traceback": traceback.format_exc()}), 500


@app.route("/pipeline-check")
def pipeline_check():
    """
    One-stop diagnostic: checks every data pipeline for recent data,
    reports what's working, what's empty, and why.
    """
    from supabase_client import supabase
    from datetime import date as _date, timedelta as _td

    checks = {}
    cutoff_7d = (datetime.now(timezone.utc) - _td(days=7)).isoformat()
    cutoff_30d = (datetime.now(timezone.utc) - _td(days=30)).isoformat()

    def _count(table, since=None, extra_filters=None, date_column="created_at"):
        try:
            q = supabase.table(table).select("id", count="exact")
            if since:
                q = q.gte(date_column, since)
            if extra_filters:
                for k, v in extra_filters.items():
                    q = q.eq(k, v)
            return q.execute().count or 0
        except Exception as e:
            return f"error: {e}"

    def _count_date(table, date_col="trade_date", since=None):
        try:
            q = supabase.table(table).select("id", count="exact")
            if since:
                q = q.gte(date_col, since)
            return q.execute().count or 0
        except Exception as e:
            return f"error: {e}"

    checks["signals"] = {
        "total": _count("signals"),
        "last_7d": _count("signals", since=cutoff_7d),
        "stocks_7d": _count("signals", since=cutoff_7d, extra_filters={"asset_type": "stock"}),
        "crypto_7d": _count("signals", since=cutoff_7d, extra_filters={"asset_type": "crypto"}),
    }

    try:
        since_cutoff = "2026-06-22"
        q = supabase.table("signals").select("outcome, confidence", count="exact").gte("created_at", since_cutoff).execute()
        rows = q.data or []
        wins = sum(1 for r in rows if r.get("outcome") == "win")
        losses = sum(1 for r in rows if r.get("outcome") == "loss")
        pending = sum(1 for r in rows if r.get("outcome") in (None, "PENDING", "pending"))
        total = len(rows)
        decisive = wins + losses

        by_bracket = {}
        for bracket_name, lo, hi in [("50-59", 50, 59), ("60-69", 60, 69), ("70-79", 70, 79), ("80-89", 80, 89), ("90-100", 90, 100)]:
            b_rows = [r for r in rows if lo <= (r.get("confidence") or 0) <= hi]
            b_wins = sum(1 for r in b_rows if r.get("outcome") == "win")
            b_losses = sum(1 for r in b_rows if r.get("outcome") == "loss")
            b_dec = b_wins + b_losses
            by_bracket[bracket_name] = {
                "total": len(b_rows),
                "wins": b_wins,
                "losses": b_losses,
                "pending": len(b_rows) - b_wins - b_losses,
                "win_rate": round(b_wins / b_dec * 100, 1) if b_dec else None,
            }

        checks["performance_since_june22"] = {
            "total": total,
            "wins": wins,
            "losses": losses,
            "pending": pending,
            "decisive": decisive,
            "win_rate": round(wins / decisive * 100, 1) if decisive else None,
            "by_confidence_bracket": by_bracket,
        }
    except Exception as e:
        checks["performance_since_june22"] = f"error: {e}"

    checks["congressional_trades"] = {
        "total": _count_date("congressional_trades"),
        "last_30d": _count_date("congressional_trades", since=(datetime.now(timezone.utc) - _td(days=30)).strftime("%Y-%m-%d")),
    }

    checks["insider_trades"] = {
        "total": _count_date("insider_trades"),
        "last_30d": _count_date("insider_trades", since=(datetime.now(timezone.utc) - _td(days=30)).strftime("%Y-%m-%d")),
    }

    checks["prediction_markets"] = {
        "total_raw_prices": _count("raw_prices", extra_filters={"asset_type": "prediction"}, date_column="captured_at"),
        "last_7d": _count("raw_prices", since=cutoff_7d, extra_filters={"asset_type": "prediction"}, date_column="captured_at"),
        "scoring_enabled": True,
        "note": "Ingestion every 30min, scoring every 2h.",
    }

    checks["raw_prices_7d"] = {
        "stocks": _count("raw_prices", since=cutoff_7d, extra_filters={"asset_type": "stock"}, date_column="captured_at"),
        "crypto": _count("raw_prices", since=cutoff_7d, extra_filters={"asset_type": "crypto"}, date_column="captured_at"),
    }

    checks["news_items_7d"] = _count("news_items", since=cutoff_7d)

    checks["env_keys"] = {
        "FMP_API_KEY": "set" if os.environ.get("FMP_API_KEY") else "MISSING",
        "ANTHROPIC_API_KEY": "set" if os.environ.get("ANTHROPIC_API_KEY") else "MISSING",
        "ALPACA_API_KEY": "set" if os.environ.get("ALPACA_API_KEY") else "MISSING",
        "ALPACA_API_SECRET": "set" if os.environ.get("ALPACA_API_SECRET") else "MISSING",
        "KALSHI_API_KEY": "set" if os.environ.get("KALSHI_API_KEY") else "MISSING",
        "KALSHI_PRIVATE_KEY": "set" if os.environ.get("KALSHI_PRIVATE_KEY") else "MISSING",
        "NEWS_API_KEY": "set" if os.environ.get("NEWS_API_KEY") else "MISSING",
        "ENABLE_SCHEDULER": os.environ.get("ENABLE_SCHEDULER", "false"),
    }

    checks["scheduler_running"] = scheduler.running

    return jsonify(checks)


# ─── Entry point ──────────────────────────────────────────────────────────
if __name__ == "__main__":
    logger.info("Starting Plebs data service")
    if os.environ.get("ENABLE_SCHEDULER", "false").lower() == "true":
        scheduler.start()
        logger.info("Scheduler started with {} jobs", len(scheduler.get_jobs()))

        if os.environ.get("ALPACA_API_KEY"):
            from streaming.alpaca_ws import start_streaming
            start_streaming()
    else:
        logger.info("Scheduler DISABLED (set ENABLE_SCHEDULER=true to activate). Endpoints still available.")
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)
