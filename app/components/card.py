import reflex as rx


def card_container(children: rx.Component) -> rx.Component:
    return rx.el.div(
        children,
        class_name="bg-white border border-gray-200 rounded-xl p-8 shadow-sm max-w-md w-full",
    )
