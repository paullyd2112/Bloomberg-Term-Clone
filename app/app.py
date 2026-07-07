import reflex as rx
from app.components.header import top_header
from app.components.ticker_tape import ticker_tape
from app.components.command_bar import command_bar
from app.components.workspace import workspace
from app.components.status_bar import status_bar


def index() -> rx.Component:
    return rx.el.main(
        top_header(),
        ticker_tape(),
        command_bar(),
        workspace(),
        status_bar(),
        class_name="flex flex-col h-screen w-screen bg-black text-neutral-200 font-mono overflow-hidden",
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
            href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap",
            rel="stylesheet",
        ),
    ],
)
app.add_page(index, route="/", title="Bloomberg Terminal")
