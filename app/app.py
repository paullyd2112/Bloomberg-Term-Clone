import reflex as rx
from app.states.home_state import HomeState
from app.components.card import card_container


def index() -> rx.Component:
    return rx.el.main(
        rx.el.div(
            card_container(
                rx.el.div(
                    rx.el.div(
                        rx.icon("rocket", class_name="h-8 w-8 text-blue-600"),
                        class_name="bg-blue-100 p-3 rounded-full w-fit mb-6 mx-auto",
                    ),
                    rx.el.h1(
                        "Welcome to Reflex",
                        class_name="text-2xl font-bold text-gray-900 mb-2 text-center",
                    ),
                    rx.el.p(
                        "A clean, modern boilerplate for your next project.",
                        class_name="text-gray-600 mb-8 text-center font-medium",
                    ),
                    rx.el.div(
                        rx.el.div(
                            rx.el.span(
                                "Counter Value",
                                class_name="text-sm text-gray-500 uppercase tracking-wider font-semibold",
                            ),
                            rx.el.p(
                                HomeState.count,
                                class_name="text-4xl font-bold text-blue-600",
                            ),
                            class_name="text-center mb-8 p-4 bg-gray-50 rounded-lg",
                        ),
                        rx.el.div(
                            rx.el.button(
                                "Increment",
                                on_click=HomeState.increment,
                                class_name="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors",
                            ),
                            rx.el.button(
                                "Reset",
                                on_click=HomeState.reset_count,
                                class_name="bg-white hover:bg-gray-50 text-gray-700 font-semibold py-2 px-4 border border-gray-300 rounded-lg transition-colors",
                            ),
                            class_name="flex flex-row gap-3",
                        ),
                        class_name="w-full",
                    ),
                    class_name="flex flex-col items-center",
                )
            ),
            class_name="min-h-screen flex items-center justify-center p-4",
        ),
        class_name="bg-gray-50 font-['Inter']",
    )


app = rx.App(
    theme=rx.theme(appearance="light"),
    head_components=[
        rx.el.link(
            rel="preconnect",
            href="https://fonts.googleapis.com",
        ),
        rx.el.link(
            rel="preconnect",
            href="https://fonts.gstatic.com",
            cross_origin="",
        ),
        rx.el.link(
            href="https://fonts.googleapis.com/css2?family=Inter:wght@400..700&display=swap",
            rel="stylesheet",
        ),
    ],
)
app.add_page(index, route="/")
