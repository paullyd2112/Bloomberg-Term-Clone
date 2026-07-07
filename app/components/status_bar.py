import reflex as rx
from app.states.terminal_state import TerminalState


def status_item(
    label: str, value: str, color: str = "text-amber-400"
) -> rx.Component:
    return rx.el.div(
        rx.el.span(label, class_name="text-neutral-600 mr-1.5"),
        rx.el.span(value, class_name=f"{color} font-semibold"),
        class_name="flex items-center text-[10px] tracking-wider",
    )


def status_bar() -> rx.Component:
    return rx.el.footer(
        rx.el.div(
            status_item("STATUS", "CONNECTED", "text-green-400"),
            status_item("LATENCY", "12ms", "text-green-400"),
            status_item("FEED", "NYSE • NASDAQ • CME • LSE", "text-amber-400"),
            status_item("EXCH", "NYSE OPEN", "text-green-400"),
            class_name="flex items-center gap-5",
        ),
        rx.el.div(
            status_item("F1", "HELP"),
            status_item("F2", "EQTY"),
            status_item("F3", "FI"),
            status_item("F4", "CMDTY"),
            status_item("F5", "FX"),
            status_item("F6", "IDX"),
            status_item("F7", "PORT"),
            status_item("F8", "NEWS"),
            class_name="flex items-center gap-4",
        ),
        rx.el.div(
            rx.el.span(
                "© BLOOMBERG L.P. TERMINAL 2025",
                class_name="text-neutral-700 text-[10px] tracking-widest",
            ),
        ),
        class_name="flex items-center justify-between px-4 py-1.5 bg-black border-t border-amber-500/30",
    )
