import reflex as rx
from typing import TypedDict
import random
from datetime import datetime


class Ticker(TypedDict):
    symbol: str
    name: str
    price: float
    change: float
    change_pct: float
    volume: str
    asset_class: str
    market_cap: str
    sector: str


class NewsItem(TypedDict):
    time: str
    source: str
    headline: str
    tag: str


class CommandItem(TypedDict):
    cmd: str
    desc: str
    category: str


class IndexData(TypedDict):
    name: str
    value: float
    change: float
    change_pct: float


class CurrencyPair(TypedDict):
    pair: str
    rate: float
    change_pct: float


class Commodity(TypedDict):
    name: str
    price: float
    change_pct: float
    unit: str


class PredictionMarket(TypedDict):
    question: str
    category: str
    yes_price: float
    no_price: float
    yes_change: float
    volume: str
    resolves: str


class Alert(TypedDict):
    id: int
    symbol: str
    condition: str
    target: float
    status: str
    created: str


class RiskMetric(TypedDict):
    label: str
    value: str
    detail: str
    tone: str


class TerminalState(rx.State):
    view_mode: str = "retail"
    command_input: str = ""
    command_history: list[str] = ["HELP", "WEI", "TOP", "SPX <INDEX> GP"]
    active_symbol: str = "AAPL"
    active_panel: str = "MARKETS"
    current_time: str = "07:42:18 EST"

    @rx.event
    def set_view_mode(self, mode: str):
        self.view_mode = mode

    @rx.event
    def toggle_view_mode(self):
        self.view_mode = "terminal" if self.view_mode == "retail" else "retail"

    watchlist_filter: str = "ALL"
    trade_side: str = "BUY"
    trade_qty: str = "100"
    trade_order_type: str = "MARKET"
    trade_limit: str = ""
    lookup_query: str = ""
    lookup_open: bool = False
    feedback_message: str = ""
    feedback_tone: str = "info"
    loading: bool = False

    # Guided trade flow
    trade_dialog_open: bool = False
    trade_step: int = 1  # 1 = setup, 2 = review, 3 = confirmed

    # Guided alert flow
    alert_dialog_open: bool = False
    alert_symbol_ctx: str = "AAPL"
    alert_condition: str = "above"
    alert_target_str: str = ""

    # Guided prediction bet flow
    pred_dialog_open: bool = False
    pred_market_idx: int = 0
    pred_side: str = "YES"
    pred_shares: str = "10"
    pred_step: int = 1  # 1 = setup, 2 = confirmed

    # Retail activity log for visible feedback trail
    activity_log: list[dict[str, str]] = []

    # Portfolio history for retail sparkline (seeded, deterministic)
    portfolio_history: list[dict[str, float | str]] = [
        {"t": "Mon", "value": 4198420.0},
        {"t": "Tue", "value": 4215100.0},
        {"t": "Wed", "value": 4187830.0},
        {"t": "Thu", "value": 4232970.0},
        {"t": "Fri", "value": 4251340.0},
        {"t": "Sat", "value": 4269441.0},
        {"t": "Sun", "value": 4287914.32},
    ]

    # Retail hero tab: overview | movers | learn
    retail_tab: str = "overview"

    @rx.event
    def set_retail_tab(self, tab: str):
        self.retail_tab = tab

    tickers: list[Ticker] = [
        {
            "symbol": "AAPL",
            "name": "APPLE INC",
            "price": 227.52,
            "change": 2.14,
            "change_pct": 0.95,
            "volume": "48.2M",
            "asset_class": "STOCK",
            "market_cap": "3.48T",
            "sector": "TECH",
        },
        {
            "symbol": "MSFT",
            "name": "MICROSOFT CORP",
            "price": 428.73,
            "change": -1.87,
            "change_pct": -0.43,
            "volume": "22.1M",
            "asset_class": "STOCK",
            "market_cap": "3.19T",
            "sector": "TECH",
        },
        {
            "symbol": "NVDA",
            "name": "NVIDIA CORP",
            "price": 138.29,
            "change": 4.62,
            "change_pct": 3.45,
            "volume": "312.4M",
            "asset_class": "STOCK",
            "market_cap": "3.39T",
            "sector": "SEMI",
        },
        {
            "symbol": "GOOGL",
            "name": "ALPHABET INC-A",
            "price": 175.84,
            "change": 0.92,
            "change_pct": 0.53,
            "volume": "18.7M",
            "asset_class": "STOCK",
            "market_cap": "2.17T",
            "sector": "TECH",
        },
        {
            "symbol": "AMZN",
            "name": "AMAZON.COM INC",
            "price": 202.61,
            "change": -2.34,
            "change_pct": -1.14,
            "volume": "31.5M",
            "asset_class": "STOCK",
            "market_cap": "2.13T",
            "sector": "CONS",
        },
        {
            "symbol": "META",
            "name": "META PLATFORMS",
            "price": 582.13,
            "change": 7.28,
            "change_pct": 1.27,
            "volume": "14.2M",
            "asset_class": "STOCK",
            "market_cap": "1.47T",
            "sector": "TECH",
        },
        {
            "symbol": "TSLA",
            "name": "TESLA INC",
            "price": 342.87,
            "change": -8.42,
            "change_pct": -2.40,
            "volume": "89.6M",
            "asset_class": "STOCK",
            "market_cap": "1.09T",
            "sector": "AUTO",
        },
        {
            "symbol": "JPM",
            "name": "JPMORGAN CHASE",
            "price": 243.19,
            "change": 1.05,
            "change_pct": 0.43,
            "volume": "9.8M",
            "asset_class": "STOCK",
            "market_cap": "684B",
            "sector": "FIN",
        },
        {
            "symbol": "BTC",
            "name": "BITCOIN",
            "price": 97428.12,
            "change": 2718.45,
            "change_pct": 2.87,
            "volume": "48.2B",
            "asset_class": "CRYPTO",
            "market_cap": "1.93T",
            "sector": "L1",
        },
        {
            "symbol": "ETH",
            "name": "ETHEREUM",
            "price": 3387.44,
            "change": 64.51,
            "change_pct": 1.94,
            "volume": "22.4B",
            "asset_class": "CRYPTO",
            "market_cap": "407B",
            "sector": "L1",
        },
        {
            "symbol": "SOL",
            "name": "SOLANA",
            "price": 218.34,
            "change": 12.87,
            "change_pct": 6.26,
            "volume": "5.8B",
            "asset_class": "CRYPTO",
            "market_cap": "103B",
            "sector": "L1",
        },
        {
            "symbol": "DOGE",
            "name": "DOGECOIN",
            "price": 0.4128,
            "change": -0.0142,
            "change_pct": -3.32,
            "volume": "3.1B",
            "asset_class": "CRYPTO",
            "market_cap": "60B",
            "sector": "MEME",
        },
        {
            "symbol": "AVAX",
            "name": "AVALANCHE",
            "price": 47.28,
            "change": 2.14,
            "change_pct": 4.74,
            "volume": "1.2B",
            "asset_class": "CRYPTO",
            "market_cap": "19B",
            "sector": "L1",
        },
        {
            "symbol": "XOM",
            "name": "EXXON MOBIL",
            "price": 118.44,
            "change": -0.67,
            "change_pct": -0.56,
            "volume": "15.3M",
            "asset_class": "STOCK",
            "market_cap": "521B",
            "sector": "ENGY",
        },
        {
            "symbol": "SPY",
            "name": "SPDR S&P 500 ETF",
            "price": 597.28,
            "change": 1.28,
            "change_pct": 0.21,
            "volume": "42.1M",
            "asset_class": "ETF",
            "market_cap": "590B",
            "sector": "ETF",
        },
        {
            "symbol": "QQQ",
            "name": "INVESCO QQQ TRUST",
            "price": 512.87,
            "change": 1.24,
            "change_pct": 0.24,
            "volume": "28.3M",
            "asset_class": "ETF",
            "market_cap": "302B",
            "sector": "ETF",
        },
    ]

    prediction_markets: list[PredictionMarket] = [
        {
            "question": "Fed cuts rates in Jan 2025 FOMC",
            "category": "MACRO",
            "yes_price": 0.18,
            "no_price": 0.82,
            "yes_change": -0.04,
            "volume": "$4.2M",
            "resolves": "Jan 29",
        },
        {
            "question": "BTC closes above $100K by EOY",
            "category": "CRYPTO",
            "yes_price": 0.72,
            "no_price": 0.28,
            "yes_change": 0.08,
            "volume": "$12.8M",
            "resolves": "Dec 31",
        },
        {
            "question": "US recession declared in 2025",
            "category": "MACRO",
            "yes_price": 0.24,
            "no_price": 0.76,
            "yes_change": -0.02,
            "volume": "$6.9M",
            "resolves": "Dec 31",
        },
        {
            "question": "NVDA hits $200 by Q2 2025",
            "category": "EQUITY",
            "yes_price": 0.41,
            "no_price": 0.59,
            "yes_change": 0.06,
            "volume": "$2.1M",
            "resolves": "Jun 30",
        },
        {
            "question": "OpenAI IPO announced in 2025",
            "category": "TECH",
            "yes_price": 0.14,
            "no_price": 0.86,
            "yes_change": 0.01,
            "volume": "$1.8M",
            "resolves": "Dec 31",
        },
        {
            "question": "ETH/BTC ratio > 0.05 by March",
            "category": "CRYPTO",
            "yes_price": 0.38,
            "no_price": 0.62,
            "yes_change": -0.03,
            "volume": "$920K",
            "resolves": "Mar 31",
        },
        {
            "question": "S&P 500 hits 6500 in H1 2025",
            "category": "EQUITY",
            "yes_price": 0.52,
            "no_price": 0.48,
            "yes_change": 0.04,
            "volume": "$3.4M",
            "resolves": "Jun 30",
        },
        {
            "question": "Trump signs crypto EO in first 100 days",
            "category": "POLITICS",
            "yes_price": 0.68,
            "no_price": 0.32,
            "yes_change": 0.05,
            "volume": "$5.1M",
            "resolves": "Apr 30",
        },
    ]

    alerts: list[Alert] = [
        {
            "id": 1,
            "symbol": "AAPL",
            "condition": "PRICE >",
            "target": 230.00,
            "status": "ARMED",
            "created": "07:12",
        },
        {
            "id": 2,
            "symbol": "BTC",
            "condition": "PRICE >",
            "target": 100000.00,
            "status": "ARMED",
            "created": "06:48",
        },
        {
            "id": 3,
            "symbol": "TSLA",
            "condition": "PRICE <",
            "target": 340.00,
            "status": "TRIGGERED",
            "created": "07:38",
        },
        {
            "id": 4,
            "symbol": "NVDA",
            "condition": "%CHG >",
            "target": 5.0,
            "status": "ARMED",
            "created": "07:02",
        },
        {
            "id": 5,
            "symbol": "SOL",
            "condition": "PRICE >",
            "target": 225.00,
            "status": "ARMED",
            "created": "07:31",
        },
    ]

    risk_metrics: list[RiskMetric] = [
        {"label": "BETA", "value": "1.24", "detail": "vs SPX", "tone": "warn"},
        {"label": "SHARPE", "value": "1.87", "detail": "1Y ROLL", "tone": "up"},
        {
            "label": "VOLATILITY",
            "value": "18.4%",
            "detail": "30D ANN",
            "tone": "warn",
        },
        {"label": "MAX DD", "value": "-8.2%", "detail": "3M", "tone": "down"},
        {"label": "VaR 95%", "value": "$42.1K", "detail": "1D", "tone": "warn"},
        {
            "label": "EXPOSURE",
            "value": "78%",
            "detail": "GROSS LONG",
            "tone": "up",
        },
        {"label": "LEVERAGE", "value": "1.08x", "detail": "NET", "tone": "up"},
        {"label": "CORR SPX", "value": "0.72", "detail": "60D", "tone": "warn"},
    ]

    indices: list[IndexData] = [
        {
            "name": "S&P 500",
            "value": 5987.37,
            "change": 12.85,
            "change_pct": 0.21,
        },
        {
            "name": "DOW JONES",
            "value": 44293.13,
            "change": -78.23,
            "change_pct": -0.18,
        },
        {
            "name": "NASDAQ",
            "value": 19298.76,
            "change": 47.28,
            "change_pct": 0.25,
        },
        {
            "name": "RUSSELL 2K",
            "value": 2411.19,
            "change": 8.94,
            "change_pct": 0.37,
        },
        {"name": "VIX", "value": 15.42, "change": -0.83, "change_pct": -5.10},
        {
            "name": "FTSE 100",
            "value": 8149.67,
            "change": 22.14,
            "change_pct": 0.27,
        },
        {
            "name": "DAX",
            "value": 19187.42,
            "change": -34.18,
            "change_pct": -0.18,
        },
        {
            "name": "NIKKEI 225",
            "value": 38826.11,
            "change": 143.62,
            "change_pct": 0.37,
        },
        {
            "name": "HANG SENG",
            "value": 19426.34,
            "change": -87.24,
            "change_pct": -0.45,
        },
    ]

    currencies: list[CurrencyPair] = [
        {"pair": "EUR/USD", "rate": 1.0587, "change_pct": 0.12},
        {"pair": "GBP/USD", "rate": 1.2634, "change_pct": -0.08},
        {"pair": "USD/JPY", "rate": 154.28, "change_pct": 0.34},
        {"pair": "USD/CHF", "rate": 0.8842, "change_pct": -0.21},
        {"pair": "AUD/USD", "rate": 0.6512, "change_pct": 0.19},
        {"pair": "USD/CAD", "rate": 1.3987, "change_pct": -0.11},
    ]

    commodities: list[Commodity] = [
        {
            "name": "CRUDE WTI",
            "price": 71.24,
            "change_pct": 1.24,
            "unit": "USD/bbl",
        },
        {
            "name": "BRENT",
            "price": 74.87,
            "change_pct": 0.98,
            "unit": "USD/bbl",
        },
        {
            "name": "GOLD",
            "price": 2687.34,
            "change_pct": 0.42,
            "unit": "USD/oz",
        },
        {
            "name": "SILVER",
            "price": 31.28,
            "change_pct": -0.34,
            "unit": "USD/oz",
        },
        {"name": "COPPER", "price": 4.18, "change_pct": 0.87, "unit": "USD/lb"},
        {
            "name": "NAT GAS",
            "price": 3.14,
            "change_pct": 2.14,
            "unit": "USD/MMBtu",
        },
        {
            "name": "BITCOIN",
            "price": 97428.12,
            "change_pct": 2.87,
            "unit": "USD",
        },
        {
            "name": "ETHEREUM",
            "price": 3387.44,
            "change_pct": 1.94,
            "unit": "USD",
        },
    ]

    news_items: list[NewsItem] = [
        {
            "time": "07:41",
            "source": "BN",
            "headline": "Fed's Powell signals cautious approach to further rate cuts amid persistent inflation",
            "tag": "FED",
        },
        {
            "time": "07:38",
            "source": "RTRS",
            "headline": "Nvidia announces new Blackwell chip variant, shares jump in premarket trading",
            "tag": "TECH",
        },
        {
            "time": "07:35",
            "source": "BN",
            "headline": "ECB's Lagarde: Eurozone growth outlook remains subdued through Q1 2025",
            "tag": "ECB",
        },
        {
            "time": "07:32",
            "source": "WSJ",
            "headline": "Oil rallies as OPEC+ extends production cuts through end of first quarter",
            "tag": "OIL",
        },
        {
            "time": "07:29",
            "source": "BN",
            "headline": "China's PBoC injects 800B yuan via reverse repos to ease liquidity pressure",
            "tag": "CHINA",
        },
        {
            "time": "07:26",
            "source": "FT",
            "headline": "Tesla deliveries miss estimates; Musk cites logistics disruptions in Europe",
            "tag": "AUTO",
        },
        {
            "time": "07:22",
            "source": "BN",
            "headline": "Treasury yields climb as investors reassess pace of Fed easing cycle",
            "tag": "RATES",
        },
        {
            "time": "07:18",
            "source": "RTRS",
            "headline": "Gold hits fresh record above $2,680 on safe-haven demand and dollar weakness",
            "tag": "COMDTY",
        },
        {
            "time": "07:14",
            "source": "BN",
            "headline": "JPMorgan raises S&P 500 year-end target to 6,500 citing earnings resilience",
            "tag": "EQTY",
        },
        {
            "time": "07:10",
            "source": "WSJ",
            "headline": "Bitcoin approaches $100K milestone as institutional inflows accelerate",
            "tag": "CRYPTO",
        },
        {
            "time": "07:05",
            "source": "BN",
            "headline": "UK inflation ticks higher to 2.6% in November, complicating BoE policy path",
            "tag": "UK",
        },
        {
            "time": "06:58",
            "source": "FT",
            "headline": "Boeing secures $12B order from Emirates for widebody fleet expansion",
            "tag": "AERO",
        },
    ]

    commands: list[CommandItem] = [
        {"cmd": "HELP", "desc": "Terminal help menu", "category": "SYS"},
        {"cmd": "WEI", "desc": "World Equity Indices", "category": "MKT"},
        {"cmd": "TOP", "desc": "Top news stories", "category": "NEWS"},
        {"cmd": "GP", "desc": "Price graph", "category": "CHART"},
        {"cmd": "DES", "desc": "Security description", "category": "EQTY"},
        {"cmd": "FA", "desc": "Financial analysis", "category": "EQTY"},
        {"cmd": "PORT", "desc": "Portfolio manager", "category": "PORT"},
        {"cmd": "ECO", "desc": "Economic calendar", "category": "MACRO"},
        {"cmd": "FXIP", "desc": "FX rates page", "category": "FX"},
        {"cmd": "CRYP", "desc": "Cryptocurrency data", "category": "CRYPTO"},
        {"cmd": "PRED", "desc": "Prediction markets", "category": "PRED"},
        {"cmd": "BUY", "desc": "Buy order ticket", "category": "TRADE"},
        {"cmd": "SELL", "desc": "Sell order ticket", "category": "TRADE"},
        {"cmd": "ALRT", "desc": "Manage alerts", "category": "ALERT"},
        {"cmd": "RISK", "desc": "Portfolio risk snapshot", "category": "PORT"},
        {"cmd": "MOVE", "desc": "Top movers", "category": "MKT"},
        {"cmd": "LOOKUP", "desc": "Symbol lookup", "category": "SYS"},
        {"cmd": "CLEAR", "desc": "Clear command history", "category": "SYS"},
    ]

    @rx.event
    def set_command(self, value: str):
        self.command_input = value

    @rx.event
    def execute_command(self):
        raw = self.command_input.strip()
        if not raw:
            self.feedback_message = "EMPTY COMMAND"
            self.feedback_tone = "warn"
            return
        cmd = raw.upper()
        self.command_history = [cmd] + self.command_history[:19]
        parts = cmd.split()
        head = parts[0]
        symbols = [t["symbol"] for t in self.tickers]
        panel_map = {
            "WEI": "MARKETS",
            "TOP": "NEWS",
            "EQTY": "EQUITIES",
            "FXIP": "FX",
            "CMDTY": "COMMODITIES",
            "CRYP": "CRYPTO",
            "CRYPTO": "CRYPTO",
            "PRED": "PREDICTIONS",
            "PREDICTIONS": "PREDICTIONS",
            "PORT": "PORTFOLIO",
            "ECO": "ECO CAL",
            "GP": "CHART",
            "ALRT": "ALERTS",
            "RISK": "PORTFOLIO",
            "MOVE": "MARKETS",
        }
        if head in symbols:
            self.active_symbol = head
            self.feedback_message = f"LOADED {head}"
            self.feedback_tone = "ok"
        elif head in panel_map:
            self.active_panel = panel_map[head]
            self.feedback_message = f"→ {panel_map[head]}"
            self.feedback_tone = "ok"
        elif head == "BUY" or head == "SELL":
            self.trade_side = head
            if len(parts) > 1 and parts[1] in symbols:
                self.active_symbol = parts[1]
            self.feedback_message = (
                f"ORDER TICKET: {self.trade_side} {self.active_symbol}"
            )
            self.feedback_tone = "ok"
        elif head == "LOOKUP":
            self.lookup_open = True
            self.feedback_message = "SYMBOL LOOKUP OPEN"
            self.feedback_tone = "info"
        elif head == "CLEAR":
            self.command_history = []
            self.feedback_message = "HISTORY CLEARED"
            self.feedback_tone = "info"
        elif head == "HELP":
            self.feedback_message = "SEE FUNCTIONS PANEL BELOW"
            self.feedback_tone = "info"
        else:
            self.feedback_message = f"UNKNOWN: {head}"
            self.feedback_tone = "err"
        self.command_input = ""

    @rx.event
    def select_symbol(self, symbol: str):
        self.active_symbol = symbol
        self.feedback_message = f"SELECTED {symbol}"
        self.feedback_tone = "ok"

    @rx.event
    def set_panel(self, panel: str):
        self.active_panel = panel

    @rx.event
    def set_watchlist_filter(self, f: str):
        self.watchlist_filter = f

    @rx.event
    def set_trade_side(self, side: str):
        self.trade_side = side

    @rx.event
    def set_trade_qty(self, q: str):
        self.trade_qty = q

    @rx.event
    def set_trade_order_type(self, t: str):
        self.trade_order_type = t

    @rx.event
    def set_trade_limit(self, v: str):
        self.trade_limit = v

    @rx.event
    def preview_order(self):
        try:
            qty = float(self.trade_qty or "0")
        except ValueError:
            qty = 0
        if qty <= 0:
            self.feedback_message = "INVALID QTY"
            self.feedback_tone = "err"
            return
        self.feedback_message = f"PREVIEW: {self.trade_side} {int(qty)} {self.active_symbol} @ {self.trade_order_type}"
        self.feedback_tone = "ok"

    @rx.event
    def submit_order(self):
        try:
            qty = float(self.trade_qty or "0")
        except ValueError:
            qty = 0
        if qty <= 0:
            self.feedback_message = "REJECTED: INVALID QTY"
            self.feedback_tone = "err"
            return
        self.feedback_message = (
            f"✓ ORDER STAGED: {self.trade_side} {int(qty)} {self.active_symbol}"
        )
        self.feedback_tone = "ok"
        self.command_history = [
            f"{self.trade_side} {int(qty)} {self.active_symbol} {self.trade_order_type}"
        ] + self.command_history[:19]

    @rx.event
    def set_lookup_query(self, q: str):
        self.lookup_query = q

    @rx.event
    def toggle_lookup(self):
        self.lookup_open = not self.lookup_open

    @rx.event
    def close_lookup(self):
        self.lookup_open = False

    @rx.event
    def pick_lookup(self, symbol: str):
        self.active_symbol = symbol
        self.lookup_open = False
        self.lookup_query = ""
        self.feedback_message = f"LOADED {symbol}"
        self.feedback_tone = "ok"

    @rx.event
    def toggle_alert(self, alert_id: int):
        new_alerts = []
        for a in self.alerts:
            if a["id"] == alert_id:
                new_status = "ARMED" if a["status"] != "ARMED" else "PAUSED"
                new_alerts.append({**a, "status": new_status})
            else:
                new_alerts.append(a)
        self.alerts = new_alerts

    @rx.event
    def delete_alert(self, alert_id: int):
        self.alerts = [a for a in self.alerts if a["id"] != alert_id]
        self.feedback_message = "ALERT REMOVED"
        self.feedback_tone = "info"
        self._log_activity("ALERT", f"Removed alert #{alert_id}", "info")

    def _log_activity(self, kind: str, message: str, tone: str):
        entry = {
            "time": datetime.now().strftime("%H:%M:%S"),
            "kind": kind,
            "message": message,
            "tone": tone,
        }
        self.activity_log = [entry] + self.activity_log[:19]

    # ----- Guided Trade Flow -----
    @rx.event
    def open_trade_dialog(self, symbol: str, side: str):
        self.active_symbol = symbol
        self.trade_side = side
        self.trade_qty = "10"
        self.trade_order_type = "MARKET"
        self.trade_limit = ""
        self.trade_step = 1
        self.trade_dialog_open = True

    @rx.event
    def close_trade_dialog(self):
        self.trade_dialog_open = False
        self.trade_step = 1

    @rx.event
    def trade_next_step(self):
        try:
            qty = float(self.trade_qty or "0")
        except ValueError:
            qty = 0
        if qty <= 0:
            return rx.toast(
                title="Enter a quantity",
                description="Please enter a positive number of shares to continue.",
                position="bottom-right",
                duration=3500,
            )
        if self.trade_order_type != "MARKET":
            try:
                lim = float(self.trade_limit or "0")
            except ValueError:
                lim = 0
            if lim <= 0:
                return rx.toast(
                    title="Enter a limit price",
                    description="A limit or stop price is required for this order type.",
                    position="bottom-right",
                    duration=3500,
                )
        self.trade_step = 2

    @rx.event
    def trade_back_step(self):
        self.trade_step = 1

    @rx.event
    def confirm_trade(self):
        try:
            qty = float(self.trade_qty or "0")
        except ValueError:
            qty = 0
        if qty <= 0:
            return rx.toast(title="Invalid quantity", position="bottom-right")
        sym = self.active_symbol
        px = self.selected_ticker["price"]
        notional = qty * px
        verb = "Bought" if self.trade_side == "BUY" else "Sold"
        message = f"{verb} {qty:g} {sym} · ${notional:,.2f}"
        self.trade_step = 3
        self.feedback_message = f"✓ {message}"
        self.feedback_tone = "ok"
        self._log_activity(
            "TRADE",
            f"{self.trade_side} {qty:g} {sym} @ {self.trade_order_type} · ${notional:,.2f}",
            "ok" if self.trade_side == "BUY" else "warn",
        )
        return rx.toast(
            title=f"{verb} {sym}",
            description=f"{qty:g} shares · ${notional:,.2f}. Position is now open.",
            position="bottom-right",
            duration=4500,
            close_button=True,
        )

    # ----- Guided Alert Flow -----
    @rx.event
    def open_alert_dialog(self, symbol: str):
        self.alert_symbol_ctx = symbol
        self.alert_condition = "above"
        # Prefill target with current price
        for t in self.tickers:
            if t["symbol"] == symbol:
                self.alert_target_str = f"{t['price']:.2f}"
                break
        self.alert_dialog_open = True

    @rx.event
    def close_alert_dialog(self):
        self.alert_dialog_open = False

    @rx.event
    def set_alert_condition(self, c: str):
        self.alert_condition = c

    @rx.event
    def set_alert_target(self, v: str):
        self.alert_target_str = v

    @rx.event
    def create_alert(self):
        try:
            target = float(self.alert_target_str or "0")
        except ValueError:
            target = 0
        if target <= 0:
            return rx.toast(
                title="Enter a target price",
                description="Please enter a positive price to watch.",
                position="bottom-right",
                duration=3500,
            )
        next_id = max([a["id"] for a in self.alerts], default=0) + 1
        cond = "PRICE >" if self.alert_condition == "above" else "PRICE <"
        new_alert: Alert = {
            "id": next_id,
            "symbol": self.alert_symbol_ctx,
            "condition": cond,
            "target": target,
            "status": "ARMED",
            "created": datetime.now().strftime("%H:%M"),
        }
        self.alerts = [new_alert] + self.alerts
        self.alert_dialog_open = False
        self.feedback_message = (
            f"✓ Alert set: {self.alert_symbol_ctx} {cond} {target:.2f}"
        )
        self.feedback_tone = "ok"
        word = "above" if self.alert_condition == "above" else "below"
        self._log_activity(
            "ALERT",
            f"Watching {self.alert_symbol_ctx} {word} ${target:,.2f}",
            "info",
        )
        return rx.toast(
            title=f"Alert armed for {self.alert_symbol_ctx}",
            description=f"We'll notify you when the price goes {word} ${target:,.2f}.",
            position="bottom-right",
            duration=4500,
            close_button=True,
        )

    # ----- Guided Prediction Flow -----
    @rx.event
    def open_pred_dialog(self, idx: int, side: str):
        self.pred_market_idx = idx
        self.pred_side = side
        self.pred_shares = "10"
        self.pred_step = 1
        self.pred_dialog_open = True

    @rx.event
    def close_pred_dialog(self):
        self.pred_dialog_open = False
        self.pred_step = 1

    @rx.event
    def set_pred_side(self, side: str):
        self.pred_side = side

    @rx.event
    def set_pred_shares(self, v: str):
        self.pred_shares = v

    @rx.event
    def confirm_pred(self):
        try:
            shares = float(self.pred_shares or "0")
        except ValueError:
            shares = 0
        if shares <= 0:
            return rx.toast(
                title="Enter a share count",
                description="Choose how many YES/NO shares to buy.",
                position="bottom-right",
                duration=3500,
            )
        market = self.prediction_markets[self.pred_market_idx]
        price = (
            market["yes_price"]
            if self.pred_side == "YES"
            else market["no_price"]
        )
        cost = shares * price
        self.pred_step = 2
        self.feedback_message = (
            f"✓ Bought {shares:g} {self.pred_side} shares · ${cost:,.2f}"
        )
        self.feedback_tone = "ok"
        self._log_activity(
            "PREDICT",
            f"{self.pred_side} × {shares:g} · {market['question'][:40]}",
            "ok" if self.pred_side == "YES" else "warn",
        )
        return rx.toast(
            title=f"{self.pred_side} position opened",
            description=f"{shares:g} shares @ {price * 100:.0f}¢ · ${cost:,.2f}. Resolves {market['resolves']}.",
            position="bottom-right",
            duration=5000,
            close_button=True,
        )

    @rx.var
    def pred_selected(self) -> PredictionMarket:
        if 0 <= self.pred_market_idx < len(self.prediction_markets):
            return self.prediction_markets[self.pred_market_idx]
        return self.prediction_markets[0]

    @rx.var
    def pred_cost(self) -> float:
        try:
            shares = float(self.pred_shares or "0")
        except ValueError:
            shares = 0
        m = self.pred_selected
        price = m["yes_price"] if self.pred_side == "YES" else m["no_price"]
        return round(shares * price, 2)

    @rx.var
    def pred_payout(self) -> float:
        try:
            shares = float(self.pred_shares or "0")
        except ValueError:
            shares = 0
        return round(shares * 1.0, 2)

    @rx.event
    def tick(self):
        new_tickers = []
        for t in self.tickers:
            drift = random.uniform(-0.15, 0.15)
            new_price = round(t["price"] + drift, 2)
            new_change = round(t["change"] + drift * t["price"] / 100, 2)
            denom = new_price - new_change
            new_pct = round(new_change / denom * 100, 2) if denom != 0 else 0.0
            new_tickers.append(
                {
                    **t,
                    "price": new_price,
                    "change": new_change,
                    "change_pct": new_pct,
                }
            )
        self.tickers = new_tickers
        now = datetime.now()
        self.current_time = now.strftime("%H:%M:%S") + " EST"

    @rx.var
    def selected_ticker(self) -> Ticker:
        for t in self.tickers:
            if t["symbol"] == self.active_symbol:
                return t
        return self.tickers[0]

    @rx.var
    def filtered_tickers(self) -> list[Ticker]:
        if self.watchlist_filter == "ALL":
            return self.tickers
        if self.watchlist_filter == "GAINERS":
            return [t for t in self.tickers if t["change_pct"] > 0]
        if self.watchlist_filter == "LOSERS":
            return [t for t in self.tickers if t["change_pct"] < 0]
        return [
            t for t in self.tickers if t["asset_class"] == self.watchlist_filter
        ]

    @rx.var
    def crypto_movers(self) -> list[Ticker]:
        cryptos = [t for t in self.tickers if t["asset_class"] == "CRYPTO"]
        cryptos.sort(key=lambda t: abs(t["change_pct"]), reverse=True)
        return cryptos[:6]

    @rx.var
    def stock_highlights(self) -> list[Ticker]:
        stocks = [
            t for t in self.tickers if t["asset_class"] in ("STOCK", "ETF")
        ]
        return stocks[:8]

    @rx.var
    def top_movers(self) -> list[Ticker]:
        movers = sorted(
            self.tickers, key=lambda t: abs(t["change_pct"]), reverse=True
        )
        return movers[:6]

    @rx.var
    def lookup_results(self) -> list[Ticker]:
        q = self.lookup_query.strip().upper()
        if not q:
            return self.tickers[:8]
        return [
            t
            for t in self.tickers
            if q in t["symbol"] or q in t["name"].upper()
        ][:12]

    @rx.var
    def command_suggestions(self) -> list[CommandItem]:
        q = self.command_input.strip().upper()
        if not q:
            return []
        return [
            c
            for c in self.commands
            if c["cmd"].startswith(q) or q in c["desc"].upper()
        ][:6]

    @rx.var
    def order_notional(self) -> float:
        try:
            qty = float(self.trade_qty or "0")
        except ValueError:
            qty = 0
        return round(qty * self.selected_ticker["price"], 2)

    @rx.var
    def selected_mini_chart(self) -> list[dict[str, float | str]]:
        random.seed(hash(self.active_symbol) % 9973)
        base = self.selected_ticker["price"]
        pts: list[dict[str, float | str]] = []
        val = base * 0.97
        for i in range(24):
            val = val + random.uniform(-base * 0.006, base * 0.008)
            pts.append({"t": f"{i:02d}", "price": round(val, 2)})
        pts.append({"t": "now", "price": round(base, 2)})
        return pts

    @rx.var
    def retail_risk_summary(self) -> dict[str, str]:
        # Compact retail-friendly risk snapshot
        return {
            "risk_level": "Balanced",
            "risk_detail": "Your mix is diversified across stocks, crypto, and event markets.",
            "diversification": "Good",
            "cash_ratio": "27%",
        }

    @rx.var
    def chart_data(self) -> list[dict[str, float | str]]:
        random.seed(hash(self.active_symbol) % 10000)
        base = self.selected_ticker["price"]
        pts = []
        val = base * 0.96
        for i in range(40):
            val = val + random.uniform(-base * 0.008, base * 0.01)
            pts.append(
                {
                    "t": f"{9 + i // 4}:{(i % 4) * 15:02d}",
                    "price": round(val, 2),
                    "vol": round(random.uniform(0.5, 3.5), 2),
                }
            )
        return pts
