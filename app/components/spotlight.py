import reflex as rx
from app.states.terminal_state import TerminalState, Ticker, PredictionMarket


def _crypto_card(t: Ticker) -> rx.Component:
    return rx.el.button(
        rx.el.div(
            rx.el.div(
                rx.el.span(
                    t["symbol"],
                    class_name="text-cyan-400 font-bold text-[13px] tracking-wider",
                ),
                rx.el.span(
                    t["asset_class"],
                    class_name="text-cyan-500/60 text-[8px] tracking-widest ml-auto bg-cyan-500/10 px-1 py-0.5",
                ),
                class_name="flex items-center w-full",
            ),
            rx.el.p(
                t["name"],
                class_name="text-neutral-500 text-[9px] tracking-wider truncate text-left",
            ),
            rx.el.p(
                f"${t['price']:,.2f}",
                class_name="text-neutral-100 text-[15px] font-bold tabular-nums mt-1 text-left",
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
                        "text-green-400 text-[11px] font-bold tabular-nums",
                        "text-red-400 text-[11px] font-bold tabular-nums",
                    ),
                ),
                rx.el.span(
                    f"VOL {t['volume']}",
                    class_name="text-neutral-600 text-[9px] tabular-nums ml-auto",
                ),
                class_name="flex items-center mt-1 w-full",
            ),
            class_name="flex flex-col w-full",
        ),
        on_click=lambda: TerminalState.select_symbol(t["symbol"]),
        class_name=rx.cond(
            TerminalState.active_symbol == t["symbol"],
            "flex-1 min-w-[140px] border-2 border-cyan-400 bg-cyan-500/10 px-3 py-2 hover:bg-cyan-500/15",
            "flex-1 min-w-[140px] border border-neutral-800 bg-neutral-950 px-3 py-2 hover:border-cyan-500/50 hover:bg-neutral-900",
        ),
    )


def _pred_card(p: PredictionMarket) -> rx.Component:
    return rx.el.div(
        rx.el.div(
            rx.el.span(
                p["category"],
                class_name="text-amber-400 text-[9px] tracking-widest font-bold bg-amber-500/10 px-1.5 py-0.5",
            ),
            rx.el.span(
                p["resolves"],
                class_name="text-neutral-600 text-[9px] tracking-wider ml-auto",
            ),
            class_name="flex items-center mb-1.5",
        ),
        rx.el.p(
            p["question"],
            class_name="text-neutral-200 text-[11px] leading-tight mb-2 min-h-[30px]",
        ),
        rx.el.div(
            rx.el.div(
                rx.el.div(
                    rx.el.span(
                        "YES",
                        class_name="text-green-400 text-[9px] font-bold tracking-widest",
                    ),
                    rx.el.span(
                        f"{p['yes_price'] * 100:.0f}¢",
                        class_name="text-green-400 text-[14px] font-bold tabular-nums",
                    ),
                    class_name="flex items-baseline justify-between",
                ),
                rx.el.div(
                    class_name="h-1 bg-green-500 mt-0.5",
                    style={"width": f"{p['yes_price'] * 100:.0f}%"},
                ),
                class_name="flex-1",
            ),
            rx.el.div(
                rx.el.div(
                    rx.el.span(
                        "NO",
                        class_name="text-red-400 text-[9px] font-bold tracking-widest",
                    ),
                    rx.el.span(
                        f"{p['no_price'] * 100:.0f}¢",
                        class_name="text-red-400 text-[14px] font-bold tabular-nums",
                    ),
                    class_name="flex items-baseline justify-between",
                ),
                rx.el.div(
                    class_name="h-1 bg-red-500 mt-0.5",
                    style={"width": f"{p['no_price'] * 100:.0f}%"},
                ),
                class_name="flex-1",
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
                    "text-green-400 text-[9px] font-bold tracking-wider",
                    "text-red-400 text-[9px] font-bold tracking-wider",
                ),
            ),
            rx.el.span(
                f"VOL {p['volume']}",
                class_name="text-neutral-500 text-[9px] tracking-wider ml-auto",
            ),
            class_name="flex items-center mt-2",
        ),
        class_name="flex-1 min-w-[220px] border border-neutral-800 bg-neutral-950 hover:border-amber-500/50 hover:bg-neutral-900 px-3 py-2 cursor-pointer",
    )


def _section_header(
    icon: str,
    title: str,
    subtitle: str,
    code: str,
    accent: str,
    target_panel: str,
) -> rx.Component:
    return rx.el.div(
        rx.el.div(
            rx.el.div(
                rx.icon(icon, size=14, class_name=accent),
                rx.el.span(
                    title,
                    class_name=f"{accent} font-bold text-[12px] tracking-[0.2em] ml-2",
                ),
                rx.el.span(
                    subtitle,
                    class_name="text-neutral-500 text-[10px] tracking-widest ml-3",
                ),
                rx.el.span(
                    "● LIVE",
                    class_name="text-red-500 text-[9px] font-bold tracking-widest ml-3 animate-pulse",
                ),
                class_name="flex items-center",
            ),
            rx.el.div(
                rx.el.button(
                    "VIEW ALL",
                    on_click=lambda: TerminalState.set_panel(target_panel),
                    class_name=f"border {accent.replace('text-', 'border-')}/40 {accent} hover:bg-white/5 text-[10px] font-bold px-3 py-1 tracking-widest",
                ),
                rx.el.span(
                    code,
                    class_name="text-neutral-600 text-[10px] font-mono ml-2",
                ),
                class_name="flex items-center",
            ),
            class_name="flex items-center justify-between px-3 py-2 border-b border-neutral-800 bg-neutral-950",
        ),
    )


def crypto_spotlight() -> rx.Component:
    return rx.el.div(
        _section_header(
            "bitcoin",
            "CRYPTO MARKETS",
            "24H SPOT · TOP MOVERS",
            "CRYP<GO>",
            "text-cyan-400",
            "CRYPTO",
        ),
        rx.el.div(
            rx.foreach(TerminalState.crypto_movers, _crypto_card),
            class_name="flex flex-wrap gap-2 p-2 bg-black",
        ),
        class_name=rx.cond(
            TerminalState.active_panel == "CRYPTO",
            "border-2 border-cyan-400 bg-black shadow-[0_0_20px_rgba(34,211,238,0.15)]",
            "border border-cyan-500/30 bg-black",
        ),
    )


def predictions_spotlight() -> rx.Component:
    return rx.el.div(
        _section_header(
            "trending-up",
            "PREDICTION MARKETS",
            "EVENT ODDS · REAL-MONEY PROBABILITIES",
            "PRED<GO>",
            "text-amber-400",
            "PREDICTIONS",
        ),
        rx.el.div(
            rx.foreach(TerminalState.prediction_markets[:6], _pred_card),
            class_name="flex flex-wrap gap-2 p-2 bg-black",
        ),
        class_name=rx.cond(
            TerminalState.active_panel == "PREDICTIONS",
            "border-2 border-amber-400 bg-black shadow-[0_0_20px_rgba(251,191,36,0.15)]",
            "border border-amber-500/30 bg-black",
        ),
    )
