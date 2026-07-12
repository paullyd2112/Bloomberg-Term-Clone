"""
Prop Survival Simulator — Monte Carlo baseline for PROP_RISK_MATRIX profiles.

Runs 1,000 random BUY/SELL signals per profile across 4 asset classes
(Stocks, Crypto, Options, Futures) using exact symmetric exit parameters.
Measures survival rates against each profile's drawdown and daily-loss limits.
"""

import random
import statistics
from dataclasses import dataclass, field

# ─── Exact PROP_RISK_MATRIX from scoring/risk_engine.py ───────────────────────

PROP_RISK_MATRIX: dict[str, dict] = {
    "retail_standard": {
        "account_size": 10_000,
        "max_overall_drawdown": 1_000,
        "max_daily_loss": 500,
        "risk_per_trade_dollar": 100,
        "daily_kill_switch_threshold": 400,
    },
    "25k_prop_conservative": {
        "account_size": 25_000,
        "max_overall_drawdown": 1_000,
        "max_daily_loss": 500,
        "risk_per_trade_dollar": 75,
        "daily_kill_switch_threshold": 375,
    },
    "50k_prop_moderate": {
        "account_size": 50_000,
        "max_overall_drawdown": 2_000,
        "max_daily_loss": 1_000,
        "risk_per_trade_dollar": 125,
        "daily_kill_switch_threshold": 750,
    },
    "150k_prop_boss": {
        "account_size": 150_000,
        "max_overall_drawdown": 4_500,
        "max_daily_loss": 2_700,
        "risk_per_trade_dollar": 225,
        "daily_kill_switch_threshold": 2_025,
    },
}

# ─── Symmetric R:R exit parameters by asset class ─────────────────────────────
# Stocks/Crypto: +2% reward / -1% risk (2:1 R:R on price move)
# Options: +60% reward / -20% risk (3:1 R:R on premium)
# Futures: +2 pts reward / -1 pt risk (2:1 R:R on points, scaled by contract value)

ASSET_CLASSES = {
    "stocks": {"win_multiplier": 2.0, "loss_multiplier": 1.0, "weight": 0.40},
    "crypto": {"win_multiplier": 2.0, "loss_multiplier": 1.0, "weight": 0.25},
    "options": {"win_multiplier": 3.0, "loss_multiplier": 1.0, "weight": 0.20},
    "futures": {"win_multiplier": 2.0, "loss_multiplier": 1.0, "weight": 0.15},
}

# Base win probability for a purely random signal (coin flip adjusted for
# the asymmetric stop/target — price hits -1% before +2% more often than not)
# Using geometric random walk math: P(hit stop first) ≈ R/(1+R) where R = reward/risk ratio
# For 2:1 → P(win) ≈ 1/(1+2) = 33.3% for stocks/crypto/futures
# For 3:1 → P(win) ≈ 1/(1+3) = 25.0% for options
WIN_PROBABILITIES = {
    "stocks": 1.0 / 3.0,   # ~33.3%
    "crypto": 1.0 / 3.0,   # ~33.3%
    "options": 1.0 / 4.0,  # 25.0%
    "futures": 1.0 / 3.0,  # ~33.3%
}

NUM_SIGNALS = 1_000
NUM_MONTE_CARLO_RUNS = 500
TRADES_PER_DAY = 5  # average signals executed per session day

random.seed(42)


@dataclass
class SimulationResult:
    profile_id: str
    final_balance: float
    max_drawdown_dollar: float
    max_drawdown_pct: float
    max_consecutive_losses: int
    daily_kill_switch_hits: int
    survived: bool
    breach_reason: str = ""


def simulate_single_run(profile_name: str, profile: dict) -> SimulationResult:
    account_size = profile["account_size"]
    balance = float(account_size)
    risk_per_trade = profile["risk_per_trade_dollar"]
    max_overall_dd = profile["max_overall_drawdown"]
    daily_kill_threshold = profile["daily_kill_switch_threshold"]

    max_dd_dollar = 0.0
    max_consecutive_losses = 0
    current_loss_streak = 0
    daily_kill_hits = 0
    survived = True
    breach_reason = ""

    daily_pnl = 0.0
    trades_today = 0
    max_daily_loss = profile["max_daily_loss"]

    for i in range(NUM_SIGNALS):
        # Reset daily tracking
        if trades_today >= TRADES_PER_DAY:
            trades_today = 0
            daily_pnl = 0.0

        # Daily kill switch — hard breach, account is dead
        if daily_pnl <= -daily_kill_threshold:
            daily_kill_hits += 1
            survived = False
            breach_reason = "daily_kill_switch"
            max_dd_dollar = max(max_dd_dollar, account_size - balance)
            break

        # Max daily loss — hard breach
        if daily_pnl <= -max_daily_loss:
            survived = False
            breach_reason = "max_daily_loss"
            max_dd_dollar = max(max_dd_dollar, account_size - balance)
            break

        # Pick asset class weighted randomly
        r = random.random()
        cumulative = 0.0
        chosen_asset = "stocks"
        for asset, config in ASSET_CLASSES.items():
            cumulative += config["weight"]
            if r <= cumulative:
                chosen_asset = asset
                break

        win_prob = WIN_PROBABILITIES[chosen_asset]
        win_mult = ASSET_CLASSES[chosen_asset]["win_multiplier"]
        loss_mult = ASSET_CLASSES[chosen_asset]["loss_multiplier"]

        # Execute trade
        if random.random() < win_prob:
            pnl = risk_per_trade * win_mult
            current_loss_streak = 0
        else:
            pnl = -risk_per_trade * loss_mult
            current_loss_streak += 1
            max_consecutive_losses = max(max_consecutive_losses, current_loss_streak)

        balance += pnl
        daily_pnl += pnl
        trades_today += 1

        # Track drawdown from STARTING balance (prop firm static DD)
        current_dd = account_size - balance
        if current_dd > 0 and current_dd > max_dd_dollar:
            max_dd_dollar = current_dd

        # Hard breach — overall drawdown limit hit, account is instantly dead
        if current_dd >= max_overall_dd:
            survived = False
            breach_reason = "max_overall_drawdown"
            max_dd_dollar = current_dd
            break

    max_dd_pct = (max_dd_dollar / account_size) * 100.0

    return SimulationResult(
        profile_id=profile_name,
        final_balance=balance,
        max_drawdown_dollar=max_dd_dollar,
        max_drawdown_pct=max_dd_pct,
        max_consecutive_losses=max_consecutive_losses,
        daily_kill_switch_hits=daily_kill_hits,
        survived=survived,
        breach_reason=breach_reason,
    )


def run_monte_carlo():
    print("=" * 100)
    print("  PROP SURVIVAL SIMULATOR — Monte Carlo Baseline (Random Signals, No Edge)")
    print("=" * 100)
    print(f"\n  Configuration:")
    print(f"    Signals per run:     {NUM_SIGNALS}")
    print(f"    Monte Carlo runs:    {NUM_MONTE_CARLO_RUNS}")
    print(f"    Trades per day:      {TRADES_PER_DAY}")
    print(f"    Win P (spot/futures): {WIN_PROBABILITIES['stocks']:.1%} (geometric RW, 2:1 R:R)")
    print(f"    Win P (options):      {WIN_PROBABILITIES['options']:.1%} (geometric RW, 3:1 R:R)")
    print(f"\n  Asset mix: Stocks 40% | Crypto 25% | Options 20% | Futures 15%")
    print(f"  Exit rules: Spot +2R/-1R | Options +3R/-1R | Futures +2R/-1R")
    print()

    # Header
    print("-" * 100)
    print(f"{'Profile':<24} {'Acct Size':>10} {'Avg Final $':>12} {'Avg MaxDD$':>11} "
          f"{'Avg DD%':>8} {'MaxStreak':>10} {'KillSwHits':>11} {'Survival%':>10}")
    print("-" * 100)

    for profile_name, profile in PROP_RISK_MATRIX.items():
        results: list[SimulationResult] = []

        for _ in range(NUM_MONTE_CARLO_RUNS):
            result = simulate_single_run(profile_name, profile)
            results.append(result)

        avg_final = statistics.mean(r.final_balance for r in results)
        avg_dd_dollar = statistics.mean(r.max_drawdown_dollar for r in results)
        avg_dd_pct = statistics.mean(r.max_drawdown_pct for r in results)
        avg_streak = statistics.mean(r.max_consecutive_losses for r in results)
        avg_kill_hits = statistics.mean(r.daily_kill_switch_hits for r in results)
        survival_rate = sum(1 for r in results if r.survived) / len(results) * 100

        print(f"{profile_name:<24} "
              f"${profile['account_size']:>9,} "
              f"${avg_final:>11,.2f} "
              f"${avg_dd_dollar:>10,.2f} "
              f"{avg_dd_pct:>7.2f}% "
              f"{avg_streak:>9.1f} "
              f"{avg_kill_hits:>10.1f} "
              f"{survival_rate:>9.1f}%")

    print("-" * 100)

    # Detailed per-profile breakdown
    print("\n")
    print("=" * 100)
    print("  DETAILED PROFILE ANALYSIS")
    print("=" * 100)

    for profile_name, profile in PROP_RISK_MATRIX.items():
        results: list[SimulationResult] = []
        for _ in range(NUM_MONTE_CARLO_RUNS):
            results.append(simulate_single_run(profile_name, profile))

        survived_results = [r for r in results if r.survived]
        breached_results = [r for r in results if not r.survived]

        print(f"\n  ┌── {profile_name.upper()} ──────────────────────────────────────────")
        print(f"  │ Account Size:          ${profile['account_size']:>10,}")
        print(f"  │ Max Overall DD Limit:   ${profile['max_overall_drawdown']:>10,} "
              f"({profile['max_overall_drawdown']/profile['account_size']*100:.1f}%)")
        print(f"  │ Risk Per Trade:         ${profile['risk_per_trade_dollar']:>10}")
        print(f"  │ Daily Kill Switch:      ${profile['daily_kill_switch_threshold']:>10,}")
        print(f"  │")
        print(f"  │ RESULTS ({NUM_MONTE_CARLO_RUNS} runs × {NUM_SIGNALS} signals):")
        print(f"  │   Survival Rate:        {sum(1 for r in results if r.survived)/len(results)*100:>8.1f}%")
        print(f"  │   Avg Final Balance:    ${statistics.mean(r.final_balance for r in results):>12,.2f}")

        if survived_results:
            print(f"  │   Avg Final (survived): ${statistics.mean(r.final_balance for r in survived_results):>12,.2f}")

        print(f"  │   Avg Max Drawdown:     ${statistics.mean(r.max_drawdown_dollar for r in results):>10,.2f} "
              f"({statistics.mean(r.max_drawdown_pct for r in results):.2f}%)")
        print(f"  │   Worst Drawdown Seen:  ${max(r.max_drawdown_dollar for r in results):>10,.2f} "
              f"({max(r.max_drawdown_pct for r in results):.2f}%)")
        print(f"  │   Avg Loss Streak:      {statistics.mean(r.max_consecutive_losses for r in results):>8.1f}")
        print(f"  │   Worst Loss Streak:    {max(r.max_consecutive_losses for r in results):>8}")
        print(f"  │   Avg Daily Kill Hits:  {statistics.mean(r.daily_kill_switch_hits for r in results):>8.1f}")

        if breached_results:
            print(f"  │   Breached Accounts:    {len(breached_results):>8} / {NUM_MONTE_CARLO_RUNS}")
            dd_breaches = sum(1 for r in breached_results if r.breach_reason == "max_overall_drawdown")
            daily_breaches = sum(1 for r in breached_results if r.breach_reason == "max_daily_loss")
            kill_breaches = sum(1 for r in breached_results if r.breach_reason == "daily_kill_switch")
            print(f"  │     → Overall DD breach:  {dd_breaches:>6}")
            print(f"  │     → Daily loss breach:  {daily_breaches:>6}")
            print(f"  │     → Kill switch breach: {kill_breaches:>6}")

        # Expected value calculation
        ev_per_trade = 0.0
        for asset, config in ASSET_CLASSES.items():
            wp = WIN_PROBABILITIES[asset]
            wm = config["win_multiplier"]
            lm = config["loss_multiplier"]
            weight = config["weight"]
            asset_ev = (wp * wm - (1 - wp) * lm) * profile["risk_per_trade_dollar"]
            ev_per_trade += asset_ev * weight

        print(f"  │")
        print(f"  │   Expected Value/Trade:  ${ev_per_trade:>+10.2f} (mathematical edge with random signals)")
        print(f"  │   EV over {NUM_SIGNALS} trades:   ${ev_per_trade * NUM_SIGNALS:>+12,.2f}")
        print(f"  └{'─' * 60}")

    # Summary
    print("\n")
    print("=" * 100)
    print("  INTERPRETATION")
    print("=" * 100)
    print("""
  With PURELY RANDOM signals (no predictive edge), the geometric random walk
  ensures that wider targets are hit LESS often than tight stops. The expected
  value per trade is NEGATIVE for all asset classes under symmetric R:R exits:

    Stocks/Crypto/Futures (2:1 R:R): EV = 0.333×(+2R) + 0.667×(-1R) = -0.001R ≈ $0
    Options (3:1 R:R):               EV = 0.250×(+3R) + 0.750×(-1R) = +0.000R = $0

  The mathematical EV is approximately ZERO (fair game), but path-dependent
  variance means accounts with TIGHT drawdown limits (prop accounts) will
  breach more often than wide-limit retail accounts purely due to volatility
  of outcomes, NOT negative edge.

  KEY INSIGHT: Any predictive accuracy above the baseline win probabilities
  (33.3% for spot, 25% for options) represents TRUE ALPHA that compounds
  multiplicatively against this survival floor.
""")
    print("=" * 100)


if __name__ == "__main__":
    run_monte_carlo()
