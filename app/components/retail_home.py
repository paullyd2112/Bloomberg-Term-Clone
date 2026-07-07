import reflex as rx
from app.states.terminal_state import (
    TerminalState,
    Ticker,
    PredictionMarket,
    IndexData,
    NewsItem,
)
from app.components.guided_dialogs import (
    trade_dialog,
    alert_dialog,
    pred_dialog,
)
from app.components.retail_extras import (
    portfolio_chart_card,
    selected_asset_spotlight,
    risk_snapshot_card,
)


def _retail_nav() -> rx.Component:
    return rx.el.header(
        rx.el.div(
            rx.el.div(
                rx.el.div(
                    rx.icon("trending-up", size=18, class_name="text-black"),
                    class_name="w-8 h-8 rounded-xl bg-amber-400 flex items-center justify-center",
                ),
                rx.el.div(
                    rx.el.p(
                        "Lumen",
                        class_name="text-white font-bold text-lg tracking-tight leading-none",
                    ),
                    rx.el.p(
                        "Retail Trading",
                        class_name="text-neutral-500 text-[10px] tracking-wider uppercase",
                    ),
                ),
                class_name="flex items-center gap-3",
            ),
            rx.el.nav(
                rx.el.a(
                    "Home",
                    class_name="text-white text-sm font-medium px-3 py-1.5 rounded-full bg-white/5",
                ),
                rx.el.a(
                    "Discover",
                    class_name="text-neutral-400 hover:text-white text-sm font-medium px-3 py-1.5",
                ),
                rx.el.a(
                    "Portfolio",
                    class_name="text-neutral-400 hover:text-white text-sm font-medium px-3 py-1.5",
                ),
                rx.el.a(
                    "Learn",
                    class_name="text-neutral-400 hover:text-white text-sm font-medium px-3 py-1.5",
                ),
                class_name="hidden md:flex items-center gap-1",
            ),
            rx.el.div(
                rx.el.div(
                    rx.el.div(
                        class_name="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"
                    ),
                    rx.el.span(
                        "Markets open",
                        class_name="text-neutral-400 text-xs font-medium",
                    ),
                    class_name="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5",
                ),
                rx.el.button(
                    rx.icon("terminal", size=14),
                    rx.el.span("Pro Terminal", class_name="hidden sm:inline"),
                    on_click=TerminalState.toggle_view_mode,
                    class_name="flex items-center gap-1.5 text-xs font-semibold text-amber-300 hover:text-amber-200 border border-amber-400/30 hover:border-amber-400/60 bg-amber-400/5 px-3 py-1.5 rounded-full",
                ),
                rx.el.div(
                    rx.el.span(
                        "A",
                        class_name="text-black font-bold text-sm",
                    ),
                    class_name="w-8 h-8 rounded-full bg-gradient-to-br from-amber-300 to-amber-500 flex items-center justify-center",
                ),
                class_name="flex items-center gap-2",
            ),
            class_name="max-w-7xl mx-auto flex items-center justify-between px-6 py-4",
        ),
        class_name="border-b border-white/5 bg-neutral-950/70 backdrop-blur-xl sticky top-0 z-40",
    )


def _portfolio_summary() -> rx.Component:
    return rx.el.section(
        rx.el.div(
            rx.el.div(
                rx.el.div(
                    rx.el.p(
                        "Good morning, Alex",
                        class_name="text-neutral-400 text-sm font-medium",
                    ),
                    rx.el.p(
                        "Here's how your money is doing today.",
                        class_name="text-neutral-500 text-xs mt-0.5",
                    ),
                ),
                rx.el.div(
                    rx.el.div(
                        class_name="w-1.5 h-1.5 rounded-full bg-green-400"
                    ),
                    rx.el.span(
                        TerminalState.current_time,
                        class_name="text-neutral-400 text-xs font-mono",
                    ),
                    class_name="flex items-center gap-2",
                ),
                class_name="flex items-center justify-between mb-6",
            ),
            rx.el.div(
                rx.el.div(
                    rx.el.p(
                        "Total balance",
                        class_name="text-neutral-400 text-xs font-medium tracking-wide uppercase",
                    ),
                    rx.el.p(
                        "$4,287,914.32",
                        class_name="text-white text-4xl md:text-5xl font-bold tracking-tight mt-1 tabular-nums",
                    ),
                    rx.el.div(
                        rx.el.div(
                            rx.icon("trending-up", size=14),
                            rx.el.span(
                                "+$18,472.14",
                                class_name="text-sm font-bold tabular-nums",
                            ),
                            rx.el.span(
                                "+0.43%",
                                class_name="text-xs font-semibold tabular-nums opacity-80",
                            ),
                            class_name="flex items-center gap-1.5 text-green-400 bg-green-400/10 px-2.5 py-1 rounded-full",
                        ),
                        rx.el.span(
                            "Today",
                            class_name="text-neutral-500 text-xs font-medium",
                        ),
                        class_name="flex items-center gap-2 mt-3",
                    ),
                    class_name="flex-1",
                ),
                rx.el.div(
                    _portfolio_stat("Buying power", "$1,142,388", "text-white"),
                    _portfolio_stat("Invested", "$3,145,526", "text-white"),
                    _portfolio_stat(
                        "Positions", "24", "text-white", "14 long · 10 short"
                    ),
                    class_name="grid grid-cols-3 gap-4 md:min-w-[420px]",
                ),
                class_name="flex flex-col lg:flex-row lg:items-end gap-6",
            ),
            rx.el.div(
                rx.el.button(
                    rx.icon("arrow-up-right", size=16),
                    "Buy",
                    class_name="flex items-center gap-2 bg-amber-400 hover:bg-amber-300 text-black font-semibold text-sm px-5 py-2.5 rounded-xl transition-colors",
                ),
                rx.el.button(
                    rx.icon("arrow-down-right", size=16),
                    "Sell",
                    class_name="flex items-center gap-2 bg-white/5 hover:bg-white/10 text-white font-semibold text-sm px-5 py-2.5 rounded-xl border border-white/10",
                ),
                rx.el.button(
                    rx.icon("bell", size=16),
                    "Set alert",
                    class_name="flex items-center gap-2 bg-white/5 hover:bg-white/10 text-neutral-200 font-medium text-sm px-5 py-2.5 rounded-xl border border-white/10",
                ),
                rx.el.button(
                    rx.icon("plus", size=16),
                    "Deposit",
                    class_name="flex items-center gap-2 bg-white/5 hover:bg-white/10 text-neutral-200 font-medium text-sm px-5 py-2.5 rounded-xl border border-white/10 ml-auto",
                ),
                class_name="flex flex-wrap items-center gap-2 mt-8 pt-6 border-t border-white/5",
            ),
            class_name="p-8",
        ),
        class_name="rounded-3xl bg-gradient-to-br from-neutral-900 via-neutral-900 to-neutral-950 border border-white/5 overflow-hidden",
    )


def _portfolio_stat(
    label: str, value: str, color: str, detail: str = ""
) -> rx.Component:
    return rx.el.div(
        rx.el.p(
            label,
            class_name="text-neutral-500 text-[10px] font-medium tracking-widest uppercase",
        ),
        rx.el.p(
            value,
            class_name=f"{color} text-lg font-bold tabular-nums mt-1",
        ),
        rx.cond(
            detail != "",
            rx.el.p(
                detail,
                class_name="text-neutral-500 text-[10px] mt-0.5",
            ),
            rx.fragment(),
        ),
        class_name="rounded-2xl bg-white/[0.03] border border-white/5 px-4 py-3",
    )


def _market_pulse_card(idx: IndexData) -> rx.Component:
    return rx.el.div(
        rx.el.div(
            rx.el.p(
                idx["name"],
                class_name="text-neutral-400 text-xs font-semibold tracking-wide",
            ),
            rx.el.div(
                rx.cond(
                    idx["change_pct"] >= 0,
                    rx.icon("trending-up", size=12),
                    rx.icon("trending-down", size=12),
                ),
                class_name=rx.cond(
                    idx["change_pct"] >= 0,
                    "text-green-400",
                    "text-red-400",
                ),
            ),
            class_name="flex items-center justify-between",
        ),
        rx.el.p(
            f"{idx['value']:,.2f}",
            class_name="text-white text-lg font-bold tabular-nums mt-1",
        ),
        rx.el.p(
            rx.cond(
                idx["change_pct"] >= 0,
                f"+{idx['change_pct']:.2f}%",
                f"{idx['change_pct']:.2f}%",
            ),
            class_name=rx.cond(
                idx["change_pct"] >= 0,
                "text-green-400 text-xs font-semibold tabular-nums",
                "text-red-400 text-xs font-semibold tabular-nums",
            ),
        ),
        class_name="rounded-2xl bg-white/[0.03] border border-white/5 hover:border-white/10 hover:bg-white/[0.05] p-4 transition-colors cursor-pointer min-w-[140px]",
    )


def _market_pulse() -> rx.Component:
    return rx.el.section(
        rx.el.div(
            rx.el.div(
                rx.icon("activity", size=14, class_name="text-neutral-400"),
                rx.el.h3(
                    "Market pulse",
                    class_name="text-white text-sm font-semibold tracking-wide",
                ),
                rx.el.span(
                    "Global indices right now",
                    class_name="text-neutral-500 text-xs",
                ),
                class_name="flex items-center gap-2 mb-4",
            ),
            rx.el.div(
                rx.foreach(TerminalState.indices, _market_pulse_card),
                class_name="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3",
            ),
        ),
    )


def _stock_row(t: Ticker) -> rx.Component:
    return rx.el.div(
        rx.el.button(
            rx.el.div(
                rx.el.div(
                    rx.el.span(
                        t["symbol"][0:2],
                        class_name="text-white font-bold text-xs",
                    ),
                    class_name="w-9 h-9 rounded-full bg-gradient-to-br from-neutral-700 to-neutral-800 flex items-center justify-center flex-shrink-0",
                ),
                rx.el.div(
                    rx.el.p(
                        t["symbol"],
                        class_name="text-white font-semibold text-sm text-left",
                    ),
                    rx.el.p(
                        t["name"],
                        class_name="text-neutral-500 text-xs text-left truncate max-w-[140px]",
                    ),
                    class_name="flex flex-col",
                ),
                class_name="flex items-center gap-3 flex-1",
            ),
            rx.el.div(
                rx.el.p(
                    f"${t['price']:,.2f}",
                    class_name="text-white font-semibold text-sm tabular-nums text-right",
                ),
                rx.el.p(
                    rx.cond(
                        t["change_pct"] >= 0,
                        f"▲ +{t['change_pct']:.2f}%",
                        f"▼ {t['change_pct']:.2f}%",
                    ),
                    class_name=rx.cond(
                        t["change_pct"] >= 0,
                        "text-green-400 text-xs font-semibold tabular-nums text-right",
                        "text-red-400 text-xs font-semibold tabular-nums text-right",
                    ),
                ),
            ),
            on_click=lambda: TerminalState.select_symbol(t["symbol"]),
            class_name="flex items-center gap-3 flex-1 min-w-0 text-left",
        ),
        rx.el.div(
            rx.el.button(
                "Buy",
                on_click=lambda: TerminalState.open_trade_dialog(
                    t["symbol"], "BUY"
                ),
                class_name="text-[11px] font-bold text-black bg-emerald-400 hover:bg-emerald-300 px-2.5 py-1 rounded-full",
            ),
            rx.el.button(
                "Sell",
                on_click=lambda: TerminalState.open_trade_dialog(
                    t["symbol"], "SELL"
                ),
                class_name="text-[11px] font-bold text-white bg-white/10 hover:bg-white/15 px-2.5 py-1 rounded-full",
            ),
            rx.el.button(
                rx.icon("bell", size=12),
                on_click=lambda: TerminalState.open_alert_dialog(t["symbol"]),
                class_name="text-neutral-300 hover:text-cyan-300 bg-white/5 hover:bg-cyan-400/10 p-1.5 rounded-full",
                title="Set alert",
            ),
            class_name="flex items-center gap-1.5 flex-shrink-0",
        ),
        class_name="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors",
    )


def _section_header(
    icon: str,
    title: str,
    subtitle: str,
    accent: str,
    accent_bg: str,
) -> rx.Component:
    return rx.el.div(
        rx.el.div(
            rx.el.div(
                rx.icon(icon, size=16, class_name=accent),
                class_name=f"w-8 h-8 rounded-xl {accent_bg} flex items-center justify-center",
            ),
            rx.el.div(
                rx.el.h2(
                    title,
                    class_name="text-white text-lg font-bold tracking-tight",
                ),
                rx.el.p(
                    subtitle,
                    class_name="text-neutral-500 text-xs",
                ),
            ),
            class_name="flex items-center gap-3",
        ),
        rx.el.button(
            "See all",
            rx.icon("chevron-right", size=14),
            class_name="flex items-center gap-1 text-neutral-400 hover:text-white text-xs font-semibold",
        ),
        class_name="flex items-center justify-between mb-4",
    )


def _stocks_section() -> rx.Component:
    return rx.el.section(
        _section_header(
            "line-chart",
            "Stocks",
            "Top names from your watchlist",
            "text-emerald-400",
            "bg-emerald-400/10",
        ),
        rx.el.div(
            rx.el.div(
                rx.el.p(
                    "Plain english: these are shares of companies you can buy or sell during market hours.",
                    class_name="text-neutral-400 text-xs leading-relaxed",
                ),
                class_name="mb-2 px-4 py-2.5 rounded-xl bg-emerald-400/5 border border-emerald-400/10",
            ),
            rx.el.div(
                rx.foreach(TerminalState.stock_highlights, _stock_row),
                class_name="flex flex-col divide-y divide-white/[0.03]",
            ),
            class_name="rounded-3xl bg-neutral-900/60 border border-white/5 p-2",
        ),
    )


def _crypto_card(t: Ticker) -> rx.Component:
    return rx.el.div(
        rx.el.button(
            rx.el.div(
                rx.el.div(
                    rx.el.div(
                        rx.el.span(
                            t["symbol"][0:1],
                            class_name="text-cyan-300 font-bold text-base",
                        ),
                        class_name="w-11 h-11 rounded-full bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center",
                    ),
                    rx.el.div(
                        rx.el.p(
                            t["symbol"],
                            class_name="text-white font-bold text-base text-left",
                        ),
                        rx.el.p(
                            t["name"],
                            class_name="text-neutral-500 text-[11px] text-left tracking-wide",
                        ),
                    ),
                    class_name="flex items-center gap-3",
                ),
                rx.el.span(
                    "24H",
                    class_name="text-cyan-400/60 text-[9px] tracking-widest font-bold bg-cyan-400/5 px-1.5 py-0.5 rounded-md",
                ),
                class_name="flex items-center justify-between w-full",
            ),
            rx.el.p(
                f"${t['price']:,.2f}",
                class_name="text-white text-2xl font-bold tabular-nums mt-3 text-left",
            ),
            rx.el.div(
                rx.el.span(
                    rx.cond(
                        t["change_pct"] >= 0,
                        f"▲ +{t['change_pct']:.2f}%",
                        f"▼ {t['change_pct']:.2f}%",
                    ),
                    class_name=rx.cond(
                        t["change_pct"] >= 0,
                        "text-green-400 text-sm font-bold tabular-nums",
                        "text-red-400 text-sm font-bold tabular-nums",
                    ),
                ),
                rx.el.span(
                    f"Vol {t['volume']}",
                    class_name="text-neutral-500 text-[11px] tabular-nums",
                ),
                class_name="flex items-center justify-between mt-1",
            ),
            on_click=lambda: TerminalState.select_symbol(t["symbol"]),
            class_name="w-full text-left",
        ),
        rx.el.div(
            rx.el.button(
                rx.icon("arrow-up-right", size=12),
                "Buy",
                on_click=lambda: TerminalState.open_trade_dialog(
                    t["symbol"], "BUY"
                ),
                class_name="flex-1 flex items-center justify-center gap-1 text-xs font-bold text-black bg-emerald-400 hover:bg-emerald-300 py-2 rounded-xl",
            ),
            rx.el.button(
                rx.icon("arrow-down-right", size=12),
                "Sell",
                on_click=lambda: TerminalState.open_trade_dialog(
                    t["symbol"], "SELL"
                ),
                class_name="flex-1 flex items-center justify-center gap-1 text-xs font-bold text-white bg-white/10 hover:bg-white/15 py-2 rounded-xl",
            ),
            rx.el.button(
                rx.icon("bell", size=12),
                on_click=lambda: TerminalState.open_alert_dialog(t["symbol"]),
                class_name="text-cyan-300 hover:text-cyan-200 bg-cyan-400/10 hover:bg-cyan-400/15 p-2 rounded-xl",
                title="Set alert",
            ),
            class_name="flex items-center gap-1.5 mt-4",
        ),
        class_name="rounded-2xl bg-white/[0.03] border border-white/5 hover:border-cyan-400/30 p-4 transition-all",
    )


def _crypto_section() -> rx.Component:
    return rx.el.section(
        _section_header(
            "bitcoin",
            "Crypto",
            "Live prices, 24/7 markets",
            "text-cyan-300",
            "bg-cyan-400/10",
        ),
        rx.el.div(
            rx.el.p(
                "Plain english: crypto trades round-the-clock. Prices can move a lot — even overnight.",
                class_name="text-neutral-400 text-xs leading-relaxed mb-3 px-4 py-2.5 rounded-xl bg-cyan-400/5 border border-cyan-400/10",
            ),
            rx.el.div(
                rx.foreach(TerminalState.crypto_movers, _crypto_card),
                class_name="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3",
            ),
        ),
    )


def _pred_card(p: PredictionMarket, idx: int) -> rx.Component:
    return rx.el.div(
        rx.el.div(
            rx.el.span(
                p["category"],
                class_name="text-amber-300 text-[9px] tracking-widest font-bold bg-amber-400/10 px-2 py-1 rounded-md uppercase",
            ),
            rx.el.span(
                p["resolves"],
                class_name="text-neutral-500 text-[10px] font-medium ml-auto",
            ),
            class_name="flex items-center mb-3",
        ),
        rx.el.p(
            p["question"],
            class_name="text-white text-sm font-semibold leading-snug mb-4 min-h-[44px]",
        ),
        rx.el.div(
            rx.el.button(
                rx.el.div(
                    rx.el.span(
                        "YES",
                        class_name="text-green-300 text-[10px] font-bold tracking-wider",
                    ),
                    rx.el.span(
                        f"{p['yes_price'] * 100:.0f}¢",
                        class_name="text-green-300 text-lg font-bold tabular-nums",
                    ),
                    class_name="flex items-center justify-between",
                ),
                rx.el.div(
                    class_name="h-1.5 bg-green-400/80 rounded-full mt-1.5",
                    style={"width": f"{p['yes_price'] * 100:.0f}%"},
                ),
                rx.el.p(
                    "Buy YES",
                    class_name="text-green-300 text-[10px] font-bold text-center mt-2 tracking-wider",
                ),
                on_click=lambda: TerminalState.open_pred_dialog(idx, "YES"),
                class_name="flex-1 bg-green-400/10 hover:bg-green-400/20 border border-green-400/20 hover:border-green-400/50 rounded-xl px-3 py-2.5 text-left transition-all",
            ),
            rx.el.button(
                rx.el.div(
                    rx.el.span(
                        "NO",
                        class_name="text-red-300 text-[10px] font-bold tracking-wider",
                    ),
                    rx.el.span(
                        f"{p['no_price'] * 100:.0f}¢",
                        class_name="text-red-300 text-lg font-bold tabular-nums",
                    ),
                    class_name="flex items-center justify-between",
                ),
                rx.el.div(
                    class_name="h-1.5 bg-red-400/80 rounded-full mt-1.5",
                    style={"width": f"{p['no_price'] * 100:.0f}%"},
                ),
                rx.el.p(
                    "Buy NO",
                    class_name="text-red-300 text-[10px] font-bold text-center mt-2 tracking-wider",
                ),
                on_click=lambda: TerminalState.open_pred_dialog(idx, "NO"),
                class_name="flex-1 bg-red-400/10 hover:bg-red-400/20 border border-red-400/20 hover:border-red-400/50 rounded-xl px-3 py-2.5 text-left transition-all",
            ),
            class_name="flex gap-2",
        ),
        rx.el.div(
            rx.el.span(
                rx.cond(
                    p["yes_change"] >= 0,
                    f"YES ▲ +{p['yes_change'] * 100:.1f}¢",
                    f"YES ▼ {p['yes_change'] * 100:.1f}¢",
                ),
                class_name=rx.cond(
                    p["yes_change"] >= 0,
                    "text-green-400 text-[10px] font-bold tabular-nums",
                    "text-red-400 text-[10px] font-bold tabular-nums",
                ),
            ),
            rx.el.span(
                f"Vol {p['volume']}",
                class_name="text-neutral-500 text-[10px] font-medium ml-auto",
            ),
            class_name="flex items-center mt-3",
        ),
        class_name="rounded-2xl bg-white/[0.03] border border-white/5 hover:border-amber-400/30 p-4 transition-all",
    )


def _predictions_section() -> rx.Component:
    return rx.el.section(
        _section_header(
            "target",
            "Prediction markets",
            "Bet on real-world outcomes",
            "text-amber-300",
            "bg-amber-400/10",
        ),
        rx.el.div(
            rx.el.p(
                "Plain english: buy YES or NO on future events. Prices in ¢ show the crowd's estimated probability.",
                class_name="text-neutral-400 text-xs leading-relaxed mb-3 px-4 py-2.5 rounded-xl bg-amber-400/5 border border-amber-400/10",
            ),
            rx.el.div(
                rx.foreach(
                    TerminalState.prediction_markets,
                    lambda p, i: _pred_card(p, i),
                ),
                class_name="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3",
            ),
        ),
    )


def _mover_row(t: Ticker) -> rx.Component:
    return rx.el.button(
        rx.el.div(
            rx.el.p(
                t["symbol"],
                class_name="text-white font-semibold text-sm text-left",
            ),
            rx.el.p(
                t["asset_class"],
                class_name="text-neutral-500 text-[10px] tracking-widest text-left",
            ),
        ),
        rx.el.div(
            rx.el.p(
                f"${t['price']:,.2f}",
                class_name="text-white text-xs font-semibold tabular-nums text-right",
            ),
            rx.el.p(
                rx.cond(
                    t["change_pct"] >= 0,
                    f"+{t['change_pct']:.2f}%",
                    f"{t['change_pct']:.2f}%",
                ),
                class_name=rx.cond(
                    t["change_pct"] >= 0,
                    "text-green-400 text-xs font-bold tabular-nums text-right",
                    "text-red-400 text-xs font-bold tabular-nums text-right",
                ),
            ),
        ),
        on_click=lambda: TerminalState.select_symbol(t["symbol"]),
        class_name="flex items-center justify-between w-full px-4 py-2.5 hover:bg-white/5 rounded-xl transition-colors",
    )


def _news_row(n: NewsItem) -> rx.Component:
    return rx.el.div(
        rx.el.div(
            rx.el.span(
                n["tag"],
                class_name="text-amber-300 text-[9px] font-bold tracking-widest bg-amber-400/10 px-1.5 py-0.5 rounded",
            ),
            rx.el.span(
                n["time"],
                class_name="text-neutral-500 text-[10px] font-mono ml-auto",
            ),
            class_name="flex items-center gap-2 mb-1",
        ),
        rx.el.p(
            n["headline"],
            class_name="text-neutral-200 text-xs leading-snug hover:text-white cursor-pointer",
        ),
        class_name="px-4 py-3 border-b border-white/5 last:border-b-0",
    )


def _activity_row(a: dict[str, str]) -> rx.Component:
    return rx.el.div(
        rx.el.div(
            rx.el.span(
                a["kind"],
                class_name=rx.match(
                    a["tone"],
                    (
                        "ok",
                        "text-green-300 bg-green-400/10 text-[9px] font-bold tracking-widest px-1.5 py-0.5 rounded",
                    ),
                    (
                        "warn",
                        "text-amber-300 bg-amber-400/10 text-[9px] font-bold tracking-widest px-1.5 py-0.5 rounded",
                    ),
                    (
                        "err",
                        "text-red-300 bg-red-400/10 text-[9px] font-bold tracking-widest px-1.5 py-0.5 rounded",
                    ),
                    "text-cyan-300 bg-cyan-400/10 text-[9px] font-bold tracking-widest px-1.5 py-0.5 rounded",
                ),
            ),
            rx.el.span(
                a["time"],
                class_name="text-neutral-500 text-[10px] font-mono ml-auto",
            ),
            class_name="flex items-center gap-2 mb-1",
        ),
        rx.el.p(
            a["message"],
            class_name="text-neutral-200 text-xs leading-snug",
        ),
        class_name="px-4 py-3 border-b border-white/5 last:border-b-0",
    )


def _activity_panel() -> rx.Component:
    return rx.el.div(
        rx.el.div(
            rx.icon("history", size=14, class_name="text-emerald-300"),
            rx.el.h3(
                "Recent activity",
                class_name="text-white text-sm font-semibold",
            ),
            rx.el.span(
                TerminalState.activity_log.length().to_string(),
                class_name="text-[9px] text-neutral-400 font-bold tracking-widest ml-auto bg-white/5 px-1.5 py-0.5 rounded-full",
            ),
            class_name="flex items-center gap-2 px-4 py-3 border-b border-white/5",
        ),
        rx.cond(
            TerminalState.activity_log.length() > 0,
            rx.el.div(
                rx.foreach(TerminalState.activity_log, _activity_row),
                class_name="max-h-[280px] overflow-y-auto",
            ),
            rx.el.div(
                rx.icon("inbox", size=20, class_name="text-neutral-600 mb-2"),
                rx.el.p(
                    "No activity yet",
                    class_name="text-neutral-500 text-xs font-medium",
                ),
                rx.el.p(
                    "Trades, alerts and predictions will appear here.",
                    class_name="text-neutral-600 text-[11px] mt-1 text-center max-w-[220px]",
                ),
                class_name="flex flex-col items-center justify-center py-6 px-4",
            ),
        ),
        class_name="rounded-3xl bg-neutral-900/60 border border-white/5 overflow-hidden",
    )


def _sidebar_panels() -> rx.Component:
    return rx.el.div(
        _activity_panel(),
        rx.el.div(
            rx.el.div(
                rx.icon("flame", size=14, class_name="text-orange-400"),
                rx.el.h3(
                    "Top movers",
                    class_name="text-white text-sm font-semibold",
                ),
                class_name="flex items-center gap-2 px-4 pt-4 pb-2",
            ),
            rx.el.div(
                rx.foreach(TerminalState.top_movers, _mover_row),
                class_name="flex flex-col p-2 pt-0",
            ),
            class_name="rounded-3xl bg-neutral-900/60 border border-white/5",
        ),
        rx.el.div(
            rx.el.div(
                rx.icon("newspaper", size=14, class_name="text-cyan-300"),
                rx.el.h3(
                    "Market news",
                    class_name="text-white text-sm font-semibold",
                ),
                rx.el.span(
                    "Live",
                    class_name="text-[9px] text-red-400 font-bold tracking-widest ml-auto animate-pulse",
                ),
                class_name="flex items-center gap-2 px-4 py-3 border-b border-white/5",
            ),
            rx.el.div(
                rx.foreach(TerminalState.news_items[:8], _news_row),
                class_name="max-h-[420px] overflow-y-auto",
            ),
            class_name="rounded-3xl bg-neutral-900/60 border border-white/5 overflow-hidden",
        ),
        rx.el.div(
            rx.el.div(
                rx.icon("graduation-cap", size=14, class_name="text-amber-300"),
                rx.el.h3(
                    "New to trading?",
                    class_name="text-white text-sm font-semibold",
                ),
                class_name="flex items-center gap-2 mb-2",
            ),
            rx.el.p(
                "Start with a small position, use limit orders, and set alerts before you place trades. Diversify across stocks, crypto and event markets.",
                class_name="text-neutral-400 text-xs leading-relaxed mb-3",
            ),
            rx.el.button(
                "Take the 2-min tour",
                rx.icon("arrow-right", size=12),
                class_name="flex items-center gap-1.5 text-amber-300 hover:text-amber-200 text-xs font-bold",
            ),
            class_name="rounded-3xl bg-gradient-to-br from-amber-400/10 to-amber-400/5 border border-amber-400/20 p-4",
        ),
        class_name="flex flex-col gap-3",
    )


def retail_home() -> rx.Component:
    return rx.el.div(
        _retail_nav(),
        rx.el.div(
            _portfolio_summary(),
            rx.el.div(
                portfolio_chart_card(),
                selected_asset_spotlight(),
                class_name="grid grid-cols-1 lg:grid-cols-2 gap-4",
            ),
            _market_pulse(),
            rx.el.div(
                rx.el.div(
                    _stocks_section(),
                    _crypto_section(),
                    _predictions_section(),
                    risk_snapshot_card(),
                    class_name="flex flex-col gap-8 lg:col-span-2",
                ),
                _sidebar_panels(),
                class_name="grid grid-cols-1 lg:grid-cols-3 gap-6",
            ),
            rx.moment(
                interval=3000,
                on_change=TerminalState.tick,
                class_name="hidden",
            ),
            class_name="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6",
        ),
        trade_dialog(),
        alert_dialog(),
        pred_dialog(),
        class_name="min-h-screen bg-neutral-950 text-neutral-100 font-['Inter']",
    )
