"""
Shadow live signal logger — writes every validated strategy signal to CSV
for forward-tracking before live capital allocation.
"""

import csv
import os
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
CSV_PATH = DATA_DIR / "shadow_live_signals.csv"

FIELDNAMES = [
    "timestamp",
    "strategy_id",
    "ticker",
    "asset_class",
    "direction",
    "entry_price",
    "stop_loss",
    "take_profit",
    "retail_standard_size",
    "25k_prop_conservative_size",
    "50k_prop_moderate_size",
    "150k_prop_boss_size",
]

_lock = Lock()


def _ensure_csv():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not CSV_PATH.exists():
        with open(CSV_PATH, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
            writer.writeheader()


class SignalLogger:
    def __init__(self):
        _ensure_csv()

    def log_signal(
        self,
        strategy_id: str,
        ticker: str,
        asset_class: str,
        direction: str,
        entry_price: float,
        stop_loss: float,
        take_profit: float,
        position_sizes: dict[str, float],
    ):
        row = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "strategy_id": strategy_id,
            "ticker": ticker,
            "asset_class": asset_class,
            "direction": direction,
            "entry_price": f"{entry_price:.6f}",
            "stop_loss": f"{stop_loss:.6f}",
            "take_profit": f"{take_profit:.6f}",
            "retail_standard_size": position_sizes.get("retail_standard", 0),
            "25k_prop_conservative_size": position_sizes.get("25k_prop_conservative", 0),
            "50k_prop_moderate_size": position_sizes.get("50k_prop_moderate", 0),
            "150k_prop_boss_size": position_sizes.get("150k_prop_boss", 0),
        }

        with _lock:
            with open(CSV_PATH, "a", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
                writer.writerow(row)
