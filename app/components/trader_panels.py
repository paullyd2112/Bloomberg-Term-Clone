import reflex as rx
from app.states.terminal_state import (
    TerminalState,
    PredictionMarket,
    Alert,
    RiskMetric,
    Ticker,
)
from app.components.panels import panel_shell


def _prediction_row(p: PredictionMarket) -> rx.Component:
    return rx.el.div(
        rx.el.div(
            rx.el.span(
                p["category"],
                class_name="text-cyan-400 text-[9px] tracking-widest font-bold",
            ),
            rx.el.span(
                p["resolves"],
                class_name="text-neutral-600 text-[9px] tracking-wider ml-auto",
            ),
            class_name="flex items-center mb-1",
        ),
        rx.el.p(
            p["question"],
            class_name="text-neutral-200 text-[11px] leading-tight mb-2",
        ),
        rx.el.div(
            rx.el.div(
                rx.el.span(
                    "YES", class_name="text-green-400 text-[9px] font-bold mr-1"
                ),
                rx.el.span(
                    f"{p['yes_price'] * 100:.0f}¢",
                    class_name="text-green-400 text-[11px] font-bold tabular-nums",
                ),
                class_name="flex items-baseline",
            ),
            rx.el.div(
                rx.el.div(
                    class_name="h-1 bg-green-500",
                    style={"width": f"{p['yes_price'] * 100:.0f}%"},
                ),
                rx.el.div(
                    class_name="h-1 bg-red-500 ml-auto",
                    style={"width": f"{p['no_price'] * 100:.0f}%"},
                ),
                class_name="flex-1 mx-2 h-1 bg-neutral-900 flex",
            ),
            rx.el.div(
                rx.el.span(
                    "NO", class_name="text-red-400 text-[9px] font-bold mr-1"
                ),
                rx.el.span(
                    f"{p['no_price'] * 100:.0f}¢",
                    class_name="text-red-400 text-[11px] font-bold tabular-nums",
                ),
                class_name="flex items-baseline",
            ),
            class_name="flex items-center",
        ),
        rx.el.div(
            rx.el.span(
                rx.cond(
                    p["yes_change"] >= 0,
                    f"▲ +{p['yes_change'] * 100:.1f}¢",
                    f"▼ {p['yes_change'] * 100:.1f}¢",
                ),
                class_name=rx.cond(
                    p["yes_change"] >= 0,
                    "text-green-400 text-[10px] font-semibold",
                    "text-red-400 text-[10px] font-semibold",
                ),
            ),
            rx.el.span(
                f"VOL {p['volume']}",
                class_name="text-neutral-500 text-[9px] tracking-wider ml-auto",
            ),
            class_name="flex items-center mt-1",
        ),
        class_name="px-3 py-2 border-b border-neutral-900 hover:bg-neutral-900/40 cursor-pointer",
    )


def prediction_markets_panel() -> rx.Component:
    return panel_shell(
        "PREDICTION MARKETS",
        "EVENT ODDS",
        rx.el.div(
            rx.foreach(TerminalState.prediction_markets, _prediction_row),
            class_name="max-h-[380px] overflow-y-auto",
        ),
        "PRED<GO>",
    )


def _crypto_mover_row(t: Ticker) -> rx.Component:
    return rx.el.div(
        rx.el.button(
            t["symbol"],
            on_click=lambda: TerminalState.select_symbol(t["symbol"]),
            class_name=rx.cond(
                TerminalState.active_symbol == t["symbol"],
                "text-black bg-amber-400 font-bold px-1.5 py-0.5 text-[11px] w-14",
                "text-cyan-400 font-bold hover:bg-neutral-900 px-1.5 py-0.5 text-[11px] w-14 text-left",
            ),
        ),
        rx.el.span(
            f"${t['price']:,.2f}",
            class_name="text-neutral-200 text-[11px] tabular-nums flex-1 text-right",
        ),
        rx.el.span(
            rx.cond(
                t["change_pct"] >= 0,
                f"▲ +{t['change_pct']:.2f}%",
                f"▼ {t['change_pct']:.2f}%",
            ),
            class_name=rx.cond(
                t["change_pct"] >= 0,
                "text-green-400 text-[11px] font-bold tabular-nums w-20 text-right",
                "text-red-400 text-[11px] font-bold tabular-nums w-20 text-right",
            ),
        ),
        class_name="flex items-center gap-2 px-3 py-1.5 border-b border-neutral-900 hover:bg-neutral-900/40",
    )


def crypto_movers_panel() -> rx.Component:
    return panel_shell(
        "CRYPTO MOVERS",
        "24H",
        rx.el.div(rx.foreach(TerminalState.crypto_movers, _crypto_mover_row)),
        "CRYP<GO>",
    )


def _order_side_btn(side: str) -> rx.Component:
    return rx.el.button(
        side,
        on_click=lambda: TerminalState.set_trade_side(side),
        class_name=rx.cond(
            TerminalState.trade_side == side,
            rx.cond(
                side == "BUY",
                "bg-green-500 text-black font-bold text-[11px] px-4 py-1.5 tracking-widest flex-1",
                "bg-red-500 text-black font-bold text-[11px] px-4 py-1.5 tracking-widest flex-1",
            ),
            "bg-neutral-900 text-neutral-400 hover:text-neutral-200 font-bold text-[11px] px-4 py-1.5 tracking-widest flex-1",
        ),
    )


def _order_type_btn(t: str) -> rx.Component:
    return rx.el.button(
        t,
        on_click=lambda: TerminalState.set_trade_order_type(t),
        class_name=rx.cond(
            TerminalState.trade_order_type == t,
            "text-black bg-amber-400 font-bold text-[10px] px-2 py-0.5 tracking-widest flex-1",
            "text-neutral-400 hover:text-amber-400 bg-neutral-900 text-[10px] px-2 py-0.5 tracking-widest flex-1",
        ),
    )


def order_ticket_panel() -> rx.Component:
    return panel_shell(
        "ORDER TICKET",
        TerminalState.active_symbol,
        rx.el.div(
            rx.el.div(
                _order_side_btn("BUY"),
                _order_side_btn("SELL"),
                class_name="flex gap-1 px-3 pt-3",
            ),
            rx.el.div(
                _order_type_btn("MARKET"),
                _order_type_btn("LIMIT"),
                _order_type_btn("STOP"),
                class_name="flex gap-1 px-3 pt-2",
            ),
            rx.el.div(
                rx.el.div(
                    rx.el.label(
                        "QTY",
                        class_name="text-neutral-500 text-[9px] tracking-widest",
                    ),
                    rx.el.input(
                        default_value=TerminalState.trade_qty,
                        on_change=TerminalState.set_trade_qty.debounce(200),
                        class_name="w-full bg-neutral-950 border border-neutral-800 text-amber-300 font-bold text-[13px] px-2 py-1 outline-hidden focus:border-amber-500 tabular-nums",
                    ),
                    class_name="flex-1",
                ),
                rx.cond(
                    TerminalState.trade_order_type != "MARKET",
                    rx.el.div(
                        rx.el.label(
                            "LIMIT PX",
                            class_name="text-neutral-500 text-[9px] tracking-widest",
                        ),
                        rx.el.input(
                            placeholder=f"{TerminalState.selected_ticker['price']:.2f}",
                            default_value=TerminalState.trade_limit,
                            on_change=TerminalState.set_trade_limit.debounce(
                                200
                            ),
                            class_name="w-full bg-neutral-950 border border-neutral-800 text-amber-300 font-bold text-[13px] px-2 py-1 outline-hidden focus:border-amber-500 tabular-nums",
                        ),
                        class_name="flex-1",
                    ),
                    rx.fragment(),
                ),
                class_name="flex gap-2 px-3 pt-2",
            ),
            rx.el.div(
                rx.el.div(
                    rx.el.span(
                        "LAST",
                        class_name="text-neutral-600 text-[9px] tracking-widest",
                    ),
                    rx.el.span(
                        f"${TerminalState.selected_ticker['price']:,.2f}",
                        class_name="text-neutral-200 text-[11px] font-bold tabular-nums",
                    ),
                    class_name="flex items-center justify-between px-1 py-0.5",
                ),
                rx.el.div(
                    rx.el.span(
                        "NOTIONAL",
                        class_name="text-neutral-600 text-[9px] tracking-widest",
                    ),
                    rx.el.span(
                        f"${TerminalState.order_notional:,.2f}",
                        class_name="text-amber-400 text-[11px] font-bold tabular-nums",
                    ),
                    class_name="flex items-center justify-between px-1 py-0.5",
                ),
                rx.el.div(
                    rx.el.span(
                        "BUYING PWR",
                        class_name="text-neutral-600 text-[9px] tracking-widest",
                    ),
                    rx.el.span(
                        "$1,142,388",
                        class_name="text-green-400 text-[11px] font-bold tabular-nums",
                    ),
                    class_name="flex items-center justify-between px-1 py-0.5",
                ),
                class_name="mx-3 mt-3 p-2 border border-neutral-800 bg-neutral-950",
            ),
            rx.el.div(
                rx.el.button(
                    "PREVIEW",
                    on_click=TerminalState.preview_order,
                    class_name="flex-1 border border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10 text-[11px] font-bold py-1.5 tracking-widest",
                ),
                rx.el.button(
                    rx.cond(
                        TerminalState.trade_side == "BUY",
                        "▲ SUBMIT BUY",
                        "▼ SUBMIT SELL",
                    ),
                    on_click=TerminalState.submit_order,
                    class_name=rx.cond(
                        TerminalState.trade_side == "BUY",
                        "flex-1 bg-green-500 hover:bg-green-400 text-black text-[11px] font-bold py-1.5 tracking-widest",
                        "flex-1 bg-red-500 hover:bg-red-400 text-black text-[11px] font-bold py-1.5 tracking-widest",
                    ),
                ),
                class_name="flex gap-2 px-3 py-3",
            ),
        ),
        "TRDE<GO>",
    )


def _alert_row(a: Alert) -> rx.Component:
    return rx.el.div(
        rx.el.div(
            rx.el.span(
                a["symbol"],
                class_name="text-amber-400 font-bold text-[11px] w-12",
            ),
            rx.el.span(
                a["condition"],
                class_name="text-neutral-400 text-[10px] tracking-wider w-16",
            ),
            rx.el.span(
                f"{a['target']:,.2f}",
                class_name="text-neutral-200 text-[11px] font-bold tabular-nums flex-1 text-right",
            ),
            class_name="flex items-center gap-2 flex-1",
        ),
        rx.el.span(
            a["status"],
            class_name=rx.match(
                a["status"],
                (
                    "ARMED",
                    "text-green-400 bg-green-500/10 text-[9px] font-bold px-1.5 py-0.5 tracking-widest w-fit",
                ),
                (
                    "TRIGGERED",
                    "text-red-400 bg-red-500/10 text-[9px] font-bold px-1.5 py-0.5 tracking-widest w-fit animate-pulse",
                ),
                "text-neutral-500 bg-neutral-800 text-[9px] font-bold px-1.5 py-0.5 tracking-widest w-fit",
            ),
        ),
        rx.el.button(
            rx.icon("power", size=10),
            on_click=lambda: TerminalState.toggle_alert(a["id"]),
            class_name="text-neutral-500 hover:text-amber-400 p-1",
        ),
        rx.el.button(
            rx.icon("x", size=10),
            on_click=lambda: TerminalState.delete_alert(a["id"]),
            class_name="text-neutral-500 hover:text-red-400 p-1",
        ),
        class_name="flex items-center gap-2 px-3 py-1.5 border-b border-neutral-900 hover:bg-neutral-900/40",
    )


def alerts_panel() -> rx.Component:
    return panel_shell(
        "ALERTS",
        f"{TerminalState.alerts.length()} ACTIVE",
        rx.cond(
            TerminalState.alerts.length() > 0,
            rx.el.div(rx.foreach(TerminalState.alerts, _alert_row)),
            rx.el.div(
                rx.icon(
                    "bell-off", size=24, class_name="text-neutral-700 mb-2"
                ),
                rx.el.p(
                    "NO ACTIVE ALERTS",
                    class_name="text-neutral-600 text-[11px] tracking-widest",
                ),
                rx.el.p(
                    "Type ALRT to create one",
                    class_name="text-neutral-700 text-[10px] mt-1",
                ),
                class_name="flex flex-col items-center justify-center py-10",
            ),
        ),
        "ALRT<GO>",
    )


def _risk_cell(m: RiskMetric) -> rx.Component:
    return rx.el.div(
        rx.el.p(
            m["label"],
            class_name="text-neutral-500 text-[9px] tracking-widest font-semibold",
        ),
        rx.el.p(
            m["value"],
            class_name=rx.match(
                m["tone"],
                ("up", "text-green-400 text-sm font-bold tabular-nums"),
                ("down", "text-red-400 text-sm font-bold tabular-nums"),
                ("warn", "text-amber-400 text-sm font-bold tabular-nums"),
                "text-neutral-200 text-sm font-bold tabular-nums",
            ),
        ),
        rx.el.p(
            m["detail"],
            class_name="text-neutral-600 text-[9px] tracking-wider",
        ),
        class_name="px-3 py-2 border-r border-b border-neutral-900",
    )


def portfolio_risk_panel() -> rx.Component:
    return panel_shell(
        "RISK SNAPSHOT",
        "PORTFOLIO METRICS",
        rx.el.div(
            rx.foreach(TerminalState.risk_metrics, _risk_cell),
            class_name="grid grid-cols-2",
        ),
        "RISK<GO>",
    )


def _lookup_row(t: Ticker) -> rx.Component:
    return rx.el.button(
        rx.el.span(
            t["symbol"],
            class_name="text-amber-400 font-bold text-[12px] w-16 text-left",
        ),
        rx.el.span(
            t["name"],
            class_name="text-neutral-300 text-[11px] flex-1 text-left truncate",
        ),
        rx.el.span(
            t["asset_class"],
            class_name="text-cyan-400/70 text-[9px] tracking-widest w-14 text-right",
        ),
        rx.el.span(
            f"${t['price']:,.2f}",
            class_name="text-neutral-200 text-[11px] font-bold tabular-nums w-24 text-right",
        ),
        on_click=lambda: TerminalState.pick_lookup(t["symbol"]),
        class_name="flex items-center gap-3 px-4 py-2 hover:bg-neutral-900 border-b border-neutral-900 w-full",
    )


def lookup_dialog() -> rx.Component:
    return rx.cond(
        TerminalState.lookup_open,
        rx.el.div(
            rx.el.div(
                rx.el.div(
                    rx.el.span(
                        "SYMBOL LOOKUP",
                        class_name="text-amber-400 font-bold text-[11px] tracking-widest",
                    ),
                    rx.el.button(
                        rx.icon("x", size=14),
                        on_click=TerminalState.close_lookup,
                        class_name="text-neutral-500 hover:text-red-400 ml-auto",
                    ),
                    class_name="flex items-center px-4 py-2 border-b border-amber-500/40 bg-neutral-950",
                ),
                rx.el.div(
                    rx.icon(
                        "search", size=14, class_name="text-neutral-500 mr-2"
                    ),
                    rx.el.input(
                        placeholder="Search ticker or company…",
                        default_value=TerminalState.lookup_query,
                        on_change=TerminalState.set_lookup_query.debounce(150),
                        auto_focus=True,
                        class_name="flex-1 bg-transparent border-none outline-hidden text-amber-300 placeholder-neutral-700 font-mono text-[13px] tracking-wider",
                    ),
                    class_name="flex items-center px-4 py-2 border-b border-neutral-800",
                ),
                rx.cond(
                    TerminalState.lookup_results.length() > 0,
                    rx.el.div(
                        rx.foreach(TerminalState.lookup_results, _lookup_row),
                        class_name="max-h-[400px] overflow-y-auto",
                    ),
                    rx.el.div(
                        rx.icon(
                            "search-x",
                            size=24,
                            class_name="text-neutral-700 mb-2",
                        ),
                        rx.el.p(
                            "NO MATCHES",
                            class_name="text-neutral-600 text-[11px] tracking-widest",
                        ),
                        class_name="flex flex-col items-center justify-center py-12",
                    ),
                ),
                class_name="bg-black border-2 border-amber-500/50 w-full max-w-2xl",
            ),
            on_click=TerminalState.close_lookup,
            class_name="fixed inset-0 bg-black/80 z-50 flex items-start justify-center pt-24",
        ),
        rx.fragment(),
    )
