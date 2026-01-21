"""Smithers engine module for tick loop, reconciliation, and task management."""

from .tick_loop import TickLoop, Context
from .events import EventSystem, EventRecord
from .handler_transaction import HandlerTransaction
from .task_lease import (
    TaskLeaseManager,
    CancellationHandler,
    OrphanPolicy,
    recover_orphans,
    RetryTask,
    MarkFailed,
)
from .stop_conditions import (
    StopConditions,
    ExecutionStats,
    StopResult,
    check_stop_conditions,
    FrameStormGuard,
)
from .effects import (
    EffectRegistry,
    EffectLoopDetector,
    EffectLoopError,
    run_effects_strict_mode,
)

__all__ = [
    # Core loop
    "TickLoop",
    "Context",
    # Events
    "EventSystem",
    "EventRecord",
    "HandlerTransaction",
    # Task management
    "TaskLeaseManager",
    "CancellationHandler",
    "OrphanPolicy",
    "recover_orphans",
    "RetryTask",
    "MarkFailed",
    # Stop conditions
    "StopConditions",
    "ExecutionStats",
    "StopResult",
    "check_stop_conditions",
    "FrameStormGuard",
    # Effects
    "EffectRegistry",
    "EffectLoopDetector",
    "EffectLoopError",
    "run_effects_strict_mode",
]