import reflex as rx


class HomeState(rx.State):
    """The state for the home page."""

    count: int = 0

    @rx.event
    def increment(self):
        self.count += 1

    @rx.event
    def reset_count(self):
        self.count = 0
