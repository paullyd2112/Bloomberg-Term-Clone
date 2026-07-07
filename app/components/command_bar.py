import reflex as rx
from app.states.terminal_state import TerminalState, CommandItem


def _suggestion(c: CommandItem) -> rx.Component:
    return rx.el.button(
        rx.el.span(
            c["cmd"], class_name="text-amber-400 font-bold w-14 text-left"
        ),
        rx.el.span(c["desc"], class_name="text-neutral-400 flex-1 text-left"),
        rx.el.span(
            c["category"],
            class_name="text-cyan-400/70 text-[9px] tracking-widest",
        ),
        on_click=lambda: TerminalState.set_command(c["cmd"]),
        class_name="flex items-center gap-3 px-3 py-1.5 hover:bg-neutral-900 text-[11px] w-full",
    )


def _feedback_bar() -> rx.Component:
    return rx.cond(
        TerminalState.feedback_message != "",
        rx.el.div(
            rx.el.span(
                "◆",
                class_name=rx.match(
                    TerminalState.feedback_tone,
                    ("ok", "text-green-400 mr-2"),
                    ("err", "text-red-400 mr-2"),
                    ("warn", "text-yellow-400 mr-2"),
                    "text-cyan-400 mr-2",
                ),
            ),
            rx.el.span(
                TerminalState.feedback_message,
                class_name="text-neutral-300 text-[11px] tracking-wider",
            ),
            class_name="px-4 py-1 bg-neutral-950 border-b border-neutral-800 flex items-center",
        ),
        rx.fragment(),
    )


def command_bar() -> rx.Component:
    return rx.el.div(
        _feedback_bar(),
        rx.el.div(
            rx.el.span(">", class_name="text-amber-400 font-bold mr-2"),
            rx.el.span(
                TerminalState.active_symbol,
                class_name="text-amber-400 font-bold mr-2",
            ),
            rx.el.span(
                "<" + TerminalState.selected_ticker["asset_class"] + ">",
                class_name="text-neutral-500 mr-2 text-[11px]",
            ),
            rx.el.input(
                placeholder="Command (BUY AAPL, GP, PRED, LOOKUP, ALRT, HELP)…",
                default_value=TerminalState.command_input,
                on_change=TerminalState.set_command.debounce(150),
                on_key_down=lambda k: rx.cond(
                    k == "Enter", TerminalState.execute_command, rx.noop()
                ),
                class_name="flex-1 bg-transparent border-none outline-hidden text-amber-300 placeholder-neutral-700 font-mono text-[13px] tracking-wider",
            ),
            rx.el.button(
                rx.icon("search", size=12),
                on_click=TerminalState.toggle_lookup,
                class_name="text-cyan-400 hover:text-cyan-300 px-2 py-1 border border-cyan-500/30 mr-2",
                title="Symbol lookup",
            ),
            rx.el.button(
                "GO",
                on_click=TerminalState.execute_command,
                class_name="bg-amber-400 hover:bg-amber-300 text-black font-bold text-[11px] px-4 py-1 tracking-widest",
            ),
            class_name="flex items-center gap-1 px-4 py-2 bg-black border-y-2 border-amber-500/40",
        ),
        rx.cond(
            TerminalState.command_suggestions.length() > 0,
            rx.el.div(
                rx.el.div(
                    rx.el.span(
                        "SUGGESTIONS",
                        class_name="text-neutral-600 text-[9px] tracking-widest px-3 py-1 border-b border-neutral-900",
                    ),
                ),
                rx.foreach(TerminalState.command_suggestions, _suggestion),
                class_name="bg-neutral-950 border-b border-neutral-800",
            ),
            rx.fragment(),
        ),
        class_name="w-full",
    )
