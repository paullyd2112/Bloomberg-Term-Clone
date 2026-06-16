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
from ingestion.options_flow import ingest_options_flow
from ingestion.short_interest import ingest_short_interest
from ingestion.earnings import ingest_earnings
from ingestion.macro_events import seed_macro_events
from scoring.engine import score_stocks, score_crypto, score_prediction_markets
from scoring.resolver import resolve_outcomes, evaluate_alerts
from scoring.accuracy import refresh_asset_accuracy
from briefing.newsletter import generate_newsletter
from briefing.newsletter_emailer import send_newsletter
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

def job_ingest_congressional():
    return ingest_congressional()

def job_generate_newsletter():
    return generate_newsletter()

def job_send_newsletter():
    return send_newsletter()

def job_send_welcome_sequence():
    return send_welcome_sequence()

def job_resolve_outcomes():
    return resolve_outcomes()

def job_refresh_asset_accuracy():
    return refresh_asset_accuracy()

def job_evaluate_alerts():
    return evaluate_alerts()


# ─── Schedule ─────────────────────────────────────────────────────────────────

# Prediction markets — every 30 min, all hours
scheduler.add_job(lambda: _run_job("ingest_prediction_markets", job_ingest_prediction_markets),
                  IntervalTrigger(minutes=30), id="ingest_prediction_markets")
scheduler.add_job(lambda: _run_job("score_prediction_markets", job_score_prediction_markets),
                  CronTrigger(minute="15,45"), id="score_prediction_markets")

# Stocks — every 60 min, weekdays 9am-5pm ET
scheduler.add_job(lambda: _run_job("ingest_stocks", job_ingest_stocks),
                  CronTrigger(minute=0, hour="9-16", day_of_week="mon-fri"), id="ingest_stocks")
scheduler.add_job(lambda: _run_job("score_stocks", job_score_stocks),
                  CronTrigger(minute=20, hour="9-16", day_of_week="mon-fri"), id="score_stocks")

# Crypto — every 60 min, all hours
scheduler.add_job(lambda: _run_job("ingest_crypto", job_ingest_crypto),
                  IntervalTrigger(hours=1), id="ingest_crypto")
scheduler.add_job(lambda: _run_job("score_crypto", job_score_crypto),
                  CronTrigger(minute=20), id="score_crypto")

# Enrichment — weekdays
scheduler.add_job(lambda: _run_job("ingest_options_flow", job_ingest_options_flow),
                  CronTrigger(minute=0, hour="9-16", day_of_week="mon-fri"), id="ingest_options_flow")
scheduler.add_job(lambda: _run_job("ingest_short_interest", job_ingest_short_interest),
                  CronTrigger(hour=7, minute=0, day_of_week="mon-fri"), id="ingest_short_interest")
scheduler.add_job(lambda: _run_job("ingest_earnings", job_ingest_earnings),
                  CronTrigger(hour=6, minute=0, day_of_week="mon-fri"), id="ingest_earnings")
scheduler.add_job(lambda: _run_job("seed_macro_events", job_seed_macro_events),
                  CronTrigger(hour=6, minute=30, day_of_week="mon-fri"), id="seed_macro_events")

# Congressional — daily at 8am ET (FMP Basic API)
scheduler.add_job(lambda: _run_job("ingest_congressional", job_ingest_congressional),
                  CronTrigger(hour=8, minute=0), id="ingest_congressional")

# Newsletter — generate at 6:30am, send at 7:00am ET weekdays
scheduler.add_job(lambda: _run_job("generate_newsletter", job_generate_newsletter),
                  CronTrigger(hour=6, minute=30, day_of_week="mon-fri", timezone="America/New_York"), id="generate_newsletter")
scheduler.add_job(lambda: _run_job("send_newsletter", job_send_newsletter),
                  CronTrigger(hour=7, minute=0, day_of_week="mon-fri", timezone="America/New_York"), id="send_newsletter")
scheduler.add_job(lambda: _run_job("send_welcome_sequence", job_send_welcome_sequence),
                  CronTrigger(hour=9, minute=0, timezone="America/New_York"), id="send_welcome_sequence")

# Resolution & accuracy — nightly
scheduler.add_job(lambda: _run_job("resolve_outcomes", job_resolve_outcomes),
                  CronTrigger(hour=0, minute=0, timezone="UTC"), id="resolve_outcomes")
scheduler.add_job(lambda: _run_job("refresh_asset_accuracy", job_refresh_asset_accuracy),
                  CronTrigger(hour=1, minute=0, timezone="UTC"), id="refresh_asset_accuracy")

# Alerts — every 30 min
scheduler.add_job(lambda: _run_job("evaluate_alerts", job_evaluate_alerts),
                  IntervalTrigger(minutes=30), id="evaluate_alerts")

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


# ─── Entry point ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    logger.info("Starting Plebs data service")
    scheduler.start()
    logger.info("Scheduler started with {} jobs", len(scheduler.get_jobs()))
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)
