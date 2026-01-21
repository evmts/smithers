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

__all__ = [
    # Base protocol
    "StateStore",
    "WriteOp",
    "StoreTarget",
    # Stores
    "VolatileStore",
    "SqliteStore",
    # Actions (PRD 7.4)
    "StateAction",
    "ActionType",
    "TransitionRecord",
    "ActionQueue",
    "TransitionLog",
    "resolve_conflicts",
]