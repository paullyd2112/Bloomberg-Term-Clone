import reflex as rx
from app.states.terminal_state import TerminalState
from app.components.header import top_header
from app.components.ticker_tape import ticker_tape
from app.components.command_bar import command_bar
from app.components.workspace import workspace
from app.components.status_bar import status_bar
from app.components.retail_home import retail_home


def terminal_view() -> rx.Component:
    return rx.el.main(
        rx.el.div(
            rx.el.button(
                rx.icon("arrow-left", size=14),
                "Back to retail",
                on_click=TerminalState.toggle_view_mode,
                class_name="flex items-center gap-1.5 text-xs font-bold text-amber-400 hover:text-amber-300 bg-black border border-amber-500/40 px-3 py-1 fixed top-2 right-4 z-50",
            ),
        ),
        top_header(),
        ticker_tape(),
        command_bar(),
        workspace(),
        status_bar(),
        class_name="flex flex-col h-screen w-screen bg-black text-neutral-200 font-mono overflow-hidden",
    )


def index() -> rx.Component:
    return rx.cond(
        TerminalState.view_mode == "terminal",
        terminal_view(),
        retail_home(),
    )


app = rx.App(
    theme=rx.theme(appearance="light"),
    stylesheets=[],
    head_components=[
        rx.el.link(rel="preconnect", href="https://fonts.googleapis.com"),
        rx.el.link(
            rel="preconnect", href="https://fonts.gstatic.com", cross_origin=""
        ),
        rx.el.link(
            href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap",
            rel="stylesheet",
        ),
    ],
)
app.add_page(index, route="/", title="Lumen · Retail Trading")
