"""Tests for State Actions and Transition Audit Log.

Tests the state action system and conflict resolution.
"""

import pytest
import sqlite3
import tempfile
from datetime import datetime
from pathlib import Path

from smithers_py.state.actions import (
    StateAction,
    ActionType,
    TransitionRecord,
    ActionQueue,
    TransitionLog,
    resolve_conflicts,
)


class TestStateAction:
    """Tests for StateAction dataclass."""
    
    def test_set_action(self):
        """Test SET action creation."""
        action = StateAction(
            key="phase",
            action_type=ActionType.SET,
            value="research",
            trigger="claude.finished"
        )
        
        assert action.key == "phase"
        assert action.action_type == ActionType.SET
        assert action.value == "research"
        assert action.trigger == "claude.finished"
    
    def test_delete_action(self):
        """Test DELETE action creation."""
        action = StateAction(
            key="temp_data",
            action_type=ActionType.DELETE
        )
        
        assert action.action_type == ActionType.DELETE
        assert action.value is None
    
    def test_update_action_requires_reducer(self):
        """Test UPDATE action requires reducer."""
        with pytest.raises(ValueError) as exc:
            StateAction(
                key="count",
                action_type=ActionType.UPDATE
            )
        
        assert "reducer" in str(exc.value).lower()
    
    def test_update_action_with_reducer(self):
        """Test UPDATE action with reducer."""
        action = StateAction(
            key="count",
            action_type=ActionType.UPDATE,
            reducer=lambda x: (x or 0) + 1
        )
        
        assert action.action_type == ActionType.UPDATE
        assert action.reducer is not None


class TestResolveConflicts:
    """Tests for conflict resolution."""
    
    def test_single_set(self):
        """Test single SET action."""
        actions = [
            StateAction(key="x", action_type=ActionType.SET, value=42)
        ]
        
        result, applied = resolve_conflicts(actions, None)
        
        assert result == 42
        assert len(applied) == 1
    
    def test_last_set_wins(self):
        """Test last SET wins."""
        actions = [
            StateAction(key="x", action_type=ActionType.SET, value=1, action_index=0),
            StateAction(key="x", action_type=ActionType.SET, value=2, action_index=1),
            StateAction(key="x", action_type=ActionType.SET, value=3, action_index=2),
        ]
        
        result, applied = resolve_conflicts(actions, None)
        
        assert result == 3
        assert len(applied) == 3
    
    def test_update_applies_reducer(self):
        """Test UPDATE applies reducer to current value."""
        actions = [
            StateAction(
                key="count",
                action_type=ActionType.UPDATE,
                reducer=lambda x: (x or 0) + 10
            )
        ]
        
        result, applied = resolve_conflicts(actions, 5)
        
        assert result == 15
    
    def test_chained_updates(self):
        """Test multiple UPDATEs chain correctly."""
        actions = [
            StateAction(
                key="count",
                action_type=ActionType.UPDATE,
                reducer=lambda x: (x or 0) + 1,
                action_index=0
            ),
            StateAction(
                key="count",
                action_type=ActionType.UPDATE,
                reducer=lambda x: x * 2,
                action_index=1
            ),
        ]
        
        result, applied = resolve_conflicts(actions, 5)
        
        # (5 + 1) * 2 = 12
        assert result == 12
    
    def test_delete_clears_value(self):
        """Test DELETE sets value to None."""
        actions = [
            StateAction(key="x", action_type=ActionType.DELETE)
        ]
        
        result, applied = resolve_conflicts(actions, "existing")
        
        assert result is None
    
    def test_set_after_delete(self):
        """Test SET after DELETE restores value."""
        actions = [
            StateAction(key="x", action_type=ActionType.DELETE, action_index=0),
            StateAction(key="x", action_type=ActionType.SET, value="new", action_index=1),
        ]
        
        result, applied = resolve_conflicts(actions, "existing")
        
        assert result == "new"
    
    def test_ordering_by_frame_id(self):
        """Test actions sorted by frame_id."""
        actions = [
            StateAction(key="x", action_type=ActionType.SET, value=2, frame_id=1),
            StateAction(key="x", action_type=ActionType.SET, value=1, frame_id=0),
        ]
        
        result, applied = resolve_conflicts(actions, None)
        
        # frame_id=1 is later, so value=2 wins
        assert result == 2


class TestActionQueue:
    """Tests for ActionQueue class."""
    
    def test_enqueue_set(self):
        """Test enqueueing SET actions."""
        queue = ActionQueue()
        
        action = queue.enqueue_set("phase", "research", trigger="init")
        
        assert queue.has_pending()
        assert action.key == "phase"
        assert action.value == "research"
    
    def test_enqueue_multiple(self):
        """Test enqueueing multiple actions."""
        queue = ActionQueue()
        
        queue.enqueue_set("a", 1)
        queue.enqueue_set("b", 2)
        queue.enqueue_delete("c")
        
        pending = queue.get_pending()
        assert len(pending) == 3
    
    def test_action_index_increments(self):
        """Test action indices increment."""
        queue = ActionQueue()
        
        a1 = queue.enqueue_set("x", 1)
        a2 = queue.enqueue_set("x", 2)
        a3 = queue.enqueue_set("x", 3)
        
        assert a1.action_index == 0
        assert a2.action_index == 1
        assert a3.action_index == 2
    
    def test_get_pending_for_key(self):
        """Test filtering pending by key."""
        queue = ActionQueue()
        
        queue.enqueue_set("a", 1)
        queue.enqueue_set("b", 2)
        queue.enqueue_set("a", 3)
        
        a_actions = queue.get_pending_for_key("a")
        
        assert len(a_actions) == 2
        assert all(a.key == "a" for a in a_actions)
    
    def test_clear_returns_actions(self):
        """Test clear returns and removes actions."""
        queue = ActionQueue()
        
        queue.enqueue_set("x", 1)
        queue.enqueue_set("y", 2)
        
        cleared = queue.clear()
        
        assert len(cleared) == 2
        assert not queue.has_pending()
    
    def test_rollback_discards(self):
        """Test rollback discards without returning."""
        queue = ActionQueue()
        
        queue.enqueue_set("x", 1)
        queue.rollback()
        
        assert not queue.has_pending()
    
    def test_frame_id_tracking(self):
        """Test frame ID is set on actions."""
        queue = ActionQueue()
        
        queue.set_frame_id(5)
        action = queue.enqueue_set("x", 1)
        
        assert action.frame_id == 5


class TestTransitionLog:
    """Tests for TransitionLog class."""
    
    @pytest.fixture
    def db_conn(self):
        """Create in-memory SQLite connection."""
        conn = sqlite3.connect(":memory:")
        yield conn
        conn.close()
    
    def test_record_transition(self, db_conn):
        """Test recording a transition."""
        log = TransitionLog(db_conn)
        
        record = TransitionRecord(
            execution_id="exec-123",
            key="phase",
            old_value="research",
            new_value="implement",
            trigger="claude.finished",
            node_id="node-456",
            frame_id=5
        )
        
        transition_id = log.record(record)
        
        assert transition_id > 0
    
    def test_get_history(self, db_conn):
        """Test retrieving transition history."""
        log = TransitionLog(db_conn)
        
        for i in range(3):
            log.record(TransitionRecord(
                execution_id="exec-123",
                key="count",
                old_value=i,
                new_value=i + 1,
                trigger="increment",
                node_id=None,
                frame_id=i
            ))
        
        history = log.get_history("exec-123")
        
        assert len(history) == 3
        # Most recent first
        assert history[0]["frame_id"] == 2
    
    def test_get_history_filtered_by_key(self, db_conn):
        """Test filtering history by key."""
        log = TransitionLog(db_conn)
        
        log.record(TransitionRecord(
            execution_id="exec-123",
            key="phase",
            old_value="a",
            new_value="b",
            trigger="t1",
            node_id=None,
            frame_id=0
        ))
        log.record(TransitionRecord(
            execution_id="exec-123",
            key="count",
            old_value=0,
            new_value=1,
            trigger="t2",
            node_id=None,
            frame_id=1
        ))
        
        phase_history = log.get_history("exec-123", key="phase")
        
        assert len(phase_history) == 1
        assert phase_history[0]["key"] == "phase"
    
    def test_get_for_frame(self, db_conn):
        """Test getting transitions for a specific frame."""
        log = TransitionLog(db_conn)
        
        log.record(TransitionRecord(
            execution_id="exec-123",
            key="a",
            old_value=None,
            new_value=1,
            trigger="t1",
            node_id=None,
            frame_id=5
        ))
        log.record(TransitionRecord(
            execution_id="exec-123",
            key="b",
            old_value=None,
            new_value=2,
            trigger="t2",
            node_id=None,
            frame_id=5
        ))
        log.record(TransitionRecord(
            execution_id="exec-123",
            key="c",
            old_value=None,
            new_value=3,
            trigger="t3",
            node_id=None,
            frame_id=6
        ))
        
        frame_5 = log.get_for_frame("exec-123", 5)
        
        assert len(frame_5) == 2
        keys = [t["key"] for t in frame_5]
        assert "a" in keys
        assert "b" in keys
