import reflex as rx
from app.states.terminal_state import (
    TerminalState,
    Ticker,
    IndexData,
    NewsItem,
    CurrencyPair,
    Commodity,
    CommandItem,
)


def panel_shell(
    title: str, subtitle: str, children: rx.Component, code: str = ""
) -> rx.Component:
    return rx.el.div(
        rx.el.div(
            rx.el.div(
                rx.el.span(
                    title,
                    class_name="text-amber-400 font-bold text-[11px] tracking-widest",
                ),
                rx.el.span(
                    subtitle,
                    class_name="text-neutral-500 text-[10px] ml-2 tracking-wider",
                ),
                class_name="flex items-center",
            ),
            rx.el.span(
                code, class_name="text-neutral-600 text-[10px] font-mono"
            ),
            class_name="flex items-center justify-between px-3 py-1.5 bg-neutral-900 border-b border-neutral-800",
        ),
        rx.el.div(children, class_name="p-0"),
        class_name="border border-neutral-800 bg-black",
    )


def watchlist_row(t: Ticker) -> rx.Component:
    return rx.el.tr(
        rx.el.td(
            rx.el.button(
                t["symbol"],
                on_click=lambda: TerminalState.select_symbol(t["symbol"]),
                class_name=rx.cond(
                    TerminalState.active_symbol == t["symbol"],
                    "text-black bg-amber-400 font-bold px-1.5 py-0.5",
                    "text-amber-400 font-bold hover:bg-neutral-900 px-1.5 py-0.5",
                ),
            ),
            class_name="px-2 py-1",
        ),
        rx.el.td(
            t["name"],
            class_name="px-2 py-1 text-neutral-400 text-[10px] truncate max-w-[120px]",
        ),
        rx.el.td(
            f"{t['price']:.2f}",
            class_name="px-2 py-1 text-neutral-200 text-right tabular-nums",
        ),
        rx.el.td(
            rx.cond(
                t["change"] >= 0, f"+{t['change']:.2f}", f"{t['change']:.2f}"
            ),
            class_name=rx.cond(
                t["change"] >= 0,
                "px-2 py-1 text-green-400 text-right tabular-nums",
                "px-2 py-1 text-red-400 text-right tabular-nums",
            ),
        ),
        rx.el.td(
            rx.cond(
                t["change_pct"] >= 0,
                f"+{t['change_pct']:.2f}%",
                f"{t['change_pct']:.2f}%",
            ),
            class_name=rx.cond(
                t["change_pct"] >= 0,
                "px-2 py-1 text-green-400 text-right tabular-nums font-semibold",
                "px-2 py-1 text-red-400 text-right tabular-nums font-semibold",
            ),
        ),
        rx.el.td(
            t["volume"],
            class_name="px-2 py-1 text-neutral-500 text-right tabular-nums text-[10px]",
        ),
        class_name="border-b border-neutral-900 hover:bg-neutral-900/50 transition-colors text-[11px]",
    )


def _filter_btn(label: str) -> rx.Component:
    return rx.el.button(
        label,
        on_click=lambda: TerminalState.set_watchlist_filter(label),
        class_name=rx.cond(
            TerminalState.watchlist_filter == label,
            "text-black bg-amber-400 font-bold text-[10px] px-2 py-0.5 tracking-widest",
            "text-neutral-400 hover:text-amber-400 bg-neutral-900 text-[10px] px-2 py-0.5 tracking-widest",
        ),
    )


def watchlist_panel() -> rx.Component:
    return panel_shell(
        "WATCHLIST",
        "MULTI-ASSET",
        rx.el.div(
            rx.el.div(
                _filter_btn("ALL"),
                _filter_btn("STOCK"),
                _filter_btn("CRYPTO"),
                _filter_btn("ETF"),
                _filter_btn("GAINERS"),
                _filter_btn("LOSERS"),
                class_name="flex items-center gap-1 px-2 py-1.5 bg-neutral-950 border-b border-neutral-900",
            ),
            rx.cond(
                TerminalState.filtered_tickers.length() > 0,
                rx.el.table(
                    rx.el.thead(
                        rx.el.tr(
                            rx.el.th(
                                "TICKER",
                                class_name="px-2 py-1.5 text-left text-neutral-500 text-[10px] tracking-wider",
                            ),
                            rx.el.th(
                                "NAME",
                                class_name="px-2 py-1.5 text-left text-neutral-500 text-[10px] tracking-wider",
                            ),
                            rx.el.th(
                                "LAST",
                                class_name="px-2 py-1.5 text-right text-neutral-500 text-[10px] tracking-wider",
                            ),
                            rx.el.th(
                                "CHG",
                                class_name="px-2 py-1.5 text-right text-neutral-500 text-[10px] tracking-wider",
                            ),
                            rx.el.th(
                                "%CHG",
                                class_name="px-2 py-1.5 text-right text-neutral-500 text-[10px] tracking-wider",
                            ),
                            rx.el.th(
                                "VOL",
                                class_name="px-2 py-1.5 text-right text-neutral-500 text-[10px] tracking-wider",
                            ),
                            class_name="bg-neutral-950 border-b border-neutral-800",
                        ),
                    ),
                    rx.el.tbody(
                        rx.foreach(
                            TerminalState.filtered_tickers, watchlist_row
                        )
                    ),
                    class_name="w-full table-auto",
                ),
                rx.el.div(
                    rx.icon(
                        "inbox", size=24, class_name="text-neutral-700 mb-2"
                    ),
                    rx.el.p(
                        "NO ASSETS MATCH FILTER",
                        class_name="text-neutral-600 text-[11px] tracking-widest",
                    ),
                    class_name="flex flex-col items-center justify-center py-10",
                ),
            ),
        ),
        "EQTY<GO>",
    )


def index_row(idx: IndexData) -> rx.Component:
    return rx.el.div(
        rx.el.div(
            rx.el.p(
                idx["name"],
                class_name="text-neutral-400 text-[10px] tracking-wider font-semibold",
            ),
            rx.el.p(
                f"{idx['value']:,.2f}",
                class_name="text-neutral-100 text-sm font-bold tabular-nums mt-0.5",
            ),
        ),
        rx.el.div(
            rx.el.p(
                rx.cond(
                    idx["change"] >= 0,
                    f"+{idx['change']:.2f}",
                    f"{idx['change']:.2f}",
                ),
                class_name=rx.cond(
                    idx["change"] >= 0,
                    "text-green-400 text-[11px] tabular-nums text-right",
                    "text-red-400 text-[11px] tabular-nums text-right",
                ),
            ),
            rx.el.p(
                rx.cond(
                    idx["change_pct"] >= 0,
                    f"▲ +{idx['change_pct']:.2f}%",
                    f"▼ {idx['change_pct']:.2f}%",
                ),
                class_name=rx.cond(
                    idx["change_pct"] >= 0,
                    "text-green-400 text-[11px] font-semibold tabular-nums text-right",
                    "text-red-400 text-[11px] font-semibold tabular-nums text-right",
                ),
            ),
        ),
        class_name="flex items-center justify-between px-3 py-2 border-b border-neutral-900 hover:bg-neutral-900/40",
    )


def indices_panel() -> rx.Component:
    return panel_shell(
        "WORLD INDICES",
        "GLOBAL EQUITIES",
        rx.el.div(rx.foreach(TerminalState.indices, index_row)),
        "WEI<GO>",
    )


def news_row(n: NewsItem) -> rx.Component:
    return rx.el.div(
        rx.el.div(
            rx.el.span(
                n["time"],
                class_name="text-amber-400 font-bold text-[10px] tabular-nums mr-2",
            ),
            rx.el.span(
                n["source"],
                class_name="text-neutral-500 text-[10px] font-bold mr-2 w-10 inline-block",
            ),
            rx.el.span(
                n["tag"],
                class_name="text-black bg-amber-500/80 text-[9px] font-bold px-1 py-0.5 mr-2 tracking-wider",
            ),
            class_name="flex items-center flex-shrink-0",
        ),
        rx.el.p(
            n["headline"],
            class_name="text-neutral-300 text-[11px] leading-tight hover:text-amber-300 cursor-pointer",
        ),
        class_name="flex items-start gap-2 px-3 py-1.5 border-b border-neutral-900 hover:bg-neutral-900/40",
    )


def news_panel() -> rx.Component:
    return panel_shell(
        "TOP NEWS",
        "REAL-TIME WIRE",
        rx.el.div(
            rx.foreach(TerminalState.news_items, news_row),
            class_name="max-h-[420px] overflow-y-auto",
        ),
        "TOP<GO>",
    )


def fx_row(c: CurrencyPair) -> rx.Component:
    return rx.el.div(
        rx.el.span(
            c["pair"],
            class_name="text-neutral-200 font-bold text-[11px] tracking-wider",
        ),
        rx.el.span(
            f"{c['rate']:.4f}",
            class_name="text-neutral-300 text-[11px] tabular-nums",
        ),
        rx.el.span(
            rx.cond(
                c["change_pct"] >= 0,
                f"+{c['change_pct']:.2f}%",
                f"{c['change_pct']:.2f}%",
            ),
            class_name=rx.cond(
                c["change_pct"] >= 0,
                "text-green-400 text-[11px] font-semibold tabular-nums",
                "text-red-400 text-[11px] font-semibold tabular-nums",
            ),
        ),
        class_name="grid grid-cols-3 gap-2 px-3 py-1.5 border-b border-neutral-900 hover:bg-neutral-900/40",
    )


def fx_panel() -> rx.Component:
    return panel_shell(
        "FX RATES",
        "CURRENCIES",
        rx.el.div(rx.foreach(TerminalState.currencies, fx_row)),
        "FXIP<GO>",
    )


def commodity_row(c: Commodity) -> rx.Component:
    return rx.el.div(
        rx.el.div(
            rx.el.p(
                c["name"],
                class_name="text-neutral-200 text-[11px] font-bold tracking-wider",
            ),
            rx.el.p(
                c["unit"],
                class_name="text-neutral-600 text-[9px] tracking-wider",
            ),
        ),
        rx.el.div(
            rx.el.p(
                f"{c['price']:,.2f}",
                class_name="text-neutral-100 text-[12px] font-bold tabular-nums text-right",
            ),
            rx.el.p(
                rx.cond(
                    c["change_pct"] >= 0,
                    f"+{c['change_pct']:.2f}%",
                    f"{c['change_pct']:.2f}%",
                ),
                class_name=rx.cond(
                    c["change_pct"] >= 0,
                    "text-green-400 text-[10px] font-semibold tabular-nums text-right",
                    "text-red-400 text-[10px] font-semibold tabular-nums text-right",
                ),
            ),
        ),
        class_name="flex items-center justify-between px-3 py-1.5 border-b border-neutral-900 hover:bg-neutral-900/40",
    )


def commodities_panel() -> rx.Component:
    return panel_shell(
        "COMMODITIES & CRYPTO",
        "SPOT PRICES",
        rx.el.div(rx.foreach(TerminalState.commodities, commodity_row)),
        "CMDTY<GO>",
    )


def chart_panel() -> rx.Component:
    return panel_shell(
        rx.el.div(
            rx.el.span(
                TerminalState.active_symbol,
                class_name="text-amber-400 font-bold text-sm mr-2",
            ),
            rx.el.span(
                TerminalState.selected_ticker["name"],
                class_name="text-neutral-400 text-[11px] mr-3",
            ),
            rx.el.span(
                f"${TerminalState.selected_ticker['price']:.2f}",
                class_name="text-neutral-100 font-bold text-sm tabular-nums mr-2",
            ),
            rx.el.span(
                rx.cond(
                    TerminalState.selected_ticker["change_pct"] >= 0,
                    f"▲ +{TerminalState.selected_ticker['change_pct']:.2f}%",
                    f"▼ {TerminalState.selected_ticker['change_pct']:.2f}%",
                ),
                class_name=rx.cond(
                    TerminalState.selected_ticker["change_pct"] >= 0,
                    "text-green-400 font-bold text-[11px]",
                    "text-red-400 font-bold text-[11px]",
                ),
            ),
            class_name="flex items-center",
        ),
        "INTRADAY",
        rx.el.div(
            rx.recharts.area_chart(
                rx.recharts.cartesian_grid(
                    stroke_dasharray="2 2", stroke="#262626", vertical=False
                ),
                rx.recharts.graphing_tooltip(
                    content_style={
                        "backgroundColor": "#0a0a0a",
                        "border": "1px solid #fbbf24",
                        "fontSize": "11px",
                        "color": "#fbbf24",
                    },
                    cursor={"stroke": "#fbbf24", "strokeDasharray": "3 3"},
                ),
                rx.recharts.area(
                    data_key="price",
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
                    custom_attrs={"fontSize": "9px"},
                    interval=6,
                ),
                rx.recharts.y_axis(
                    stroke="#525252",
                    tick_line=False,
                    axis_line=False,
                    custom_attrs={"fontSize": "9px"},
                    domain=["dataMin - 1", "dataMax + 1"],
                    width=45,
                ),
                data=TerminalState.chart_data,
                width="100%",
                height=240,
                margin={"left": 0, "right": 10, "top": 10, "bottom": 0},
            ),
            class_name="p-2 bg-neutral-950",
        ),
        "GP<GO>",
    )


def command_ref_row(c: CommandItem) -> rx.Component:
    return rx.el.div(
        rx.el.span(
            c["cmd"], class_name="text-amber-400 font-bold text-[11px] w-14"
        ),
        rx.el.span(c["desc"], class_name="text-neutral-400 text-[11px]"),
        class_name="flex items-center gap-2 px-3 py-1 border-b border-neutral-900 hover:bg-neutral-900/40 cursor-pointer",
        on_click=lambda: TerminalState.set_command(c["cmd"]),
    )


def command_reference() -> rx.Component:
    return panel_shell(
        "FUNCTIONS",
        "QUICK REFERENCE",
        rx.el.div(rx.foreach(TerminalState.commands, command_ref_row)),
        "HELP<GO>",
    )


def history_row(h: str) -> rx.Component:
    return rx.el.div(
        rx.el.span(">", class_name="text-neutral-600 mr-2"),
        rx.el.span(h, class_name="text-neutral-400"),
        class_name="px-3 py-1 text-[11px] font-mono border-b border-neutral-900 hover:bg-neutral-900/40",
    )


def history_panel() -> rx.Component:
    return panel_shell(
        "COMMAND HISTORY",
        "SESSION LOG",
        rx.el.div(rx.foreach(TerminalState.command_history, history_row)),
        "",
    )
