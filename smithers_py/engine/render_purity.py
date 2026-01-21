"""Render Purity Enforcement.

Implements PRD section 7.1.2: Render Purity Enforcement.

During Phase 2 (Render), the following are errors:
- ctx.state.set() → raises RenderPhaseWriteError
- ctx.db.execute() (write) → raises RenderPhaseWriteError
- Starting async tasks → raises RenderPhaseTaskError

Allowed: ctx.state.get(), ctx.v.get(), pure computations.
"""

from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from enum import Enum
from typing import Any, Callable, Optional


class FramePhase(str, Enum):
    """Current phase in the frame lifecycle."""
    SNAPSHOT = "snapshot"
    RENDER = "render"  # Pure - no side effects allowed
    RECONCILE = "reconcile"
    COMMIT = "commit"
    EXECUTE = "execute"
    EFFECTS = "effects"
    FLUSH = "flush"
    IDLE = "idle"


class RenderPhaseWriteError(Exception):
    """Raised when state.set() is called during render phase."""
    
    def __init__(self, key: str, value: Any = None):
        self.key = key
        self.value = value
        super().__init__(
            f"Cannot call ctx.state.set('{key}') during render phase. "
            "Use Effect or event handler instead."
        )


class RenderPhaseTaskError(Exception):
    """Raised when async tasks are started during render phase."""
    
    def __init__(self, task_description: str):
        self.task_description = task_description
        super().__init__(
            f"Cannot start async task '{task_description}' during render phase. "
            "Schedule tasks in the execute phase."
        )


class RenderPhaseDbWriteError(Exception):
    """Raised when database write is attempted during render phase."""
    
    def __init__(self, operation: str):
        self.operation = operation
        super().__init__(
            f"Cannot execute database write '{operation}' during render phase. "
            "Database writes are only allowed in commit/effects phases."
        )


# Context variable to track current phase
_current_phase: ContextVar[FramePhase] = ContextVar('frame_phase', default=FramePhase.IDLE)


def get_current_phase() -> FramePhase:
    """Get the current frame phase."""
    return _current_phase.get()


def set_current_phase(phase: FramePhase) -> None:
    """Set the current frame phase."""
    _current_phase.set(phase)


def is_render_phase() -> bool:
    """Check if currently in render phase (no side effects allowed)."""
    return _current_phase.get() == FramePhase.RENDER


@contextmanager
def phase_context(phase: FramePhase):
    """Context manager for setting frame phase.
    
    Usage:
        with phase_context(FramePhase.RENDER):
            tree = component(ctx)  # Side effects will raise
    """
    old_phase = _current_phase.get()
    _current_phase.set(phase)
    try:
        yield
    finally:
        _current_phase.set(old_phase)


def enforce_purity(func: Callable) -> Callable:
    """Decorator that enforces render phase purity on a function.
    
    Usage:
        @enforce_purity
        def my_component(ctx):
            # ctx.state.set() will raise here
            return <div>...</div>
    """
    def wrapper(*args, **kwargs):
        with phase_context(FramePhase.RENDER):
            return func(*args, **kwargs)
    wrapper.__name__ = func.__name__
    wrapper.__doc__ = func.__doc__
    return wrapper


def check_write_allowed(operation: str = "write") -> None:
    """Check if writes are allowed in the current phase.
    
    Raises RenderPhaseDbWriteError if in render phase.
    """
    phase = _current_phase.get()
    if phase == FramePhase.RENDER:
        raise RenderPhaseDbWriteError(operation)


def check_task_allowed(task_description: str) -> None:
    """Check if starting tasks is allowed in the current phase.
    
    Raises RenderPhaseTaskError if in render phase.
    """
    phase = _current_phase.get()
    if phase == FramePhase.RENDER:
        raise RenderPhaseTaskError(task_description)


class PurityGuardedState:
    """Wrapper around state store that enforces render purity.
    
    Usage:
        guarded = PurityGuardedState(sqlite_store)
        value = guarded.get("key")  # Always allowed
        guarded.set("key", value)   # Raises in render phase
    """
    
    def __init__(self, store):
        self._store = store
    
    def get(self, key: str) -> Any:
        """Get value - always allowed."""
        return self._store.get(key)
    
    def set(self, key: str, value: Any, trigger: Optional[str] = None) -> None:
        """Set value - blocked during render phase."""
        phase = _current_phase.get()
        if phase == FramePhase.RENDER:
            raise RenderPhaseWriteError(key, value)
        return self._store.set(key, value, trigger)
    
    def init(self, key: str, value: Any) -> bool:
        """Initialize value if not set - queued for post-frame commit.
        
        Per PRD 8.4: Escape hatch for initialization only.
        Sets only if missing, always queued for post-frame commit.
        
        Returns True if value was set (key was missing).
        """
        existing = self._store.get(key)
        if existing is None:
            # Queue for post-frame commit, not immediate write
            self._store.set(key, value, trigger="init")
            return True
        return False
    
    def snapshot(self) -> dict:
        """Get snapshot - always allowed."""
        return self._store.snapshot()
    
    def has_pending_writes(self) -> bool:
        """Check pending writes - always allowed."""
        return self._store.has_pending_writes()
    
    def commit(self) -> None:
        """Commit changes - blocked during render phase."""
        check_write_allowed("commit")
        return self._store.commit()
    
    def __getattr__(self, name: str) -> Any:
        """Delegate other methods to underlying store."""
        return getattr(self._store, name)


@dataclass
class PurityViolation:
    """Record of a purity violation."""
    phase: FramePhase
    violation_type: str  # "write", "task", "db_write"
    details: str
    frame_id: Optional[int] = None
    node_id: Optional[str] = None


class PurityAuditor:
    """Tracks and reports purity violations for debugging.
    
    In development mode, can be configured to log warnings instead
    of raising exceptions.
    """
    
    def __init__(self, strict: bool = True):
        self.strict = strict
        self.violations: list[PurityViolation] = []
    
    def record_violation(
        self,
        violation_type: str,
        details: str,
        frame_id: Optional[int] = None,
        node_id: Optional[str] = None
    ) -> None:
        """Record a purity violation."""
        violation = PurityViolation(
            phase=get_current_phase(),
            violation_type=violation_type,
            details=details,
            frame_id=frame_id,
            node_id=node_id
        )
        self.violations.append(violation)
        
        if self.strict:
            if violation_type == "write":
                raise RenderPhaseWriteError(details)
            elif violation_type == "task":
                raise RenderPhaseTaskError(details)
            elif violation_type == "db_write":
                raise RenderPhaseDbWriteError(details)
    
    def get_violations(self) -> list[PurityViolation]:
        """Get all recorded violations."""
        return list(self.violations)
    
    def clear(self) -> None:
        """Clear violation history."""
        self.violations.clear()
