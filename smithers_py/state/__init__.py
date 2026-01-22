"""State management for smithers-py."""

from .base import StateStore, WriteOp, StoreTarget
from .volatile import VolatileStore
from .sqlite import SqliteStore
from .actions import (
    StateAction,
    ActionType,
    TransitionRecord,
    ActionQueue,
    TransitionLog,
    resolve_conflicts,
)

# Alias for clarity - SqliteStore is execution-scoped
ExecutionStateStore = SqliteStore

__all__ = [
    # Base protocol
    "StateStore",
    "WriteOp",
    "StoreTarget",
    # Stores
    "VolatileStore",
    "SqliteStore",
    "ExecutionStateStore",  # Alias for SqliteStore (execution-scoped)
    # Actions (PRD 7.4)
    "StateAction",
    "ActionType",
    "TransitionRecord",
    "ActionQueue",
    "TransitionLog",
    "resolve_conflicts",
]