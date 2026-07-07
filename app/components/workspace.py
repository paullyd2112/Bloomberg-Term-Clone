import reflex as rx
from app.states.terminal_state import TerminalState
from app.components.panels import (
    watchlist_panel,
    indices_panel,
    news_panel,
    fx_panel,
    commodities_panel,
    chart_panel,
    command_reference,
    history_panel,
)
from app.components.trader_panels import (
    prediction_markets_panel,
    crypto_movers_panel,
    order_ticket_panel,
    alerts_panel,
    portfolio_risk_panel,
    lookup_dialog,
)
from app.components.spotlight import crypto_spotlight, predictions_spotlight


def stats_strip() -> rx.Component:
    return rx.el.div(
        rx.el.div(
            rx.el.p(
                "PORTFOLIO VALUE",
                class_name="text-neutral-500 text-[10px] tracking-widest",
            ),
            rx.el.p(
                "$4,287,914.32",
                class_name="text-amber-400 text-lg font-bold tabular-nums",
            ),
            rx.el.p(
                "+$18,472 (+0.43%) TODAY",
                class_name="text-green-400 text-[10px] font-semibold tabular-nums",
            ),
            class_name="px-4 py-2 border-r border-neutral-800",
        ),
        rx.el.div(
            rx.el.p(
                "DAY P&L",
                class_name="text-neutral-500 text-[10px] tracking-widest",
            ),
            rx.el.p(
                "+$18,472.14",
                class_name="text-green-400 text-lg font-bold tabular-nums",
            ),
            rx.el.p(
                "REALIZED: +$4,231",
                class_name="text-neutral-400 text-[10px] tabular-nums",
            ),
            class_name="px-4 py-2 border-r border-neutral-800",
        ),
        rx.el.div(
            rx.el.p(
                "BUYING POWER",
                class_name="text-neutral-500 text-[10px] tracking-widest",
            ),
            rx.el.p(
                "$1,142,388.00",
                class_name="text-neutral-100 text-lg font-bold tabular-nums",
            ),
            rx.el.p(
                "MARGIN AVAILABLE",
                class_name="text-neutral-500 text-[10px] tracking-widest",
            ),
            class_name="px-4 py-2 border-r border-neutral-800",
        ),
        rx.el.div(
            rx.el.p(
                "OPEN POSITIONS",
                class_name="text-neutral-500 text-[10px] tracking-widest",
            ),
            rx.el.p(
                "24",
                class_name="text-neutral-100 text-lg font-bold tabular-nums",
            ),
            rx.el.p(
                "14 LONG • 10 SHORT",
                class_name="text-neutral-400 text-[10px] tracking-wider",
            ),
            class_name="px-4 py-2 border-r border-neutral-800",
        ),
        rx.el.div(
            rx.el.p(
                "VIX", class_name="text-neutral-500 text-[10px] tracking-widest"
            ),
            rx.el.p(
                "15.42",
                class_name="text-neutral-100 text-lg font-bold tabular-nums",
            ),
            rx.el.p(
                "-5.10% LOW VOL",
                class_name="text-green-400 text-[10px] font-semibold tabular-nums",
            ),
            class_name="px-4 py-2 border-r border-neutral-800",
        ),
        rx.el.div(
            rx.el.p(
                "10Y TREASURY",
                class_name="text-neutral-500 text-[10px] tracking-widest",
            ),
            rx.el.p(
                "4.428%",
                class_name="text-neutral-100 text-lg font-bold tabular-nums",
            ),
            rx.el.p(
                "+3.2 BPS",
                class_name="text-red-400 text-[10px] font-semibold tabular-nums",
            ),
            class_name="px-4 py-2 border-r border-neutral-800",
        ),
        rx.el.div(
            rx.el.p(
                "DXY", class_name="text-neutral-500 text-[10px] tracking-widest"
            ),
            rx.el.p(
                "106.84",
                class_name="text-neutral-100 text-lg font-bold tabular-nums",
            ),
            rx.el.p(
                "+0.18% USD STRONG",
                class_name="text-green-400 text-[10px] font-semibold tabular-nums",
            ),
            class_name="px-4 py-2",
        ),
        class_name="flex items-stretch bg-neutral-950 border-b border-neutral-800 overflow-x-auto",
    )


def workspace() -> rx.Component:
    return rx.el.div(
        stats_strip(),
        lookup_dialog(),
        rx.el.div(
            rx.el.div(
                crypto_spotlight(),
                predictions_spotlight(),
                class_name="grid grid-cols-1 xl:grid-cols-2 gap-2 p-2",
            ),
            rx.el.div(
                rx.el.div(
                    chart_panel(),
                    rx.el.div(
                        rx.el.div(
                            watchlist_panel(), class_name="lg:col-span-2"
                        ),
                        order_ticket_panel(),
                        class_name="grid grid-cols-1 lg:grid-cols-3 gap-2 mt-2",
                    ),
                    rx.el.div(
                        prediction_markets_panel(),
                        news_panel(),
                        class_name="grid grid-cols-1 lg:grid-cols-2 gap-2 mt-2",
                    ),
                    class_name="lg:col-span-3 flex flex-col gap-2",
                ),
                rx.el.div(
                    indices_panel(),
                    crypto_movers_panel(),
                    alerts_panel(),
                    portfolio_risk_panel(),
                    fx_panel(),
                    commodities_panel(),
                    command_reference(),
                    history_panel(),
                    class_name="lg:col-span-1 flex flex-col gap-2",
                ),
                class_name="grid grid-cols-1 lg:grid-cols-4 gap-2 p-2",
            ),
            class_name="flex-1 overflow-auto",
        ),
        rx.moment(
            interval=2000,
            on_change=TerminalState.tick,
            class_name="hidden",
        ),
        class_name="flex flex-col flex-1 min-h-0",
    )
