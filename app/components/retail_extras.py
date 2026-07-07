import reflex as rx
from app.states.terminal_state import TerminalState


TOOLTIP_STYLE = {
    "backgroundColor": "#0a0a0a",
    "border": "1px solid rgba(255,255,255,0.1)",
    "borderRadius": "12px",
    "fontSize": "12px",
    "color": "#fafafa",
    "padding": "8px 12px",
}


def portfolio_chart_card() -> rx.Component:
    return rx.el.section(
        rx.el.div(
            rx.el.div(
                rx.el.div(
                    rx.icon("chart-area", size=14, class_name="text-amber-300"),
                    rx.el.h3(
                        "Portfolio · last 7 days",
                        class_name="text-white text-sm font-semibold",
                    ),
                    class_name="flex items-center gap-2",
                ),
                rx.el.div(
                    rx.el.span(
                        "+2.13%",
                        class_name="text-green-400 text-xs font-bold tabular-nums bg-green-400/10 px-2 py-0.5 rounded-full",
                    ),
                    rx.el.span(
                        "vs. last week",
                        class_name="text-neutral-500 text-[11px]",
                    ),
                    class_name="flex items-center gap-2",
                ),
                class_name="flex items-center justify-between mb-3",
                aria_label="Portfolio performance summary",
            ),
            rx.el.div(
                rx.recharts.area_chart(
                    rx.recharts.cartesian_grid(
                        horizontal=True,
                        vertical=False,
                        class_name="opacity-10",
                    ),
                    rx.recharts.graphing_tooltip(
                        content_style=TOOLTIP_STYLE,
                        cursor={
                            "stroke": "#fbbf24",
                            "strokeDasharray": "3 3",
                        },
                        separator=" ",
                    ),
                    rx.recharts.area(
                        data_key="value",
                        stroke="#fbbf24",
                        fill="#fbbf24",
                        fill_opacity=0.15,
                        stroke_width=2,
                        type_="monotone",
                        dot=False,
                    ),
                    rx.recharts.x_axis(
                        data_key="t",
                        stroke="#525252",
                        tick_line=False,
                        axis_line=False,
                        custom_attrs={"fontSize": "10px"},
                    ),
                    rx.recharts.y_axis(
                        stroke="#525252",
                        tick_line=False,
                        axis_line=False,
                        custom_attrs={"fontSize": "10px"},
                        domain=["dataMin - 20000", "dataMax + 20000"],
                        width=55,
                    ),
                    data=TerminalState.portfolio_history,
                    width="100%",
                    height=180,
                    margin={"left": 0, "right": 10, "top": 5, "bottom": 0},
                ),
            ),
            rx.el.p(
                "Plain english: this line is the total value of everything you hold. Up is good, but zoom out — one bad day isn't the whole story.",
                class_name="text-neutral-500 text-[11px] leading-relaxed mt-3",
            ),
            class_name="p-5",
        ),
        class_name="rounded-3xl bg-neutral-900/60 border border-white/5",
    )


def selected_asset_spotlight() -> rx.Component:
    return rx.el.section(
        rx.el.div(
            rx.el.div(
                rx.el.div(
                    rx.el.p(
                        "Currently viewing",
                        class_name="text-neutral-500 text-[10px] font-semibold tracking-widest uppercase",
                    ),
                    rx.el.div(
                        rx.el.p(
                            TerminalState.active_symbol,
                            class_name="text-white text-2xl font-bold tracking-tight",
                        ),
                        rx.el.p(
                            TerminalState.selected_ticker["name"],
                            class_name="text-neutral-400 text-xs",
                        ),
                        class_name="mt-1",
                    ),
                ),
                rx.el.div(
                    rx.el.p(
                        f"${TerminalState.selected_ticker['price']:,.2f}",
                        class_name="text-white text-2xl font-bold tabular-nums text-right",
                    ),
                    rx.el.div(
                        rx.cond(
                            TerminalState.selected_ticker["change_pct"] >= 0,
                            rx.icon("trending-up", size=12),
                            rx.icon("trending-down", size=12),
                        ),
                        rx.el.span(
                            rx.cond(
                                TerminalState.selected_ticker["change_pct"]
                                >= 0,
                                f"+{TerminalState.selected_ticker['change_pct']:.2f}%",
                                f"{TerminalState.selected_ticker['change_pct']:.2f}%",
                            ),
                            class_name="text-xs font-bold tabular-nums",
                        ),
                        class_name=rx.cond(
                            TerminalState.selected_ticker["change_pct"] >= 0,
                            "flex items-center gap-1 justify-end text-green-400 mt-1",
                            "flex items-center gap-1 justify-end text-red-400 mt-1",
                        ),
                    ),
                ),
                class_name="flex items-start justify-between mb-4",
            ),
            rx.el.div(
                rx.recharts.area_chart(
                    rx.recharts.graphing_tooltip(
                        content_style=TOOLTIP_STYLE,
                        cursor={
                            "stroke": "#22d3ee",
                            "strokeDasharray": "3 3",
                        },
                        separator=" ",
                    ),
                    rx.recharts.area(
                        data_key="price",
                        stroke=rx.cond(
                            TerminalState.selected_ticker["change_pct"] >= 0,
                            "#34d399",
                            "#f87171",
                        ),
                        fill=rx.cond(
                            TerminalState.selected_ticker["change_pct"] >= 0,
                            "#34d399",
                            "#f87171",
                        ),
                        fill_opacity=0.12,
                        stroke_width=2,
                        type_="monotone",
                        dot=False,
                    ),
                    rx.recharts.x_axis(
                        data_key="t",
                        hide=True,
                    ),
                    rx.recharts.y_axis(
                        hide=True,
                        domain=["dataMin - 1", "dataMax + 1"],
                    ),
                    data=TerminalState.selected_mini_chart,
                    width="100%",
                    height=120,
                    margin={"left": 0, "right": 0, "top": 5, "bottom": 0},
                ),
            ),
            rx.el.div(
                rx.el.button(
                    rx.icon("arrow-up-right", size=14),
                    "Buy",
                    on_click=lambda: TerminalState.open_trade_dialog(
                        TerminalState.active_symbol, "BUY"
                    ),
                    class_name="flex-1 flex items-center justify-center gap-1.5 bg-emerald-400 hover:bg-emerald-300 text-black font-bold text-sm py-2.5 rounded-xl",
                    aria_label=f"Buy {TerminalState.active_symbol}",
                ),
                rx.el.button(
                    rx.icon("arrow-down-right", size=14),
                    "Sell",
                    on_click=lambda: TerminalState.open_trade_dialog(
                        TerminalState.active_symbol, "SELL"
                    ),
                    class_name="flex-1 flex items-center justify-center gap-1.5 bg-white/10 hover:bg-white/15 text-white font-semibold text-sm py-2.5 rounded-xl",
                    aria_label=f"Sell {TerminalState.active_symbol}",
                ),
                rx.el.button(
                    rx.icon("bell", size=14),
                    on_click=lambda: TerminalState.open_alert_dialog(
                        TerminalState.active_symbol
                    ),
                    class_name="flex items-center justify-center bg-cyan-400/10 hover:bg-cyan-400/20 text-cyan-300 px-3 py-2.5 rounded-xl border border-cyan-400/20",
                    title="Set alert",
                    aria_label=f"Set alert for {TerminalState.active_symbol}",
                ),
                class_name="flex items-center gap-2 mt-4",
            ),
            class_name="p-5",
        ),
        class_name="rounded-3xl bg-gradient-to-br from-neutral-900 to-neutral-950 border border-white/5",
    )


def risk_snapshot_card() -> rx.Component:
    return rx.el.section(
        rx.el.div(
            rx.el.div(
                rx.icon("shield-check", size=14, class_name="text-emerald-300"),
                rx.el.h3(
                    "Your risk profile",
                    class_name="text-white text-sm font-semibold",
                ),
                class_name="flex items-center gap-2 mb-3",
            ),
            rx.el.div(
                _risk_stat("Balance", "Balanced", "text-emerald-300"),
                _risk_stat("Diversification", "Good", "text-emerald-300"),
                _risk_stat("Cash on hand", "27%", "text-white"),
                _risk_stat("Volatility", "Moderate", "text-amber-300"),
                class_name="grid grid-cols-2 gap-2",
            ),
            rx.el.p(
                "Your mix is spread across stocks, crypto, and event markets. Keep some cash aside for opportunities — and never invest money you can't afford to lose.",
                class_name="text-neutral-400 text-[11px] leading-relaxed mt-3",
            ),
            class_name="p-5",
        ),
        class_name="rounded-3xl bg-neutral-900/60 border border-white/5",
    )


def _risk_stat(label: str, value: str, color: str) -> rx.Component:
    return rx.el.div(
        rx.el.p(
            label,
            class_name="text-neutral-500 text-[10px] font-medium tracking-widest uppercase",
        ),
        rx.el.p(
            value,
            class_name=f"{color} text-sm font-bold mt-0.5",
        ),
        class_name="rounded-xl bg-white/[0.03] border border-white/5 px-3 py-2",
    )
