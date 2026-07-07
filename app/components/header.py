import reflex as rx
from app.states.terminal_state import TerminalState


def header_stat(
    label: str, value: str, color: str = "text-amber-400"
) -> rx.Component:
    return rx.el.div(
        rx.el.span(label, class_name="text-neutral-500 mr-2"),
        rx.el.span(value, class_name=f"{color} font-semibold"),
        class_name="flex items-center text-[11px] tracking-wide",
    )


def top_header() -> rx.Component:
    return rx.el.header(
        rx.el.div(
            rx.el.div(
                rx.el.div(class_name="w-2 h-2 bg-amber-400 rounded-sm"),
                rx.el.span(
                    "BLOOMBERG",
                    class_name="text-amber-400 font-bold tracking-widest text-sm",
                ),
                rx.el.span(
                    "TERMINAL",
                    class_name="text-neutral-300 font-semibold tracking-widest text-sm ml-1",
                ),
                rx.el.span(
                    "v9.2.1", class_name="text-neutral-600 text-[10px] ml-2"
                ),
                class_name="flex items-center gap-2",
            ),
            rx.el.div(
                header_stat("USER", "ANALYST-01"),
                header_stat("SESSION", "LIVE", "text-green-400"),
                header_stat("MKT", "OPEN", "text-green-400"),
                header_stat(
                    "TIME", TerminalState.current_time, "text-amber-400"
                ),
                class_name="flex items-center gap-6",
            ),
            class_name="flex items-center justify-between px-4 py-2 border-b border-amber-500/30 bg-black",
        ),
        rx.el.div(
            rx.foreach(
                [
                    "MARKETS",
                    "NEWS",
                    "EQUITIES",
                    "FX",
                    "COMMODITIES",
                    "FIXED INCOME",
                    "PORTFOLIO",
                    "ANALYTICS",
                    "ECO CAL",
                ],
                lambda item: rx.el.button(
                    item,
                    on_click=lambda: TerminalState.set_panel(item),
                    class_name=rx.cond(
                        TerminalState.active_panel == item,
                        "px-3 py-1.5 text-[11px] font-semibold tracking-wider text-black bg-amber-400 border-r border-neutral-800",
                        "px-3 py-1.5 text-[11px] font-semibold tracking-wider text-neutral-400 hover:text-amber-400 hover:bg-neutral-900 border-r border-neutral-800 transition-colors",
                    ),
                ),
            ),
            rx.el.div(
                rx.icon("bell", size=12, class_name="text-neutral-500"),
                rx.el.span(
                    "4", class_name="text-amber-400 text-[10px] font-bold"
                ),
                rx.icon(
                    "settings", size=12, class_name="text-neutral-500 ml-3"
                ),
                class_name="flex items-center gap-1 ml-auto pr-4",
            ),
            class_name="flex items-center bg-neutral-950 border-b border-neutral-800",
        ),
    )
