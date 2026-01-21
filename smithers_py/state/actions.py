"""State Actions and Transition Audit Log.

Implements PRD section 7.4: State Model Specification.

All state modifications are actions queued during a frame and applied
atomically with full audit trail.
"""

import json
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Callable, List, Literal, Optional
from enum import Enum


class ActionType(str, Enum):
    """Type of state action."""
    SET = "set"
    DELETE = "delete"
    UPDATE = "update"


@dataclass
class StateAction:
    """Queued state modification action.
    
    Per PRD 7.4.1: All state modifications are actions queued during a frame.
    """
    
    key: str
    action_type: ActionType
    value: Any = None
    reducer: Optional[Callable[[Any], Any]] = None  # For "update" type
    trigger: Optional[str] = None  # Source of change, e.g., "claude.finished"
    frame_id: int = 0
    task_id: Optional[str] = None
    node_id: Optional[str] = None
    action_index: int = 0  # For ordering within same frame/task
    timestamp: datetime = field(default_factory=datetime.now)
    
    def __post_init__(self):
        if self.action_type == ActionType.UPDATE and self.reducer is None:
            raise ValueError("UPDATE action requires reducer function")


@dataclass
class TransitionRecord:
    """Record of a state transition for audit log.
    
    Per PRD 7.4.3: Every state change is logged.
    """
    
    execution_id: str
    key: str
    old_value: Any
    new_value: Any
    trigger: Optional[str]
    node_id: Optional[str]
    frame_id: int
    timestamp: datetime = field(default_factory=datetime.now)
    
    def to_dict(self) -> dict:
        """Convert to dictionary for storage."""
        return {
            "execution_id": self.execution_id,
            "key": self.key,
            "old_value_json": json.dumps(self.old_value, default=str),
            "new_value_json": json.dumps(self.new_value, default=str),
            "trigger": self.trigger,
            "node_id": self.node_id,
            "frame_id": self.frame_id,
            "timestamp": self.timestamp.isoformat()
        }


def resolve_conflicts(
    actions: List[StateAction],
    current_value: Any
) -> tuple[Any, List[StateAction]]:
    """Resolve conflicts when multiple actions target the same key.
    
    Per PRD 7.4.2: Apply in order. Last write wins for 'set'.
    'update' runs reducer against latest value.
    
    Args:
        actions: List of actions for same key
        current_value: Current value in state
        
    Returns:
        Tuple of (final_value, applied_actions)
    """
    if not actions:
        return current_value, []
    
    # Sort by deterministic ordering: (frame_id, task_id, action_index)
    # None task_id sorts before any string
    sorted_actions = sorted(
        actions,
        key=lambda a: (a.frame_id, a.task_id or "", a.action_index)
    )
    
    value = current_value
    applied = []
    
    for action in sorted_actions:
        if action.action_type == ActionType.SET:
            value = action.value
            applied.append(action)
        elif action.action_type == ActionType.DELETE:
            value = None
            applied.append(action)
        elif action.action_type == ActionType.UPDATE:
            if action.reducer:
                try:
                    value = action.reducer(value)
                    applied.append(action)
                except Exception:
                    pass
    
    return value, applied


class ActionQueue:
    """Queue for batched state actions.
    
    Collects actions during a frame and flushes atomically.
    """
    
    def __init__(self):
        self._actions: List[StateAction] = []
        self._action_counter = 0
        self._current_frame_id = 0
    
    def set_frame_id(self, frame_id: int) -> None:
        """Set current frame ID for new actions."""
        self._current_frame_id = frame_id
    
    def enqueue_set(
        self,
        key: str,
        value: Any,
        trigger: Optional[str] = None,
        node_id: Optional[str] = None,
        task_id: Optional[str] = None
    ) -> StateAction:
        """Queue a SET action."""
        action = StateAction(
            key=key,
            action_type=ActionType.SET,
            value=value,
            trigger=trigger,
            node_id=node_id,
            task_id=task_id,
            frame_id=self._current_frame_id,
            action_index=self._action_counter
        )
        self._actions.append(action)
        self._action_counter += 1
        return action
    
    def enqueue_delete(
        self,
        key: str,
        trigger: Optional[str] = None,
        node_id: Optional[str] = None,
        task_id: Optional[str] = None
    ) -> StateAction:
        """Queue a DELETE action."""
        action = StateAction(
            key=key,
            action_type=ActionType.DELETE,
            trigger=trigger,
            node_id=node_id,
            task_id=task_id,
            frame_id=self._current_frame_id,
            action_index=self._action_counter
        )
        self._actions.append(action)
        self._action_counter += 1
        return action
    
    def enqueue_update(
        self,
        key: str,
        reducer: Callable[[Any], Any],
        trigger: Optional[str] = None,
        node_id: Optional[str] = None,
        task_id: Optional[str] = None
    ) -> StateAction:
        """Queue an UPDATE action with reducer."""
        action = StateAction(
            key=key,
            action_type=ActionType.UPDATE,
            reducer=reducer,
            trigger=trigger,
            node_id=node_id,
            task_id=task_id,
            frame_id=self._current_frame_id,
            action_index=self._action_counter
        )
        self._actions.append(action)
        self._action_counter += 1
        return action
    
    def get_pending(self) -> List[StateAction]:
        """Get all pending actions."""
        return list(self._actions)
    
    def get_pending_for_key(self, key: str) -> List[StateAction]:
        """Get pending actions for a specific key."""
        return [a for a in self._actions if a.key == key]
    
    def has_pending(self) -> bool:
        """Check if there are pending actions."""
        return len(self._actions) > 0
    
    def clear(self) -> List[StateAction]:
        """Clear and return all pending actions."""
        actions = self._actions
        self._actions = []
        return actions
    
    def rollback(self) -> None:
        """Discard all pending actions."""
        self._actions = []


class TransitionLog:
    """Audit log for state transitions.
    
    Per PRD 7.4.3: Records all state changes with full context.
    """
    
    def __init__(self, db_connection):
        self._conn = db_connection
        self._ensure_table()
    
    def _ensure_table(self) -> None:
        """Ensure transitions table exists."""
        self._conn.execute("""
            CREATE TABLE IF NOT EXISTS transitions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                execution_id TEXT NOT NULL,
                key TEXT NOT NULL,
                old_value_json TEXT,
                new_value_json TEXT,
                trigger TEXT,
                node_id TEXT,
                frame_id INTEGER,
                timestamp TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        self._conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_transitions_exec 
            ON transitions(execution_id, timestamp DESC)
        """)
        self._conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_transitions_key 
            ON transitions(execution_id, key)
        """)
        self._conn.commit()
    
    def record(self, transition: TransitionRecord) -> int:
        """Record a transition and return its ID."""
        data = transition.to_dict()
        cursor = self._conn.execute("""
            INSERT INTO transitions 
            (execution_id, key, old_value_json, new_value_json, trigger, node_id, frame_id, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            data["execution_id"],
            data["key"],
            data["old_value_json"],
            data["new_value_json"],
            data["trigger"],
            data["node_id"],
            data["frame_id"],
            data["timestamp"]
        ))
        self._conn.commit()
        return cursor.lastrowid
    
    def get_history(
        self,
        execution_id: str,
        key: Optional[str] = None,
        limit: int = 100
    ) -> List[dict]:
        """Get transition history for an execution."""
        if key:
            cursor = self._conn.execute("""
                SELECT * FROM transitions 
                WHERE execution_id = ? AND key = ?
                ORDER BY timestamp DESC
                LIMIT ?
            """, (execution_id, key, limit))
        else:
            cursor = self._conn.execute("""
                SELECT * FROM transitions 
                WHERE execution_id = ?
                ORDER BY timestamp DESC
                LIMIT ?
            """, (execution_id, limit))
        
        columns = [desc[0] for desc in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]
    
    def get_for_frame(self, execution_id: str, frame_id: int) -> List[dict]:
        """Get all transitions for a specific frame."""
        cursor = self._conn.execute("""
            SELECT * FROM transitions 
            WHERE execution_id = ? AND frame_id = ?
            ORDER BY id ASC
        """, (execution_id, frame_id))
        
        columns = [desc[0] for desc in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]
