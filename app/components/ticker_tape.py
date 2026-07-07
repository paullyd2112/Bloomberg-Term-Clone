import reflex as rx
from app.states.terminal_state import TerminalState, Ticker


def tape_item(t: Ticker) -> rx.Component:
    return rx.el.div(
        rx.el.span(t["symbol"], class_name="text-neutral-200 font-bold mr-2"),
        rx.el.span(f"{t['price']:.2f}", class_name="text-neutral-300 mr-2"),
        rx.el.span(
            rx.cond(
                t["change_pct"] >= 0,
                f"▲ {t['change_pct']:.2f}%",
                f"▼ {t['change_pct']:.2f}%",
            ),
            class_name=rx.cond(
                t["change_pct"] >= 0,
                "text-green-400 font-semibold",
                "text-red-400 font-semibold",
            ),
        ),
        class_name="flex items-center gap-1 px-4 py-1.5 border-r border-neutral-800 whitespace-nowrap text-[11px]",
    )


def ticker_tape() -> rx.Component:
    return rx.el.div(
        rx.el.div(
            rx.el.span(
                "LIVE",
                class_name="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 mr-2 animate-pulse",
            ),
            rx.el.span(
                "TAPE",
                class_name="text-amber-400 font-bold text-[11px] tracking-widest",
            ),
            class_name="flex items-center px-3 py-1.5 border-r border-neutral-700 bg-black",
        ),
        rx.el.div(
            rx.foreach(TerminalState.tickers, tape_item),
            class_name="flex items-center overflow-x-auto flex-1",
        ),
        class_name="flex items-center bg-neutral-950 border-b border-neutral-800",
    )
