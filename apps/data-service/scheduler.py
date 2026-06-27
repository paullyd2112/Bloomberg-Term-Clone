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
from ingestion.stocks import ingest_stocks
from ingestion.crypto import ingest_crypto
from ingestion.congressional import ingest_congressional
from ingestion.sec_form4 import ingest_insider_trades
from ingestion.options_flow import ingest_options_flow
from ingestion.short_interest import ingest_short_interest
from ingestion.earnings import ingest_earnings
from ingestion.macro_events import seed_macro_events
from ingestion.fred import enrich_macro_events
from ingestion.news import ingest_news
from scoring.engine import score_stocks, score_stocks_event_only, score_crypto, score_prediction_markets, score_options_flow
from scoring.resolver import resolve_outcomes, evaluate_alerts
from scoring.accuracy import refresh_asset_accuracy
from briefing.newsletter import generate_newsletter
from briefing.newsletter_emailer import send_newsletter
from briefing.elite_briefing import send_elite_briefings
from briefing.welcome_emails import send_welcome_sequence

load_dotenv()

# ─── Logging ──────────────────────────────────────────────────────────────────
os.makedirs("logs", exist_ok=True)
logger.remove()
logger.add(sys.stdout, level="INFO", colorize=True,
           format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level}</level> | {message}")
logger.add("logs/data-service.log", level="DEBUG", rotation="1 day",
           retention="7 days", compression="zip")

# ─── Sentry ───────────────────────────────────────────────────────────────────
init_sentry()

# ─── Scheduler ────────────────────────────────────────────────────────────────
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


# ─── Job stubs (bodies filled in subsequent prompts) ─────────────────────────

def job_ingest_prediction_markets():
    return ingest_prediction_markets()

def job_score_prediction_markets():
    return score_prediction_markets()

def job_ingest_stocks():
    return ingest_stocks()

def job_score_stocks():
    return score_stocks()

def job_score_stocks_event_only():
    return score_stocks_event_only()

def job_ingest_crypto():
    return ingest_crypto()

def job_score_crypto():
    return score_crypto()

def job_ingest_options_flow():
    return ingest_options_flow()

def job_ingest_short_interest():
    return ingest_short_interest()

def job_ingest_earnings():
    return ingest_earnings()

def job_seed_macro_events():
    return seed_macro_events()

def job_enrich_fred():
    return enrich_macro_events()

def job_ingest_congressional():
    return ingest_congressional()

def job_ingest_insider_trades():
    return ingest_insider_trades()

def job_score_options_flow():
    return score_options_flow()

def job_ingest_news():
    return ingest_news()

def job_generate_newsletter():
    return generate_newsletter()

def job_send_newsletter():
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

    _resend.api_key = os.environ.get("RESEND_API_KEY", "")
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


# ─── US Market Holiday Guard ──────────────────────────────────────────────────

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
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if today in US_MARKET_HOLIDAYS:
        logger.info("Market holiday — skipping stock jobs for {}", today)
        return False
    return True


def _run_stock_job(name: str, fn):
    if not _is_market_open():
        logger.info("Skipping {} — market closed (holiday)", name)
        return
    _run_job(name, fn)


# ─── Schedule ─────────────────────────────────────────────────────────────────

# Prediction markets — every 2 hours (was every 30 min)
scheduler.add_job(lambda: _run_job("ingest_prediction_markets", job_ingest_prediction_markets),
                  IntervalTrigger(minutes=30), id="ingest_prediction_markets")
# Prediction scoring disabled until data matures (~3 weeks of ingestion)
# scheduler.add_job(lambda: _run_job("score_prediction_markets", job_score_prediction_markets),
#                   CronTrigger(hour="*/2", minute=15), id="score_prediction_markets")

# Stocks — full scoring at open + close, event-only midday, weekdays only
scheduler.add_job(lambda: _run_stock_job("ingest_stocks", job_ingest_stocks),
                  CronTrigger(minute=0, hour="9,11,13,15", day_of_week="mon-fri"), id="ingest_stocks")
scheduler.add_job(lambda: _run_stock_job("score_stocks", job_score_stocks),
                  CronTrigger(minute=20, hour="9,15", day_of_week="mon-fri"), id="score_stocks")
scheduler.add_job(lambda: _run_stock_job("score_stocks_event", job_score_stocks_event_only),
                  CronTrigger(minute=20, hour="11,13", day_of_week="mon-fri"), id="score_stocks_event")

# Crypto — every hour
scheduler.add_job(lambda: _run_job("ingest_crypto", job_ingest_crypto),
                  IntervalTrigger(hours=1), id="ingest_crypto")
scheduler.add_job(lambda: _run_job("score_crypto", job_score_crypto),
                  CronTrigger(minute=20, hour="*"), id="score_crypto")

# Options flow scoring — runs after flow ingestion, backtest-only until validated
scheduler.add_job(lambda: _run_stock_job("score_options_flow", job_score_options_flow),
                  CronTrigger(minute=30, hour="10,15", day_of_week="mon-fri"), id="score_options_flow")

# Enrichment — weekdays, skip holidays
scheduler.add_job(lambda: _run_stock_job("ingest_options_flow", job_ingest_options_flow),
                  CronTrigger(minute=0, hour="9,12,15", day_of_week="mon-fri"), id="ingest_options_flow")
scheduler.add_job(lambda: _run_stock_job("ingest_short_interest", job_ingest_short_interest),
                  CronTrigger(hour=7, minute=0, day_of_week="mon-fri"), id="ingest_short_interest")
scheduler.add_job(lambda: _run_stock_job("ingest_earnings", job_ingest_earnings),
                  CronTrigger(hour=6, minute=0, day_of_week="mon-fri"), id="ingest_earnings")
scheduler.add_job(lambda: _run_stock_job("seed_macro_events", job_seed_macro_events),
                  CronTrigger(hour=6, minute=30, day_of_week="mon-fri"), id="seed_macro_events")
scheduler.add_job(lambda: _run_stock_job("enrich_fred", job_enrich_fred),
                  CronTrigger(hour=6, minute=45, day_of_week="mon-fri"), id="enrich_fred")

# Congressional — daily at 8am ET (FMP Basic API)
scheduler.add_job(lambda: _run_job("ingest_congressional", job_ingest_congressional),
                  CronTrigger(hour=8, minute=0), id="ingest_congressional")
# Insider trades (SEC Form 4) — daily at 8:15am ET (FMP)
scheduler.add_job(lambda: _run_job("ingest_insider_trades", job_ingest_insider_trades),
                  CronTrigger(hour=8, minute=15), id="ingest_insider_trades")

# Market news — ingest at 6:45am ET weekdays, before newsletter generation
scheduler.add_job(lambda: _run_job("ingest_news", job_ingest_news),
                  CronTrigger(hour=6, minute=45, day_of_week="mon-fri", timezone="America/New_York"), id="ingest_news")

# Newsletter — generate at 7:00am, send via Resend at 7:15am ET weekdays
scheduler.add_job(lambda: _run_job("generate_newsletter", job_generate_newsletter),
                  CronTrigger(hour=7, minute=0, day_of_week="mon-fri", timezone="America/New_York"), id="generate_newsletter")
scheduler.add_job(lambda: _run_job("send_newsletter", job_send_newsletter),
                  CronTrigger(hour=7, minute=15, day_of_week="mon-fri", timezone="America/New_York"), id="send_newsletter")
# Personalized Elite briefing — runs after main newsletter, one AI call per Elite user
scheduler.add_job(lambda: _run_job("send_elite_briefings", job_send_elite_briefings),
                  CronTrigger(hour=7, minute=20, day_of_week="mon-fri", timezone="America/New_York"), id="send_elite_briefings")
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


# ─── Health endpoint ──────────────────────────────────────────────────────────
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
    Quick validation: checks if a ticker symbol is real via yfinance/CoinGecko.
    Returns basic info without ingesting. Used by search to show untracked tickers.
    """
    from flask import request as flask_request
    import yfinance as yf

    body = flask_request.get_json(silent=True) or {}
    query = body.get("query", "").upper().strip()

    if not query or len(query) > 10:
        return jsonify({"results": []})

    results = []

    # Try as stock ticker via yfinance
    try:
        ticker = yf.Ticker(query)
        info = ticker.info or {}
        market_price = info.get("regularMarketPrice") or info.get("currentPrice")
        short_name = info.get("shortName") or info.get("longName")
        if market_price and short_name:
            results.append({
                "identifier": query,
                "asset_type": "stock",
                "name": short_name,
                "price": float(market_price),
            })
    except Exception:
        pass

    # Try as crypto via CoinGecko simple price
    if not results:
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

    if asset_type not in ("stock", "crypto"):
        return jsonify({"error": "Invalid asset_type"}), 400
    if not identifier:
        return jsonify({"error": "Missing identifier"}), 400

    try:
        if asset_type == "stock":
            from ingestion.stocks import _ingest_ticker
            ok = _ingest_ticker(identifier)
        else:
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

    if not price_check.data and asset_type in ("stock", "crypto"):
        logger.info("No price data for {}/{}, auto-ingesting first", asset_type, identifier)
        try:
            if asset_type == "stock":
                from ingestion.stocks import _ingest_ticker
                _ingest_ticker(identifier)
            else:
                from ingestion.crypto import _ingest_coin_ohlcv_only
                _ingest_coin_ohlcv_only(identifier)
        except Exception as e:
            logger.warning("Auto-ingest failed for {}/{}: {}", asset_type, identifier, e)

    try:
        result = score_asset(asset_type, identifier)
        if result is None:
            return jsonify({"status": "skipped", "reason": "recently scored or no data"})
        return jsonify({"status": "ok", "signal": result})
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

            from ingestion.stocks import ingest_stocks
            from ingestion.crypto import ingest_crypto
            from ingestion.prediction_markets import ingest_prediction_markets
            from scoring.engine import score_stocks, score_crypto, score_prediction_markets

            results = {}
            results["ingest_stocks"] = ingest_stocks()
            results["ingest_crypto"] = ingest_crypto()
            results["ingest_predictions"] = ingest_prediction_markets()
            results["score_stocks"] = score_stocks()
            results["score_crypto"] = score_crypto()
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
        from scoring.engine import score_crypto
        steps["score_crypto"] = score_crypto()
    except Exception as e:
        steps["score_crypto_error"] = traceback.format_exc()
        return jsonify({"status": "error", "env": env_diag, "db_test": db_test, "steps": steps})

    return jsonify({"status": "ok", "env": env_diag, "db_test": db_test, "steps": steps})


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

    if single_email:
        from briefing.newsletter_emailer import _get_todays_newsletter, _render_html, _render_text
        import resend as _resend
        _resend.api_key = os.environ.get("RESEND_API_KEY", "") or os.environ.get("RESEND_API_KEY_", "")

        briefing = _get_todays_newsletter()
        if not briefing:
            return jsonify({"error": "No briefing found for today"}), 404

        from datetime import date as _date
        subject = briefing.get("headline", f"Plebs — {_date.today().strftime('%b %-d')}")
        html_body = _render_html(briefing, "free", None)
        text_body = _render_text(briefing)

        try:
            _resend.Emails.send({
                "from": "Pleby from Plebs <daily@plebs.finance>",
                "to": [single_email],
                "subject": subject,
                "html": html_body,
                "text": text_body,
            })
            return jsonify({"status": "ok", "sent_to": single_email, "subject": subject})
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


# ─── Accuracy dashboard endpoint ─────────────────────────────────────────────

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
        "last_updated": rows[0].get("last_updated") if rows else None,
    })


# ─── Backtest endpoint ────────────────────────────────────────────────────────
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
                    "final_portfolio": agg.get("paper_trading", {}).get("final_portfolio"),
                    "total_return_pct": agg.get("paper_trading", {}).get("total_return_pct"),
                    "win_rate": agg.get("win_rate"),
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


# ─── Claude backtest endpoint ────────────────────────────────────────────────

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


@app.route("/scanner")
def scanner_endpoint():
    """
    Run market scanner — shows which stocks have active technical setups.
    Scans watchlist + market movers (gainers/losers/most active).
    Zero Claude cost. Use ?watchlist_only=true to skip movers.
    """
    from flask import request as flask_request
    from scoring.scanner import scan_stocks

    watchlist_only = flask_request.args.get("watchlist_only", "false").lower() == "true"

    try:
        results = scan_stocks(use_movers=not watchlist_only)
        return jsonify({
            "status": "ok",
            "qualified": len(results),
            "mode": "watchlist_only" if watchlist_only else "full_market",
            "stocks": results,
        })
    except Exception as e:
        import traceback
        return jsonify({"status": "error", "error": str(e),
                        "traceback": traceback.format_exc()}), 500


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


# ─── Entry point ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    logger.info("Starting Plebs data service")
    if os.environ.get("ENABLE_SCHEDULER", "false").lower() == "true":
        scheduler.start()
        logger.info("Scheduler started with {} jobs", len(scheduler.get_jobs()))
    else:
        logger.info("Scheduler DISABLED (set ENABLE_SCHEDULER=true to activate). Endpoints still available.")
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)
