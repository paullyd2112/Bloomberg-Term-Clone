"""
Strategy orchestrator — runs all strategy modules and logs validated signals.
"""

from .base import BaseStrategy, Signal, compute_position_sizes
from .prediction_market_decoupling import PredictionMarketDecoupling
from .institutional_consolidation_breakout import InstitutionalConsolidationBreakout
from .unusual_options_activity import UnusualOptionsActivity
from .signal_logger import SignalLogger


class StrategyOrchestrator:
    def __init__(self):
        self.strategies: list[BaseStrategy] = [
            PredictionMarketDecoupling(),
            InstitutionalConsolidationBreakout(),
            UnusualOptionsActivity(),
        ]
        self.logger = SignalLogger()

    def run_all(self, data: dict) -> list[Signal]:
        """Run all strategies against provided data, log signals, return them."""
        all_signals: list[Signal] = []

        for strategy in self.strategies:
            try:
                signals = strategy.scan(data)
            except Exception as e:
                print(f"[{strategy.strategy_id}] scan error: {e}")
                continue

            for signal in signals:
                sizes = compute_position_sizes(signal)
                self.logger.log_signal(
                    strategy_id=signal.strategy_id,
                    ticker=signal.ticker,
                    asset_class=signal.asset_class,
                    direction=signal.direction,
                    entry_price=signal.entry_price,
                    stop_loss=signal.stop_loss,
                    take_profit=signal.take_profit,
                    position_sizes=sizes,
                )
                all_signals.append(signal)

        return all_signals
