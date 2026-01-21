"""Handler transaction for atomicity of event handler execution.

Ensures that state changes in event handlers are atomic - either all
changes commit or all are rolled back on error.
"""

from typing import List, Optional
from ..state.base import WriteOp


class HandlerTransaction:
    """Transaction wrapper for event handler execution.

    Buffers all state actions during handler execution and commits
    them atomically on success or discards them on failure.
    """

    def __init__(self):
        self.actions: List[WriteOp] = []
        self.is_committed = False

    def add_action(self, op: WriteOp) -> None:
        """Add a write operation to the transaction."""
        if self.is_committed:
            raise RuntimeError("Cannot add actions to committed transaction")
        self.actions.append(op)

    def commit(self) -> List[WriteOp]:
        """Return all queued actions and mark as committed."""
        if self.is_committed:
            raise RuntimeError("Transaction already committed")
        self.is_committed = True
        return self.actions

    def rollback(self) -> None:
        """Discard all queued actions on error."""
        self.actions.clear()
        self.is_committed = True  # Prevent further use