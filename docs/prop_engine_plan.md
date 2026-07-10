# Prop Risk Engine — Step-by-Step Implementation Plan

**Product:** Plebs.finance (Bloomberg Terminal Clone)
**Goal:** Transform the stock-picking engine from "worse than a coin flip" to a disciplined, prop-firm-grade signal system that preserves capital first and generates edge second.
**Date:** July 10, 2026

---

## Current State (What's Broken)

### Root Causes of Poor Performance

1. **Scoring was blind for the entire operational history.** Three stacked data bugs (case-sensitive column matcher, tz-aware merge crash, thin streaming row shadowing) meant live stock signals never saw RSI, MACD, or Bollinger data. Fixed July 4, 2026 — but only ~5 days of clean data exists.
2. **All scoring jobs are currently paused.** Zero new signals are being generated.
3. **Resolution thresholds were asymmetric and generous.** Stock swing: 1.5% to win, 4% to lose. Even random signals showed >50% "win rate." The 2x-horizon auto-WIN on expired signals inflated numbers further.
4. **No risk management layer.** No position sizing, no stop losses, no take profit targets, no daily loss tracking. Every signal treated equally regardless of confidence or volatility.
5. **No fundamental data.** Claude scored using only 7 technical indicators and news headlines — no P/E, earnings, revenue, or macro context.
6. **No feedback loop.** Outcomes were tracked but never fed back into the scoring process. Claude didn't know its own track record.
7. **No benchmark comparison.** No way to tell if the system beats a coin flip, SPY buy-and-hold, or random signals.
8. **Backtest results unreliable.** All backtests ran on pre-fix (corrupted) data. The rules-based backtest uses completely different signal logic than live. The Claude backtest uses different WIN/LOSS thresholds than the production resolver.

---

## Phase 1: Fix the Measurement (Week 1)
*Before re-enabling scoring — you can't improve what you can't honestly measure.*

### Step 1.1: Symmetric Resolution Thresholds [DONE]
- **File:** `scoring/resolver.py`
- **Change:** Replace all asymmetric thresholds with symmetric ones:
  - Stock intraday: 0.8% / 0.8% (was 0.4% / 1.2%)
  - Stock swing: 1.75% / 1.75% (was 1.5% / 4.0%)
  - Stock longterm: 5% / 5% (was 4% / 8%)
  - Crypto intraday: 2% / 2% (was 1.2% / 2.5%)
  - Crypto swing: 3% / 3% (was 4% / 8%)
  - Crypto longterm: 8% / 8% (was 8% / 16%)
- **Rationale:** Win rate now means what users think it means. 50% = coin flip. Anything above 50% on symmetric thresholds is real edge.

### Step 1.2: Remove Auto-WIN on Expired Signals [DONE]
- **File:** `scoring/resolver.py` — `_score_outcome()`
- **Change:** Expired signals (past 2x horizon) resolve as NEUTRAL instead of binary WIN/LOSS.
- **Rationale:** A signal that goes sideways is not a win. Forcing a tiny move into WIN/LOSS was inflating numbers.

### Step 1.3: Signal-Level Threshold Resolution [DONE]
- **File:** `scoring/resolver.py` — `_get_signal_setup_thresholds()`
- **Change:** When a signal has a `trade_setup` attached (from the risk engine), use the exact stop_pct as the resolution threshold instead of the generic per-horizon defaults.
- **Rationale:** Resolution should match the exact levels the user was shown. If the risk engine computed a 2.5% stop, resolution should use 2.5%, not a generic 1.75%.

### Step 1.4: Build a Random Signal Baseline
- **Files:** New `analysis/random_baseline.py`
- **Change:** Generate random BUY/SELL signals on the same 66-stock watchlist, resolve them with the same symmetric thresholds, and compute the random win rate.
- **Output:** A concrete number: "Random signals on this universe with these thresholds produce X% win rate." This is the bar to clear.
- **Display:** Show on the /accuracy page: "Our signals: Y% | Random baseline: X%"

### Step 1.5: Store Indicator Snapshots with Signals
- **Files:** `scoring/engine.py` — `_write_signal()`
- **Change:** Store the full indicator metadata dict alongside each signal in a `signal_metadata` JSONB column (or in the existing metadata column).
- **Rationale:** Without this, you cannot retroactively analyze "what did the indicators look like when this bad BUY was fired?" Post-mortem analysis of losses is impossible.

### Step 1.6: Track Return Magnitude
- **Files:** `scoring/resolver.py`, `scoring/accuracy.py`
- **Change:** Store `return_pct` on each resolved signal: `(outcome_price - entry_price) / entry_price`. Compute average return per signal in accuracy aggregation, not just WIN/LOSS counts.
- **Rationale:** A system with 60% win rate but average win of +1% and average loss of -3% is net-negative. Win rate without magnitude is meaningless.

### Step 1.7: Verify AccuracyBadge Display Bug
- **File:** `apps/web/src/components/asset/AccuracyBadge.tsx`
- **Check:** `accuracy.py` stores win_rate as 0-100 (percentage). The component does `pct = accuracy.win_rate * 100`. If the API passes the raw DB value, this would display 55% as "5500%".
- **Fix:** Either divide by 100 in the component, or confirm the API layer already normalizes it.

---

## Phase 2: Prop Risk Engine Foundation (Week 1-2)

### Step 2.1: Core Risk Engine Module [DONE]
- **File:** `scoring/risk_engine.py`
- **Components built:**
  - `AccountProfile` — $50k default, 4% daily loss limit ($2,000), 10% max drawdown ($5,000)
  - `score_setup()` — computes stop/target/position size for any trade
  - `RiskBudget` — tracks intra-day risk accumulation across batch scoring runs
  - `compute_stop_and_target()` — ATR-based, invalidation-based, or percentage-based stops
  - `compute_position_size()` — confidence-scaled 0.25% to 0.5% risk per trade

### Step 2.2: R:R Enforcement [DONE]
- **Rules enforced:**
  - Stocks/Crypto: minimum 2:1 reward-to-risk, maximum 3:1
  - Options: -20% premium stop, +50% premium take profit (2.5:1)
  - Stop loss bounds: Stocks 0.5-3%, Crypto 1-5%
  - Any setup below minimum R:R is auto-suppressed (score = 0)

### Step 2.3: Daily Loss Budget Enforcement [DONE]
- **Rules enforced:**
  - If a single trade's risk exceeds the daily loss limit ($2,000): SUPPRESSED
  - If cumulative open risk across all signals in a batch exceeds 3% ($1,500): SUPPRESSED
  - Budget tracks realized losses + open risk; trades are rejected when budget is exhausted

### Step 2.4: Engine Integration [DONE]
- **Files:** `scoring/engine.py`
- **Changes:**
  - Signal schemas (`StockSignal`, `CryptoSignal`) now include `invalidation_price` field
  - `_write_signal()` runs `score_setup()` on every BUY/SELL before writing to DB
  - Suppressed trades are downgraded to HOLD with confidence 0
  - `score_stocks()` and `score_stocks_event_only()` create and share a `RiskBudget` per batch

### Step 2.5: Prompt Updates [DONE]
- **Files:** `prompts/stocks.py`, `prompts/crypto.py`
- **Changes:**
  - Claude must specify `invalidation_price` on every BUY/SELL (the price where the thesis breaks)
  - If no clear invalidation level exists, Claude must issue HOLD
  - Bollinger %B and bandwidth added to stock prompt (pre-computed, not raw band values)
  - ATR-14 shown in prompt when available

### Step 2.6: ATR Ingestion [DONE]
- **File:** `ingestion/stocks.py` — `_compute_indicators()`
- **Change:** Added `df.ta.atr(length=14, append=True)` and `atr_14` to the returned indicator dict.
- **Purpose:** Feeds the risk engine's volatility-adjusted stop placement.

### Step 2.7: Database Migration for trade_setup
- **File:** New migration `supabase/migrations/009_trade_setup_column.sql`
- **Change:** Add `trade_setup JSONB` column to `signals` table to store stop/target/position data.
- **Status:** The code writes `trade_setup` to the insert dict; the migration needs to be applied so the column exists in production.

---

## Phase 3: Enrich What Claude Sees (Week 2)
*Better inputs → better outputs. The scoring prompt is only as good as the data it receives.*

### Step 3.1: Add Fundamental Data to Scoring Context
- **Files:** New `ingestion/fundamentals.py`, update `scoring/engine.py`, update `prompts/stocks.py`
- **Data to add:**
  - P/E ratio (trailing and forward)
  - Revenue growth (YoY)
  - Earnings surprise history (last 4 quarters)
  - Market cap and sector classification
- **Source:** FMP API (already has an API key in Railway) or Finnhub
- **Prompt change:** Add a "Fundamentals:" section to the user prompt between technical indicators and news

### Step 3.2: Pre-Compute Derived Indicators
- **File:** `ingestion/stocks.py` — `_compute_indicators()`
- **Add:**
  - ADX (Average Directional Index) — distinguishes trending vs ranging markets
  - Bollinger %B and bandwidth (already added to prompt, now compute and store)
  - MA crossover flags (SMA-20 vs SMA-50 golden/death cross)
  - MACD crossover explicit boolean flags (not just raw values for Claude to infer)
- **Rationale:** Every derived indicator computed in code is one less math operation for the LLM to get wrong.

### Step 3.3: Increase Indicator Freshness
- **File:** `scoring/price_data.py`
- **Change:** Reduce `INDICATOR_MAX_AGE_DAYS` from 5 to 1 (or 2 at most). If indicators are older than 1 day, skip scoring rather than using stale data.
- **Consideration:** This may reduce signal volume. That's acceptable — fewer good signals beats many bad ones.
- **Alternative:** Compute indicators from streaming data in `streaming/alpaca_ws.py` when the OHLCV ingestion row is stale.

### Step 3.4: Add Macro Context to Scoring
- **Files:** Update `scoring/engine.py` — `_get_upcoming_macro()`
- **Enrich with:**
  - VIX level and trend (requires VIX ingestion — add to watchlist or fetch separately)
  - Days until next FOMC meeting
  - Whether it's earnings season (high % of S&P 500 reporting this week)
- **Prompt change:** Add to the shared market context block so Claude knows "VIX at 25 and rising, FOMC in 2 days"

### Step 3.5: Add Sector Context
- **Files:** New `ingestion/sectors.py` or extend `ingestion/stocks.py`
- **Data:** Map each ticker to its GICS sector/industry, fetch sector ETF performance (XLK, XLF, XLE, etc.)
- **Prompt change:** Tell Claude "NVDA is in Technology (Semiconductors). XLK (sector ETF) is +2.3% today."
- **Risk engine change:** Use sector tags in the breadth cap — don't allow 4 BUYs in the same sector

---

## Phase 4: Recalibrate the Scoring Engine (Week 3)
*With clean data and enriched context, tune the prompt and gates.*

### Step 4.1: Add Few-Shot Examples to the Prompt
- **Files:** `prompts/stocks.py`, `prompts/crypto.py`
- **Change:** Add 3-5 real examples of correct signal analysis:
  - A good BUY with proper reasoning and invalidation_price
  - A good SELL with proper reasoning
  - A correct HOLD when signals conflict
  - An example where the validated pattern overrides intuition
- **Format:** Show the indicator values, then the expected output (direction, confidence, reasoning, invalidation_price)
- **Rationale:** Few-shot examples are the single most effective way to improve LLM output quality

### Step 4.2: Add Confidence Calibration
- **File:** `prompts/stocks.py`
- **Change:** Define what confidence levels mean in concrete terms:
  - 70-74: "Setup is there but could easily fail. Position at minimum size."
  - 75-79: "Clear setup with 2+ confirming factors. Standard position."
  - 80-84: "Strong confluence, validated pattern match. Can size up."
  - 85-89: "Textbook setup with volume confirmation and no conflicting signals."
  - 90+: "Exceptional — 3+ factors, validated pattern, volume surge, no earnings risk. Rare."
- **Rationale:** Without anchoring, "80% confidence" is just a number with no meaning.

### Step 4.3: Add Feedback Loop — Show Claude Its Track Record
- **File:** `scoring/engine.py` — `score_asset()`, `prompts/stocks.py`
- **Change:** Before scoring a ticker, fetch the last 5 signals for that ticker and their outcomes. Include in the prompt:
  ```
  Your recent signals for NVDA:
    - July 7: BUY 78% → WIN (+2.3% in 4 days)
    - July 3: BUY 72% → LOSS (-1.8% in 5 days)
    - June 28: SELL 71% → NEUTRAL (0.3% in 5 days)
  ```
- **Purpose:** Claude can self-correct: "My last two BUYs on this ticker lost. What's different this time?"

### Step 4.4: Remove Double-Gating on SPY Regime
- **File:** `prompts/stocks.py`
- **Change:** Remove the "HARD GATE — MARKET REGIME" section from the prompt. Keep the code-enforced gate in `engine.py`.
- **Rationale:** The prompt gate is advisory only — Claude can ignore it. The post-hoc gate in engine.py is the real enforcement. Double-gating wastes Claude's reasoning capacity on something code already handles.

### Step 4.5: Graduate Regime Gates
- **File:** `scoring/engine.py`
- **Change:** Replace binary regime gates with graduated confidence penalties:
  - SPY 0 to -2% below SMA-50: reduce confidence by 10
  - SPY -2% to -5% below SMA-50: reduce confidence by 20
  - SPY > -5% below SMA-50: suppress BUYs entirely (current behavior)
  - Same graduation for the bullish SELL suppression
- **Rationale:** SPY at -0.1% below SMA-50 should not trigger the same full block as SPY at -10%.

### Step 4.6: Re-Run Factor Discovery on Clean Data
- **File:** `analysis/factor_discovery.py`
- **When:** After 2+ weeks of clean post-fix data has accumulated
- **Change:** Re-run the 62-stock, multi-factor study on clean indicator data. The current validated patterns were derived from corrupted data (null indicators).
- **Output:** Updated `scoring/validated_factors.py` with new pattern table
- **Critical:** Do NOT update the patterns until the new study has sufficient sample size (n >= 100 per bucket in test period)

### Step 4.7: Re-Enable Scoring in Shadow Mode
- **File:** `scheduler.py`
- **Change:** Uncomment the scoring jobs but add a `SHADOW_MODE = True` flag:
  - Signals are generated and stored in the DB with `is_shadow = True`
  - Shadow signals are NOT surfaced to users (excluded from dashboard, newsletter, alerts)
  - Shadow signals ARE resolved by the resolver with the new symmetric thresholds
  - After 1-2 weeks, analyze shadow signal accuracy vs the random baseline
- **Go/No-Go:** Only go live (remove shadow flag) if shadow accuracy consistently beats random baseline by >= 5 percentage points on symmetric thresholds

---

## Phase 5: Ship with Honest Metrics (Week 4+)
*Only after shadow mode proves the system has real edge.*

### Step 5.1: Run Claude Backtest on Clean Data
- **File:** `analysis/claude_backtest.py`
- **Change:** Re-run with production-matching symmetric thresholds. Use the same resolver logic as live.
- **Budget:** ~$5-6 in Claude API costs for a full run
- **Required output:** Win rate, profit factor, max drawdown, average return per signal, comparison to random baseline

### Step 5.2: Add Position Sizing and Exit Targets to Signal Output
- **Files:** `apps/web/src/components/signals/SignalCard.tsx`, newsletter templates
- **Change:** Display alongside each signal:
  - Stop loss price and percentage
  - Take profit price and percentage
  - Suggested position size (shares or % of account)
  - Risk-reward ratio
- **Format:** "BUY NVDA @ $150 | SL $145.50 (-3%) | TP $159 (+6%) | Risk $175 | R:R 2:1"

### Step 5.3: Add Sector-Aware Correlation Check
- **File:** `scoring/engine.py`
- **Change:** Replace the blunt breadth cap (max 4 extended BUYs by SMA-50 position) with sector-aware limits:
  - Max 2 BUYs in the same GICS sector per batch
  - Max 4 BUYs total per batch (keep existing cap)
  - When a 3rd sector BUY would fire, suppress the one with lowest confidence
- **Rationale:** Prevents users from ending up 80% in semiconductors

### Step 5.4: Transparent Methodology Page
- **File:** New `apps/web/src/app/methodology/page.tsx`
- **Content:**
  - How signals are generated (technical indicators → Claude scoring → risk engine → gates)
  - How accuracy is measured (symmetric thresholds, resolution timing, what WIN/LOSS/NEUTRAL mean)
  - Current accuracy vs random baseline
  - Risk parameters (4% daily loss limit, 2:1 minimum R:R, position sizing formula)
  - What the system does NOT do (not financial advice, no guaranteed returns, past performance disclaimer)

### Step 5.5: Add SPY Benchmark Comparison
- **File:** `apps/web/src/app/dashboard/history/page.tsx`, `scoring/accuracy.py`
- **Change:** Compute and display: "Signal portfolio return: +X% vs SPY buy-and-hold: +Y% over the same period"
- **Method:** Sum the return_pct of all resolved signals (confidence-weighted) and compare to SPY's return over the same date range

### Step 5.6: Add Risk Disclaimers
- **Files:** Signal cards, newsletter, alert emails, methodology page
- **Content:** Standard NFA disclaimer + specific: "Signals are generated by AI analysis and are not financial advice. Past win rates use symmetric thresholds where 50% equals random chance."

### Step 5.7: Go Live Decision
- **Criteria (ALL must be met):**
  - [ ] Shadow mode win rate >= 55% on symmetric thresholds for 2+ consecutive weeks
  - [ ] Shadow mode win rate beats random baseline by >= 5 percentage points
  - [ ] Average return per winning signal > average return per losing signal (positive profit factor)
  - [ ] No single day's signals would have violated the 4% daily loss limit
  - [ ] Claude backtest on clean data shows profit factor > 1.2

---

## Phase 6: Post-Launch Monitoring (Ongoing)

### Step 6.1: Rolling Accuracy Dashboard
- Track 7-day, 30-day, and all-time accuracy on symmetric thresholds
- Alert (email to admin) if 7-day accuracy drops below 50% (below random)
- Auto-pause scoring if 7-day accuracy drops below 45% (significantly below random)

### Step 6.2: Confidence Calibration Audit
- Monthly: check if 80% confidence signals actually win ~65-70% of the time
- If confidence is miscalibrated, update the few-shot examples and calibration guidance

### Step 6.3: Factor Re-Derivation
- Quarterly: re-run factor discovery on the latest 3 months of clean data
- Update validated_factors.py only when new patterns clear both train and test thresholds

### Step 6.4: Account Profile Customization
- Allow users to input their own account size, daily loss limit, and max drawdown
- Risk engine already accepts AccountProfile as a parameter — need UI + DB storage

---

## File Map (What Changed / What's New)

| File | Status | Description |
|------|--------|-------------|
| `scoring/risk_engine.py` | **NEW** | Core prop risk engine — AccountProfile, position sizing, R:R enforcement, daily budget |
| `scoring/engine.py` | **MODIFIED** | Signal schemas + invalidation_price, _write_signal runs risk engine, batch functions pass RiskBudget |
| `scoring/resolver.py` | **MODIFIED** | Symmetric thresholds, expired → NEUTRAL, signal-level setup threshold extraction |
| `prompts/stocks.py` | **MODIFIED** | Invalidation price requirement, BB %B/bandwidth, ATR in prompt |
| `prompts/crypto.py` | **MODIFIED** | Invalidation price requirement |
| `ingestion/stocks.py` | **MODIFIED** | ATR-14 computation added |
| `analysis/random_baseline.py` | TODO | Random signal generator for baseline comparison |
| `analysis/factor_discovery.py` | TODO (re-run) | Re-derive patterns on clean post-fix data |
| `scoring/validated_factors.py` | TODO (update) | New pattern table from clean data study |
| `ingestion/fundamentals.py` | TODO | P/E, revenue growth, earnings surprise ingestion |
| `ingestion/sectors.py` | TODO | GICS sector mapping and sector ETF performance |
| `apps/web/src/app/methodology/page.tsx` | TODO | Transparent methodology page |
| `supabase/migrations/009_trade_setup_column.sql` | TODO | Add trade_setup JSONB column to signals table |

---

## Key Numbers

| Parameter | Value | Source |
|-----------|-------|--------|
| Account size (default) | $50,000 | AccountProfile |
| Max EOD drawdown | 4% ($2,000) | Standard prop firm rules |
| Max trailing drawdown | 10% ($5,000) | AccountProfile |
| Risk per trade (min) | 0.25% ($125) | At confidence 70 |
| Risk per trade (max) | 0.5% ($250) | At confidence 95 |
| Max open risk per batch | 3% ($1,500) | RiskBudget |
| Min reward:risk (stocks) | 2:1 | RR_CONFIGS |
| Min reward:risk (crypto) | 2:1 | RR_CONFIGS |
| Min reward:risk (options) | 2.5:1 | RR_CONFIGS |
| Stock stop range | 0.5% - 3% | RR_CONFIGS |
| Crypto stop range | 1% - 5% | RR_CONFIGS |
| Options premium stop | 20% | RR_CONFIGS |
| Stock swing resolution | 1.75% symmetric | RESOLUTION_CONFIG |
| Crypto swing resolution | 3% symmetric | RESOLUTION_CONFIG |
| Go-live threshold | 55% win rate on symmetric, +5pp vs random | Phase 5.7 |
