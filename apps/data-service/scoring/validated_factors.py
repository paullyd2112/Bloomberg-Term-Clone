"""
Empirically validated factor patterns — derived from analysis/factor_discovery.py
(10-month study, 62 stocks, ~9,800 observations, train/test split at 2026-03-15).

Only patterns that cleared 55%/45% on the SAME side in BOTH the train and
held-out test periods, with test n >= ~100, are enforced here. Smaller-n
buckets that technically passed (n=20-35) are deliberately excluded — one
season of data isn't enough to bet real money on a 25-trade sample.

Bucket thresholds MUST stay in sync with analysis/factor_discovery.py — if
you rebucket there and re-run the study, re-derive this table from the new
robust_out_of_sample output rather than editing stats in place.

The headline story the data tells, in plain English:
  - Strong trends persist. Deep uptrends (>15% above SMA-50) kept going,
    and RSI >70 with expanding MACD was BUY-favorable, not exhaustion.
  - Positive-but-CONTRACTING MACD is an early SELL tell almost everywhere —
    the edge starts before the crossover — EXCEPT inside a deep uptrend,
    where contraction is just a buyable pause.
  - Mild weakness bleeds: RSI 30-45 with a positive-but-fading MACD kept
    falling. That's a "stand aside or sell" state, not a dip to buy.

Expanded BUY patterns (July 2026): added 6 moderate-condition BUY patterns
to close the BUY coverage gap. These are theoretically grounded (MACD
crossovers, moderate uptrend continuation, oversold bounces) but haven't
cleared the n>=100 out-of-sample bar yet. They're marked "theoretical" in
stats and are escalated to Claude for confirmation via the hybrid engine.
"""

from __future__ import annotations

from loguru import logger


# ─── Bucketing (plain floats — mirrors analysis/factor_discovery.py) ────────

def _bucket_rsi(rsi) -> str | None:
    if rsi is None:
        return None
    rsi = float(rsi)
    if rsi < 30:  return "rsi<30"
    if rsi < 45:  return "rsi_30-45"
    if rsi < 55:  return "rsi_45-55"
    if rsi < 70:  return "rsi_55-70"
    return "rsi>70"


def _bucket_macd(hist, prev_hist) -> str | None:
    if hist is None or prev_hist is None:
        return None
    hist, prev_hist = float(hist), float(prev_hist)
    if prev_hist <= 0 < hist:
        return "macd_cross_up"
    if prev_hist >= 0 > hist:
        return "macd_cross_down"
    if hist > 0:
        return "macd_pos_expanding" if hist > prev_hist else "macd_pos_contracting"
    return "macd_neg_deepening" if hist < prev_hist else "macd_neg_recovering"


def _bucket_sma50(pct) -> str | None:
    if pct is None:
        return None
    pct = float(pct)
    if pct > 15:  return "sma50>+15%"
    if pct > 5:   return "sma50_+5-15%"
    if pct > 0:   return "sma50_0-5%"
    if pct > -5:  return "sma50_-5-0%"
    return "sma50<-5%"


# ─── Enforcement table (test-period n >= ~100 only) ─────────────────────────
# "requires" keys: rsi / macd / sma50 — a pattern matches when every listed
# bucket matches the current indicator state (unlisted factors are ignored).

VALIDATED_PATTERNS: list[dict] = [
    # ── BUY-favorable ────────────────────────────────────────────────────────
    {
        "id": "deep_uptrend_macd_expanding",
        "direction": "BUY",
        "requires": {"macd": "macd_pos_expanding", "sma50": "sma50>+15%"},
        "stats": "10d: test n=379, 59.1% up, avg +4.5%",
    },
    {
        "id": "rsi_hot_macd_expanding",
        "direction": "BUY",
        "requires": {"rsi": "rsi>70", "macd": "macd_pos_expanding"},
        "stats": "10d: test n=289, 63.0% up, avg +4.9%",
    },
    {
        "id": "deep_uptrend_pullback",
        "direction": "BUY",
        "requires": {"macd": "macd_pos_contracting", "sma50": "sma50>+15%"},
        "stats": "5d: test n=369, 56.9% up, avg +3.0%",
    },
    {
        "id": "rsi_hot_macd_contracting",
        "direction": "BUY",
        "requires": {"rsi": "rsi>70", "macd": "macd_pos_contracting"},
        "stats": "5d: test n=181, 61.9% up, avg +2.4%",
    },
    {
        "id": "healthy_rsi_macd_recovering",
        "direction": "BUY",
        "requires": {"rsi": "rsi_55-70", "macd": "macd_neg_recovering"},
        "stats": "3d: test n=149, 59.7% up, avg +1.6%",
    },
    # ── BUY-favorable (expanded — broader coverage for moderate setups) ──────
    {
        "id": "moderate_uptrend_macd_expanding",
        "direction": "BUY",
        "requires": {"macd": "macd_pos_expanding", "sma50": "sma50_+5-15%"},
        "stats": "theoretical: momentum continuation in moderate uptrend",
    },
    {
        "id": "macd_crossover_above_sma50",
        "direction": "BUY",
        "requires": {"macd": "macd_cross_up", "sma50": "sma50_+5-15%"},
        "stats": "theoretical: bullish MACD crossover in uptrend",
    },
    {
        "id": "macd_crossover_healthy_rsi",
        "direction": "BUY",
        "requires": {"rsi": "rsi_55-70", "macd": "macd_cross_up"},
        "stats": "theoretical: bullish crossover with healthy momentum",
    },
    {
        "id": "oversold_bounce_recovering",
        "direction": "BUY",
        "requires": {"rsi": "rsi<30", "macd": "macd_neg_recovering"},
        "stats": "theoretical: oversold with MACD turning up — mean reversion",
    },
    {
        "id": "healthy_rsi_expanding_moderate_trend",
        "direction": "BUY",
        "requires": {"rsi": "rsi_55-70", "macd": "macd_pos_expanding"},
        "stats": "theoretical: healthy RSI + expanding MACD = trend continuation",
    },
    {
        "id": "macd_crossover_deep_uptrend",
        "direction": "BUY",
        "requires": {"macd": "macd_cross_up", "sma50": "sma50>+15%"},
        "stats": "theoretical: bullish crossover in deep uptrend — strong setup",
    },
    # ── SELL-favorable ───────────────────────────────────────────────────────
    {
        "id": "fading_momentum_below_sma50",
        "direction": "SELL",
        "requires": {"macd": "macd_pos_contracting", "sma50": "sma50<-5%"},
        "stats": "3d/5d: test n=243/240, 41.2%/39.2% up",
    },
    {
        "id": "fading_momentum_flat_trend",
        "direction": "SELL",
        "requires": {"macd": "macd_pos_contracting", "sma50": "sma50_0-5%"},
        "stats": "3d: test n=112, 43.8% up",
    },
    {
        "id": "weak_rsi_macd_contracting",
        "direction": "SELL",
        "requires": {"rsi": "rsi_30-45", "macd": "macd_pos_contracting"},
        "stats": "3d/5d: test n=197/195, 43.7%/40.5% up",
    },
    {
        "id": "neutral_rsi_macd_contracting",
        "direction": "SELL",
        "requires": {"rsi": "rsi_45-55", "macd": "macd_pos_contracting"},
        "stats": "3d: test n=269, 43.5% up",
    },
    {
        "id": "weak_rsi_macd_expanding",
        "direction": "SELL",
        "requires": {"rsi": "rsi_30-45", "macd": "macd_pos_expanding"},
        "stats": "3d: test n=140, 43.6% up",
    },
    {
        "id": "shallow_recovery_flat_trend",
        "direction": "SELL",
        "requires": {"macd": "macd_neg_recovering", "sma50": "sma50_0-5%"},
        "stats": "10d: test n=101, 39.6% up",
    },
]


def classify_indicators(meta: dict) -> dict:
    """Bucket a raw_prices.metadata indicator dict into factor states."""
    return {
        "rsi":   _bucket_rsi(meta.get("rsi_14")),
        "macd":  _bucket_macd(meta.get("macd_hist"), meta.get("prev_macd_hist")),
        "sma50": _bucket_sma50(meta.get("price_vs_sma50_pct")),
    }


def check_signal_against_evidence(meta: dict, direction: str) -> tuple[str | None, list[str]]:
    """
    Compare a proposed BUY/SELL against the validated pattern table.

    Returns (verdict, pattern_ids):
      "contradict" — current state matches validated pattern(s) favoring the
                     OPPOSITE direction, and none favoring this one. The
                     caller should downgrade to HOLD.
      "confirm"    — matches validated pattern(s) favoring this direction.
      "mixed"      — matches patterns on both sides; no action (rare, since
                     requires-sets mostly partition on the macd bucket).
      None         — current state matches no validated pattern either way.
    """
    if direction not in ("BUY", "SELL"):
        return None, []

    buckets = classify_indicators(meta)
    matched = [
        p for p in VALIDATED_PATTERNS
        if all(buckets.get(factor) == required for factor, required in p["requires"].items())
    ]
    if not matched:
        return None, []

    aligned = [p for p in matched if p["direction"] == direction]
    opposed = [p for p in matched if p["direction"] != direction]

    if opposed and not aligned:
        return "contradict", [p["id"] for p in opposed]
    if aligned and not opposed:
        return "confirm", [p["id"] for p in aligned]
    logger.debug("validated_factors: mixed evidence — aligned={}, opposed={}",
                 [p["id"] for p in aligned], [p["id"] for p in opposed])
    return "mixed", [p["id"] for p in matched]
