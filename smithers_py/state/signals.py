"""Signal-based reactivity for Smithers state.

Implements React-like dependency tracking:
- Signal[T]: Observable value with get/set
- Computed[T]: Derived value cached until deps change
- DependencyTracker: Track reads during render for invalidation
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, Generic, Optional, Set, TypeVar
from contextvars import ContextVar
from weakref import WeakSet


T = TypeVar('T')


_current_tracker: ContextVar[Optional['DependencyTracker']] = ContextVar(
    'current_tracker', default=None
)


class DependencyTracker:
    """Tracks state reads during render for invalidation.
    
    Per PRD 7.4.4: Key-based invalidation at MVP level.
    """
    
    def __init__(self):
        self.current_frame_deps: Set[str] = set()
        self._frame_id: Optional[int] = None
    
    def start_frame(self, frame_id: int) -> None:
        self._frame_id = frame_id
        self.current_frame_deps.clear()
    
    def track_read(self, key: str) -> None:
        self.current_frame_deps.add(key)
    
    def should_rerender(self, changed_keys: Set[str]) -> bool:
        return bool(self.current_frame_deps & changed_keys)
    
    def get_dependencies(self) -> Set[str]:
        return self.current_frame_deps.copy()
    
    def end_frame(self) -> Set[str]:
        deps = self.current_frame_deps.copy()
        self.current_frame_deps.clear()
        return deps
    
    @classmethod
    def get_current(cls) -> Optional['DependencyTracker']:
        return _current_tracker.get()
    
    @classmethod
    def set_current(cls, tracker: Optional['DependencyTracker']) -> None:
        _current_tracker.set(tracker)


@dataclass
class StateAction:
    """Action queued for state update.
    
    Per PRD 7.4.1: All state modifications are actions.
    """
    key: str
    action_type: str  # "set", "delete", "update"
    value: Any = None
    reducer: Optional[Callable[[Any], Any]] = None
    trigger: Optional[str] = None
    frame_id: int = 0
    task_id: Optional[str] = None
    node_id: Optional[str] = None
    action_index: int = 0


class Signal(Generic[T]):
    """Observable value that tracks reads and queues writes.
    
    Per PRD 3.5.1:
    - get() registers dependency during render
    - set() queues action (never applied during render)
    """
    
    def __init__(
        self,
        initial: T,
        key: str,
        action_queue: Optional['ActionQueue'] = None,
    ):
        self._value: T = initial
        self._key = key
        self._action_queue = action_queue
        self._subscribers: WeakSet[Computed] = WeakSet()
    
    @property
    def key(self) -> str:
        return self._key
    
    def get(self) -> T:
        tracker = DependencyTracker.get_current()
        if tracker:
            tracker.track_read(self._key)
        return self._value
    
    def set(
        self,
        value: T,
        trigger: Optional[str] = None,
        frame_id: int = 0,
        task_id: Optional[str] = None,
        node_id: Optional[str] = None,
    ) -> None:
        if self._action_queue:
            action = StateAction(
                key=self._key,
                action_type="set",
                value=value,
                trigger=trigger,
                frame_id=frame_id,
                task_id=task_id,
                node_id=node_id,
            )
            self._action_queue.enqueue(action)
        else:
            self._apply(value)
    
    def update(
        self,
        reducer: Callable[[T], T],
        trigger: Optional[str] = None,
        frame_id: int = 0,
        task_id: Optional[str] = None,
        node_id: Optional[str] = None,
    ) -> None:
        if self._action_queue:
            action = StateAction(
                key=self._key,
                action_type="update",
                reducer=reducer,
                trigger=trigger,
                frame_id=frame_id,
                task_id=task_id,
                node_id=node_id,
            )
            self._action_queue.enqueue(action)
        else:
            self._apply(reducer(self._value))
    
    def _apply(self, value: T) -> None:
        old = self._value
        self._value = value
        if old != value:
            self._notify()
    
    def _notify(self) -> None:
        for computed in self._subscribers:
            computed.invalidate()
    
    def _subscribe(self, computed: 'Computed') -> None:
        self._subscribers.add(computed)
    
    def _unsubscribe(self, computed: 'Computed') -> None:
        self._subscribers.discard(computed)


class Computed(Generic[T]):
    """Cached derived value that invalidates when dependencies change.
    
    Per PRD 3.5.1:
    - Runs computation on first access
    - Caches result until any dependency changes
    """
    
    def __init__(self, fn: Callable[[], T]):
        self._fn = fn
        self._value: Optional[T] = None
        self._valid = False
        self._dependencies: Set[Signal] = set()
    
    def get(self) -> T:
        if not self._valid:
            self._recompute()
        return self._value  # type: ignore
    
    def _recompute(self) -> None:
        for sig in self._dependencies:
            sig._unsubscribe(self)
        self._dependencies.clear()
        
        old_tracker = DependencyTracker.get_current()
        tracker = DependencyTracker()
        DependencyTracker.set_current(tracker)
        
        try:
            self._value = self._fn()
            self._valid = True
        finally:
            DependencyTracker.set_current(old_tracker)
    
    def invalidate(self) -> None:
        self._valid = False


class ActionQueue:
    """Queue for batched state actions.
    
    Per PRD 3.4.2: Batched updates flushed at effect boundary.
    """
    
    def __init__(self):
        self._actions: list[StateAction] = []
        self._action_index = 0
    
    def enqueue(self, action: StateAction) -> None:
        action.action_index = self._action_index
        self._action_index += 1
        self._actions.append(action)
    
    def flush(self) -> list[StateAction]:
        actions = self._actions
        self._actions = []
        self._action_index = 0
        return actions
    
    def pending(self) -> list[StateAction]:
        return self._actions.copy()
    
    def clear(self) -> None:
        self._actions.clear()
        self._action_index = 0
    
    @property
    def has_pending(self) -> bool:
        return len(self._actions) > 0


def resolve_conflicts(actions: list[StateAction]) -> Dict[str, Any]:
    """Resolve multiple actions on same key.
    
    Per PRD 7.4.2:
    - Apply in order (frame_id, task_id, action_index)
    - Last write wins for 'set'
    - 'update' runs reducer against latest value
    """
    by_key: Dict[str, list[StateAction]] = {}
    for action in actions:
        if action.key not in by_key:
            by_key[action.key] = []
        by_key[action.key].append(action)
    
    results: Dict[str, Any] = {}
    
    for key, key_actions in by_key.items():
        sorted_actions = sorted(
            key_actions,
            key=lambda a: (a.frame_id, a.task_id or '', a.action_index)
        )
        
        current = None
        for action in sorted_actions:
            if action.action_type == "set":
                current = action.value
            elif action.action_type == "delete":
                current = None
            elif action.action_type == "update" and action.reducer:
                current = action.reducer(current)
        
        results[key] = current
    
    return results


@dataclass
class SignalRegistry:
    """Registry for tracking all signals in an execution.
    
    Enables dependency-based re-render scheduling.
    """
    
    signals: Dict[str, Signal] = field(default_factory=dict)
    action_queue: ActionQueue = field(default_factory=ActionQueue)
    tracker: DependencyTracker = field(default_factory=DependencyTracker)
    
    def create_signal(self, key: str, initial: Any = None) -> Signal:
        if key not in self.signals:
            self.signals[key] = Signal(initial, key, self.action_queue)
        return self.signals[key]
    
    def get(self, key: str) -> Any:
        if key in self.signals:
            return self.signals[key].get()
        return None
    
    def set(
        self,
        key: str,
        value: Any,
        trigger: Optional[str] = None,
        frame_id: int = 0,
    ) -> None:
        signal = self.create_signal(key, value)
        signal.set(value, trigger=trigger, frame_id=frame_id)
    
    def start_render(self, frame_id: int) -> None:
        self.tracker.start_frame(frame_id)
        DependencyTracker.set_current(self.tracker)
    
    def end_render(self) -> Set[str]:
        deps = self.tracker.end_frame()
        DependencyTracker.set_current(None)
        return deps
    
    def flush(self) -> Dict[str, Any]:
        actions = self.action_queue.flush()
        if not actions:
            return {}
        
        results = resolve_conflicts(actions)
        
        for key, value in results.items():
            if key in self.signals:
                self.signals[key]._apply(value)
        
        return results
