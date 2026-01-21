"""Custom error types for smithers-py."""


class SmithersError(Exception):
    """Base error for all smithers errors."""
    pass


class EventValidationError(SmithersError):
    """Raised when event props are used on non-observable nodes."""

    def __init__(self, node_type: str, prop_name: str, source_location: str = None):
        msg = f"Event prop '{prop_name}' not allowed on non-observable node type '{node_type}'"
        if source_location:
            msg += f" at {source_location}"
        super().__init__(msg)


class RenderPhaseWriteError(SmithersError):
    """Raised when state.set() is called during render phase."""

    message = "Cannot call ctx.state.set() during render. Use Effect or event handler."

    def __init__(self):
        super().__init__(self.message)