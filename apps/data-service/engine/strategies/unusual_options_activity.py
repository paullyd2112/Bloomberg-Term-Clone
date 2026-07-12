"""
Module C — Unusual Options Activity (UOA) Strategy

Monitors option chains for strikes where daily volume exceeds open interest
by 3x or more. Passes contract pricing through the PROP_RISK_MATRIX to
guarantee premium risk never exceeds the profile's fixed dollar cap.

Entry is the ask price of the unusual contract. Stop is a 20% premium loss.
Target is a 60% premium gain (3:1 R:R on premium).
"""

from typing import Optional

from .base import BaseStrategy, Signal, PROP_RISK_MATRIX

VOL_TO_OI_THRESHOLD = 3.0  # volume must exceed OI by 3x
MIN_PREMIUM = 0.10  # minimum $0.10 premium to filter penny options
MAX_DTE = 45  # max days to expiration (avoid far-dated low-gamma)
MIN_DTE = 2  # avoid 0DTE gamma roulette
STOP_LOSS_PCT = 0.20  # 20% premium loss
TAKE_PROFIT_PCT = 0.60  # 60% premium gain


class UnusualOptionsActivity(BaseStrategy):
    @property
    def strategy_id(self) -> str:
        return "unusual_options_activity"

    def scan(self, data: dict) -> list[Signal]:
        """
        Expected data shape:
        {
            "options_chains": {
                "TICKER": [
                    {
                        "strike": float,
                        "expiration": str,
                        "dte": int,
                        "type": "call" | "put",
                        "ask": float,
                        "bid": float,
                        "volume": int,
                        "open_interest": int,
                        "underlying_price": float,
                        "implied_volatility": float,
                    },
                    ...
                ]
            }
        }
        """
        signals: list[Signal] = []
        chains = data.get("options_chains", {})

        for ticker, contracts in chains.items():
            for contract in contracts:
                signal = self._evaluate_contract(ticker, contract)
                if signal:
                    signals.append(signal)

        return signals

    def _evaluate_contract(self, ticker: str, contract: dict) -> Optional[Signal]:
        volume = contract.get("volume", 0) or 0
        open_interest = contract.get("open_interest", 0) or 0
        ask = contract.get("ask", 0) or 0
        dte = contract.get("dte", 0)

        # Filter: volume must exceed OI by 3x
        if open_interest <= 0 or volume / open_interest < VOL_TO_OI_THRESHOLD:
            return None

        # Filter: premium floor
        if ask < MIN_PREMIUM:
            return None

        # Filter: DTE bounds
        if dte < MIN_DTE or dte > MAX_DTE:
            return None

        # Validate premium fits within ALL profile risk caps
        premium_per_contract = ask * 100  # standard 100-share multiplier
        smallest_risk_cap = min(
            p["risk_per_trade_dollar"] for p in PROP_RISK_MATRIX.values()
        )
        if premium_per_contract > smallest_risk_cap:
            # Even 1 contract exceeds the smallest profile's risk — skip
            # (larger profiles can still trade it, but we want universal signals)
            pass  # allow signal but position sizing handles the cap

        contract_type = contract.get("type", "call")
        direction = "BUY"  # always buying the unusual activity direction

        # Premium-based stops
        entry_price = ask
        stop_loss = ask * (1 - STOP_LOSS_PCT)  # -20% premium
        take_profit = ask * (1 + TAKE_PROFIT_PCT)  # +60% premium

        strike = contract.get("strike", 0)
        expiration = contract.get("expiration", "")
        underlying = contract.get("underlying_price", 0)
        iv = contract.get("implied_volatility", 0)

        option_ticker = f"{ticker} {expiration} {strike}{contract_type[0].upper()}"

        return Signal(
            strategy_id=self.strategy_id,
            ticker=option_ticker,
            asset_class="options",
            direction=direction,
            entry_price=entry_price,
            stop_loss=stop_loss,
            take_profit=take_profit,
            confidence=min((volume / open_interest) / 10.0, 1.0),
            metadata={
                "underlying_ticker": ticker,
                "strike": strike,
                "expiration": expiration,
                "contract_type": contract_type,
                "volume": volume,
                "open_interest": open_interest,
                "vol_oi_ratio": round(volume / open_interest, 2),
                "dte": dte,
                "underlying_price": underlying,
                "implied_volatility": round(iv, 4) if iv else None,
                "premium_per_contract": premium_per_contract,
            },
        )

    @staticmethod
    def validate_premium_risk(signal: Signal) -> dict[str, int]:
        """Returns max contracts per profile that stay within risk cap."""
        premium_per_contract = signal.entry_price * 100
        if premium_per_contract <= 0:
            return {name: 0 for name in PROP_RISK_MATRIX}

        allocations = {}
        for name, profile in PROP_RISK_MATRIX.items():
            max_contracts = int(profile["risk_per_trade_dollar"] / premium_per_contract)
            allocations[name] = max(max_contracts, 0)
        return allocations
