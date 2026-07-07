import reflex as rx
from app.states.terminal_state import TerminalState


def _overlay() -> rx.Component:
    return rx.radix.primitives.dialog.overlay(
        class_name="fixed inset-0 bg-black/70 backdrop-blur-sm z-40",
    )


def _dialog_shell(
    title: str,
    subtitle: str,
    body: rx.Component,
    accent: str = "amber",
) -> rx.Component:
    return rx.el.div(
        rx.el.div(
            rx.el.div(
                rx.el.h2(
                    title,
                    class_name="text-white text-xl font-bold tracking-tight",
                ),
                rx.el.p(
                    subtitle,
                    class_name="text-neutral-400 text-xs mt-1",
                ),
            ),
            class_name="px-6 pt-6 pb-4 border-b border-white/5",
        ),
        rx.el.div(body, class_name="p-6"),
        class_name=f"bg-neutral-950 border border-{accent}-400/20 rounded-3xl w-full max-w-lg shadow-2xl",
    )


# ---------- Trade Dialog ----------
def _trade_side_toggle() -> rx.Component:
    return rx.el.div(
        rx.el.button(
            rx.icon("arrow-up-right", size=14),
            "Buy",
            on_click=lambda: TerminalState.set_trade_side("BUY"),
            class_name=rx.cond(
                TerminalState.trade_side == "BUY",
                "flex-1 flex items-center justify-center gap-1.5 bg-green-500 text-black font-bold text-sm py-2.5 rounded-xl",
                "flex-1 flex items-center justify-center gap-1.5 bg-white/5 text-neutral-300 hover:text-white font-medium text-sm py-2.5 rounded-xl border border-white/10",
            ),
        ),
        rx.el.button(
            rx.icon("arrow-down-right", size=14),
            "Sell",
            on_click=lambda: TerminalState.set_trade_side("SELL"),
            class_name=rx.cond(
                TerminalState.trade_side == "SELL",
                "flex-1 flex items-center justify-center gap-1.5 bg-red-500 text-black font-bold text-sm py-2.5 rounded-xl",
                "flex-1 flex items-center justify-center gap-1.5 bg-white/5 text-neutral-300 hover:text-white font-medium text-sm py-2.5 rounded-xl border border-white/10",
            ),
        ),
        class_name="flex gap-2",
    )


def _order_type_pill(name: str, label: str) -> rx.Component:
    return rx.el.button(
        label,
        on_click=lambda: TerminalState.set_trade_order_type(name),
        class_name=rx.cond(
            TerminalState.trade_order_type == name,
            "px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-400 text-black",
            "px-3 py-1.5 rounded-full text-xs font-medium bg-white/5 text-neutral-300 hover:text-white border border-white/10",
        ),
    )


def _qty_chip(n: str) -> rx.Component:
    return rx.el.button(
        n,
        on_click=lambda: TerminalState.set_trade_qty(n),
        class_name="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white/5 text-neutral-300 hover:bg-amber-400/10 hover:text-amber-300 border border-white/10",
    )


def _trade_setup_step() -> rx.Component:
    return rx.el.div(
        rx.el.div(
            rx.el.div(
                rx.el.p(
                    TerminalState.active_symbol,
                    class_name="text-white text-lg font-bold",
                ),
                rx.el.p(
                    TerminalState.selected_ticker["name"],
                    class_name="text-neutral-400 text-xs",
                ),
            ),
            rx.el.div(
                rx.el.p(
                    f"${TerminalState.selected_ticker['price']:,.2f}",
                    class_name="text-white text-lg font-bold tabular-nums text-right",
                ),
                rx.el.p(
                    rx.cond(
                        TerminalState.selected_ticker["change_pct"] >= 0,
                        f"▲ +{TerminalState.selected_ticker['change_pct']:.2f}%",
                        f"▼ {TerminalState.selected_ticker['change_pct']:.2f}%",
                    ),
                    class_name=rx.cond(
                        TerminalState.selected_ticker["change_pct"] >= 0,
                        "text-green-400 text-xs font-semibold tabular-nums text-right",
                        "text-red-400 text-xs font-semibold tabular-nums text-right",
                    ),
                ),
            ),
            class_name="flex items-center justify-between p-3 rounded-2xl bg-white/[0.03] border border-white/10 mb-5",
        ),
        rx.el.p(
            "1. Choose your side",
            class_name="text-neutral-400 text-[11px] font-semibold tracking-widest uppercase mb-2",
        ),
        _trade_side_toggle(),
        rx.el.p(
            "2. How much?",
            class_name="text-neutral-400 text-[11px] font-semibold tracking-widest uppercase mt-5 mb-2",
        ),
        rx.el.div(
            rx.el.input(
                default_value=TerminalState.trade_qty,
                on_change=TerminalState.set_trade_qty.debounce(150),
                placeholder="Shares",
                class_name="flex-1 bg-neutral-900 border border-white/10 rounded-xl px-4 py-2.5 text-white text-base font-semibold tabular-nums focus:outline-hidden focus:border-amber-400/60",
            ),
            rx.el.div(
                _qty_chip("1"),
                _qty_chip("10"),
                _qty_chip("50"),
                _qty_chip("100"),
                class_name="flex gap-1.5 flex-wrap",
            ),
            class_name="flex flex-col sm:flex-row items-stretch sm:items-center gap-2",
        ),
        rx.el.p(
            "3. Order type",
            class_name="text-neutral-400 text-[11px] font-semibold tracking-widest uppercase mt-5 mb-2",
        ),
        rx.el.div(
            _order_type_pill("MARKET", "Market"),
            _order_type_pill("LIMIT", "Limit"),
            _order_type_pill("STOP", "Stop"),
            class_name="flex gap-2 flex-wrap",
        ),
        rx.cond(
            TerminalState.trade_order_type != "MARKET",
            rx.el.div(
                rx.el.label(
                    "Target price",
                    class_name="text-neutral-400 text-[11px] font-semibold tracking-widest uppercase",
                ),
                rx.el.input(
                    default_value=TerminalState.trade_limit,
                    on_change=TerminalState.set_trade_limit.debounce(150),
                    placeholder=f"{TerminalState.selected_ticker['price']:.2f}",
                    class_name="w-full mt-1 bg-neutral-900 border border-white/10 rounded-xl px-4 py-2.5 text-white text-base font-semibold tabular-nums focus:outline-hidden focus:border-amber-400/60",
                ),
                class_name="mt-4",
            ),
            rx.el.p(
                "Market orders execute right away at the best available price.",
                class_name="text-neutral-500 text-xs mt-3 leading-relaxed",
            ),
        ),
        rx.el.div(
            rx.el.div(
                rx.el.span(
                    "Estimated cost",
                    class_name="text-neutral-400 text-xs",
                ),
                rx.el.span(
                    f"${TerminalState.order_notional:,.2f}",
                    class_name="text-white font-bold text-lg tabular-nums",
                ),
                class_name="flex items-center justify-between",
            ),
            rx.el.p(
                "Buying power: $1,142,388",
                class_name="text-neutral-500 text-[10px] mt-1",
            ),
            class_name="mt-5 p-3 rounded-2xl bg-amber-400/5 border border-amber-400/10",
        ),
        rx.el.div(
            rx.el.button(
                "Cancel",
                on_click=TerminalState.close_trade_dialog,
                class_name="flex-1 bg-white/5 hover:bg-white/10 text-neutral-300 font-medium text-sm py-2.5 rounded-xl border border-white/10",
            ),
            rx.el.button(
                "Review",
                rx.icon("arrow-right", size=14),
                on_click=TerminalState.trade_next_step,
                class_name="flex-1 flex items-center justify-center gap-1.5 bg-amber-400 hover:bg-amber-300 text-black font-bold text-sm py-2.5 rounded-xl",
            ),
            class_name="flex gap-2 mt-6",
        ),
    )


def _trade_review_step() -> rx.Component:
    return rx.el.div(
        rx.el.div(
            rx.el.div(
                rx.el.p(
                    "You're about to",
                    class_name="text-neutral-500 text-xs",
                ),
                rx.el.p(
                    rx.cond(
                        TerminalState.trade_side == "BUY",
                        f"Buy {TerminalState.trade_qty} {TerminalState.active_symbol}",
                        f"Sell {TerminalState.trade_qty} {TerminalState.active_symbol}",
                    ),
                    class_name=rx.cond(
                        TerminalState.trade_side == "BUY",
                        "text-green-400 text-2xl font-bold mt-1",
                        "text-red-400 text-2xl font-bold mt-1",
                    ),
                ),
                rx.el.p(
                    TerminalState.selected_ticker["name"],
                    class_name="text-neutral-400 text-xs mt-1",
                ),
                class_name="p-4 rounded-2xl bg-white/[0.03] border border-white/10",
            ),
            rx.el.div(
                _review_row(
                    "Order type", TerminalState.trade_order_type.to_string()
                ),
                _review_row(
                    "Last price",
                    f"${TerminalState.selected_ticker['price']:,.2f}",
                ),
                _review_row(
                    "Estimated total",
                    f"${TerminalState.order_notional:,.2f}",
                    "text-amber-300",
                ),
                _review_row("Buying power after", "$1,140,000 (est.)"),
                class_name="mt-3 rounded-2xl bg-white/[0.02] border border-white/5 divide-y divide-white/5",
            ),
            rx.el.p(
                "Heads up: prices can move between now and when your order fills. Market orders don't guarantee a price.",
                class_name="text-neutral-500 text-[11px] leading-relaxed mt-3",
            ),
        ),
        rx.el.div(
            rx.el.button(
                rx.icon("arrow-left", size=14),
                "Edit",
                on_click=TerminalState.trade_back_step,
                class_name="flex-1 flex items-center justify-center gap-1.5 bg-white/5 hover:bg-white/10 text-neutral-300 font-medium text-sm py-2.5 rounded-xl border border-white/10",
            ),
            rx.el.button(
                rx.cond(
                    TerminalState.trade_side == "BUY",
                    "Confirm buy",
                    "Confirm sell",
                ),
                rx.icon("check", size=14),
                on_click=TerminalState.confirm_trade,
                class_name=rx.cond(
                    TerminalState.trade_side == "BUY",
                    "flex-1 flex items-center justify-center gap-1.5 bg-green-500 hover:bg-green-400 text-black font-bold text-sm py-2.5 rounded-xl",
                    "flex-1 flex items-center justify-center gap-1.5 bg-red-500 hover:bg-red-400 text-black font-bold text-sm py-2.5 rounded-xl",
                ),
            ),
            class_name="flex gap-2 mt-6",
        ),
    )


def _review_row(
    label: str, value: rx.Component | str, color: str = "text-white"
) -> rx.Component:
    return rx.el.div(
        rx.el.span(label, class_name="text-neutral-400 text-xs"),
        rx.el.span(
            value, class_name=f"{color} text-sm font-semibold tabular-nums"
        ),
        class_name="flex items-center justify-between px-4 py-2.5",
    )


def _trade_success_step() -> rx.Component:
    return rx.el.div(
        rx.el.div(
            rx.el.div(
                rx.icon("check", size=28, class_name="text-black"),
                class_name="w-14 h-14 rounded-full bg-green-400 flex items-center justify-center mx-auto",
            ),
            rx.el.h3(
                "Order placed",
                class_name="text-white text-2xl font-bold text-center mt-4",
            ),
            rx.el.p(
                rx.cond(
                    TerminalState.trade_side == "BUY",
                    f"You bought {TerminalState.trade_qty} {TerminalState.active_symbol}",
                    f"You sold {TerminalState.trade_qty} {TerminalState.active_symbol}",
                ),
                class_name="text-neutral-300 text-sm text-center mt-1",
            ),
            rx.el.p(
                f"Total ${TerminalState.order_notional:,.2f}",
                class_name="text-amber-300 text-lg font-bold text-center mt-2 tabular-nums",
            ),
            class_name="py-6",
        ),
        rx.el.div(
            rx.el.p(
                "Your new position is now visible in Portfolio and in your Recent activity feed.",
                class_name="text-neutral-400 text-xs leading-relaxed text-center",
            ),
            class_name="px-4 py-3 rounded-2xl bg-white/[0.03] border border-white/10",
        ),
        rx.el.button(
            "Done",
            on_click=TerminalState.close_trade_dialog,
            class_name="w-full mt-6 bg-amber-400 hover:bg-amber-300 text-black font-bold text-sm py-2.5 rounded-xl",
        ),
    )


def _trade_stepper() -> rx.Component:
    return rx.el.div(
        _step_dot(1, "Set up"),
        rx.el.div(class_name="flex-1 h-px bg-white/10"),
        _step_dot(2, "Review"),
        rx.el.div(class_name="flex-1 h-px bg-white/10"),
        _step_dot(3, "Done"),
        class_name="flex items-center gap-2 mb-5",
    )


def _step_dot(n: int, label: str) -> rx.Component:
    active = TerminalState.trade_step >= n
    return rx.el.div(
        rx.el.div(
            n,
            class_name=rx.cond(
                active,
                "w-6 h-6 rounded-full bg-amber-400 text-black text-[11px] font-bold flex items-center justify-center",
                "w-6 h-6 rounded-full bg-white/10 text-neutral-500 text-[11px] font-bold flex items-center justify-center",
            ),
        ),
        rx.el.span(
            label,
            class_name=rx.cond(
                active,
                "text-white text-[11px] font-semibold",
                "text-neutral-500 text-[11px] font-medium",
            ),
        ),
        class_name="flex items-center gap-2",
    )


def trade_dialog() -> rx.Component:
    return rx.radix.primitives.dialog.root(
        rx.radix.primitives.dialog.portal(
            _overlay(),
            rx.radix.primitives.dialog.content(
                _dialog_shell(
                    rx.cond(
                        TerminalState.trade_side == "BUY",
                        f"Buy {TerminalState.active_symbol}",
                        f"Sell {TerminalState.active_symbol}",
                    ).to_string(),
                    "Follow the steps — you can cancel any time before confirming.",
                    rx.el.div(
                        _trade_stepper(),
                        rx.match(
                            TerminalState.trade_step,
                            (1, _trade_setup_step()),
                            (2, _trade_review_step()),
                            (3, _trade_success_step()),
                            _trade_setup_step(),
                        ),
                    ),
                ),
                class_name="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[92vw] max-w-lg",
            ),
        ),
        open=TerminalState.trade_dialog_open,
        on_open_change=TerminalState.close_trade_dialog,
    )


# ---------- Alert Dialog ----------
def _cond_pill(name: str, label: str, icon: str) -> rx.Component:
    return rx.el.button(
        rx.icon(icon, size=14),
        label,
        on_click=lambda: TerminalState.set_alert_condition(name),
        class_name=rx.cond(
            TerminalState.alert_condition == name,
            "flex-1 flex items-center justify-center gap-1.5 bg-cyan-400 text-black font-bold text-sm py-2.5 rounded-xl",
            "flex-1 flex items-center justify-center gap-1.5 bg-white/5 hover:bg-white/10 text-neutral-300 font-medium text-sm py-2.5 rounded-xl border border-white/10",
        ),
    )


def alert_dialog() -> rx.Component:
    return rx.radix.primitives.dialog.root(
        rx.radix.primitives.dialog.portal(
            _overlay(),
            rx.radix.primitives.dialog.content(
                _dialog_shell(
                    "Set a price alert",
                    "We'll ping you the moment the price hits your target — no need to watch the chart.",
                    rx.el.div(
                        rx.el.div(
                            rx.el.p(
                                "Ticker",
                                class_name="text-neutral-400 text-[11px] font-semibold tracking-widest uppercase",
                            ),
                            rx.el.p(
                                TerminalState.alert_symbol_ctx,
                                class_name="text-white text-2xl font-bold mt-1",
                            ),
                            class_name="p-4 rounded-2xl bg-white/[0.03] border border-white/10 mb-5",
                        ),
                        rx.el.p(
                            "Notify me when the price goes…",
                            class_name="text-neutral-300 text-sm font-medium mb-2",
                        ),
                        rx.el.div(
                            _cond_pill("above", "Above", "trending-up"),
                            _cond_pill("below", "Below", "trending-down"),
                            class_name="flex gap-2",
                        ),
                        rx.el.p(
                            "Target price",
                            class_name="text-neutral-300 text-sm font-medium mt-5 mb-2",
                        ),
                        rx.el.input(
                            default_value=TerminalState.alert_target_str,
                            on_change=TerminalState.set_alert_target.debounce(
                                150
                            ),
                            placeholder="e.g. 250.00",
                            class_name="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-2.5 text-white text-base font-semibold tabular-nums focus:outline-hidden focus:border-cyan-400/60",
                        ),
                        rx.el.p(
                            "Alerts stay armed until they trigger or you remove them. You can manage all alerts in the Pro Terminal.",
                            class_name="text-neutral-500 text-[11px] leading-relaxed mt-4",
                        ),
                        rx.el.div(
                            rx.el.button(
                                "Cancel",
                                on_click=TerminalState.close_alert_dialog,
                                class_name="flex-1 bg-white/5 hover:bg-white/10 text-neutral-300 font-medium text-sm py-2.5 rounded-xl border border-white/10",
                            ),
                            rx.el.button(
                                rx.icon("bell", size=14),
                                "Create alert",
                                on_click=TerminalState.create_alert,
                                class_name="flex-1 flex items-center justify-center gap-1.5 bg-cyan-400 hover:bg-cyan-300 text-black font-bold text-sm py-2.5 rounded-xl",
                            ),
                            class_name="flex gap-2 mt-6",
                        ),
                    ),
                    accent="cyan",
                ),
                class_name="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[92vw] max-w-lg",
            ),
        ),
        open=TerminalState.alert_dialog_open,
        on_open_change=TerminalState.close_alert_dialog,
    )


# ---------- Prediction Bet Dialog ----------
def _pred_side_toggle() -> rx.Component:
    return rx.el.div(
        rx.el.button(
            rx.el.span("YES", class_name="font-bold text-sm"),
            rx.el.span(
                f"{TerminalState.pred_selected['yes_price'] * 100:.0f}¢",
                class_name="text-lg font-bold tabular-nums",
            ),
            on_click=lambda: TerminalState.set_pred_side("YES"),
            class_name=rx.cond(
                TerminalState.pred_side == "YES",
                "flex-1 flex flex-col items-center gap-1 bg-green-400/20 border border-green-400/60 text-green-300 py-3 rounded-xl",
                "flex-1 flex flex-col items-center gap-1 bg-white/5 hover:bg-white/10 text-neutral-300 py-3 rounded-xl border border-white/10",
            ),
        ),
        rx.el.button(
            rx.el.span("NO", class_name="font-bold text-sm"),
            rx.el.span(
                f"{TerminalState.pred_selected['no_price'] * 100:.0f}¢",
                class_name="text-lg font-bold tabular-nums",
            ),
            on_click=lambda: TerminalState.set_pred_side("NO"),
            class_name=rx.cond(
                TerminalState.pred_side == "NO",
                "flex-1 flex flex-col items-center gap-1 bg-red-400/20 border border-red-400/60 text-red-300 py-3 rounded-xl",
                "flex-1 flex flex-col items-center gap-1 bg-white/5 hover:bg-white/10 text-neutral-300 py-3 rounded-xl border border-white/10",
            ),
        ),
        class_name="flex gap-2",
    )


def _pred_setup() -> rx.Component:
    return rx.el.div(
        rx.el.div(
            rx.el.span(
                TerminalState.pred_selected["category"],
                class_name="text-amber-300 text-[10px] tracking-widest font-bold bg-amber-400/10 px-2 py-1 rounded-md uppercase",
            ),
            rx.el.span(
                f"Resolves {TerminalState.pred_selected['resolves']}",
                class_name="text-neutral-500 text-[11px] font-medium",
            ),
            class_name="flex items-center justify-between mb-3",
        ),
        rx.el.p(
            TerminalState.pred_selected["question"],
            class_name="text-white text-base font-semibold leading-snug mb-4",
        ),
        rx.el.p(
            "Pick a side",
            class_name="text-neutral-400 text-[11px] font-semibold tracking-widest uppercase mb-2",
        ),
        _pred_side_toggle(),
        rx.el.p(
            "How many shares?",
            class_name="text-neutral-400 text-[11px] font-semibold tracking-widest uppercase mt-5 mb-2",
        ),
        rx.el.input(
            default_value=TerminalState.pred_shares,
            on_change=TerminalState.set_pred_shares.debounce(150),
            placeholder="Shares",
            class_name="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-2.5 text-white text-base font-semibold tabular-nums focus:outline-hidden focus:border-amber-400/60",
        ),
        rx.el.div(
            rx.el.div(
                rx.el.span("You pay", class_name="text-neutral-400 text-xs"),
                rx.el.span(
                    f"${TerminalState.pred_cost:,.2f}",
                    class_name="text-white text-sm font-bold tabular-nums",
                ),
                class_name="flex items-center justify-between px-4 py-2.5",
            ),
            rx.el.div(
                rx.el.span(
                    "Max payout if correct",
                    class_name="text-neutral-400 text-xs",
                ),
                rx.el.span(
                    f"${TerminalState.pred_payout:,.2f}",
                    class_name="text-green-400 text-sm font-bold tabular-nums",
                ),
                class_name="flex items-center justify-between px-4 py-2.5 border-t border-white/5",
            ),
            class_name="mt-4 rounded-2xl bg-white/[0.03] border border-white/10",
        ),
        rx.el.p(
            "Each share pays $1 if the event resolves in your favor. If it doesn't, the shares go to $0. Prices reflect the crowd's estimated probability.",
            class_name="text-neutral-500 text-[11px] leading-relaxed mt-4",
        ),
        rx.el.div(
            rx.el.button(
                "Cancel",
                on_click=TerminalState.close_pred_dialog,
                class_name="flex-1 bg-white/5 hover:bg-white/10 text-neutral-300 font-medium text-sm py-2.5 rounded-xl border border-white/10",
            ),
            rx.el.button(
                rx.icon("check", size=14),
                rx.cond(
                    TerminalState.pred_side == "YES",
                    "Buy YES",
                    "Buy NO",
                ),
                on_click=TerminalState.confirm_pred,
                class_name=rx.cond(
                    TerminalState.pred_side == "YES",
                    "flex-1 flex items-center justify-center gap-1.5 bg-green-500 hover:bg-green-400 text-black font-bold text-sm py-2.5 rounded-xl",
                    "flex-1 flex items-center justify-center gap-1.5 bg-red-500 hover:bg-red-400 text-black font-bold text-sm py-2.5 rounded-xl",
                ),
            ),
            class_name="flex gap-2 mt-6",
        ),
    )


def _pred_success() -> rx.Component:
    return rx.el.div(
        rx.el.div(
            rx.el.div(
                rx.icon("check", size=28, class_name="text-black"),
                class_name="w-14 h-14 rounded-full bg-amber-400 flex items-center justify-center mx-auto",
            ),
            rx.el.h3(
                "Position opened",
                class_name="text-white text-2xl font-bold text-center mt-4",
            ),
            rx.el.p(
                rx.cond(
                    TerminalState.pred_side == "YES",
                    f"You bought {TerminalState.pred_shares} YES shares",
                    f"You bought {TerminalState.pred_shares} NO shares",
                ),
                class_name="text-neutral-300 text-sm text-center mt-1",
            ),
            rx.el.p(
                f"Cost ${TerminalState.pred_cost:,.2f} · Max payout ${TerminalState.pred_payout:,.2f}",
                class_name="text-amber-300 text-sm font-semibold text-center mt-2 tabular-nums",
            ),
            class_name="py-6",
        ),
        rx.el.button(
            "Done",
            on_click=TerminalState.close_pred_dialog,
            class_name="w-full mt-2 bg-amber-400 hover:bg-amber-300 text-black font-bold text-sm py-2.5 rounded-xl",
        ),
    )


def pred_dialog() -> rx.Component:
    return rx.radix.primitives.dialog.root(
        rx.radix.primitives.dialog.portal(
            _overlay(),
            rx.radix.primitives.dialog.content(
                _dialog_shell(
                    "Trade a prediction",
                    "Buy YES or NO shares. Prices in ¢ reflect the estimated probability.",
                    rx.match(
                        TerminalState.pred_step,
                        (1, _pred_setup()),
                        (2, _pred_success()),
                        _pred_setup(),
                    ),
                    accent="amber",
                ),
                class_name="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[92vw] max-w-lg",
            ),
        ),
        open=TerminalState.pred_dialog_open,
        on_open_change=TerminalState.close_pred_dialog,
    )
