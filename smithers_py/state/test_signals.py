"""Tests for signal-based reactivity."""

import pytest
from .signals import (
    Signal,
    Computed,
    DependencyTracker,
    ActionQueue,
    StateAction,
    SignalRegistry,
    resolve_conflicts,
)


class TestSignal:
    def test_get_returns_initial_value(self):
        sig = Signal(42, "count")
        assert sig.get() == 42
    
    def test_set_without_queue_applies_immediately(self):
        sig = Signal(0, "count")
        sig.set(10)
        assert sig.get() == 10
    
    def test_set_with_queue_does_not_apply_immediately(self):
        queue = ActionQueue()
        sig = Signal(0, "count", queue)
        sig.set(10)
        assert sig.get() == 0
        assert queue.has_pending
    
    def test_update_applies_reducer(self):
        sig = Signal(5, "count")
        sig.update(lambda x: x * 2)
        assert sig.get() == 10
    
    def test_update_with_queue_queues_action(self):
        queue = ActionQueue()
        sig = Signal(5, "count", queue)
        sig.update(lambda x: x * 2)
        assert sig.get() == 5
        assert len(queue.pending()) == 1
        assert queue.pending()[0].action_type == "update"
    
    def test_key_property(self):
        sig = Signal(0, "my_key")
        assert sig.key == "my_key"


class TestDependencyTracker:
    def test_track_read_adds_key(self):
        tracker = DependencyTracker()
        tracker.start_frame(1)
        tracker.track_read("foo")
        tracker.track_read("bar")
        assert tracker.get_dependencies() == {"foo", "bar"}
    
    def test_should_rerender_with_matching_key(self):
        tracker = DependencyTracker()
        tracker.start_frame(1)
        tracker.track_read("foo")
        assert tracker.should_rerender({"foo"})
        assert tracker.should_rerender({"foo", "bar"})
    
    def test_should_not_rerender_without_matching_key(self):
        tracker = DependencyTracker()
        tracker.start_frame(1)
        tracker.track_read("foo")
        assert not tracker.should_rerender({"bar"})
        assert not tracker.should_rerender(set())
    
    def test_end_frame_clears_deps(self):
        tracker = DependencyTracker()
        tracker.start_frame(1)
        tracker.track_read("foo")
        deps = tracker.end_frame()
        assert deps == {"foo"}
        assert tracker.get_dependencies() == set()
    
    def test_context_var_tracking(self):
        tracker = DependencyTracker()
        DependencyTracker.set_current(tracker)
        tracker.start_frame(1)
        
        sig = Signal(10, "x")
        _ = sig.get()
        
        assert "x" in tracker.get_dependencies()
        DependencyTracker.set_current(None)
    
    def test_no_tracking_without_current_tracker(self):
        DependencyTracker.set_current(None)
        sig = Signal(10, "x")
        _ = sig.get()  # Should not raise


class TestComputed:
    def test_computes_on_first_get(self):
        call_count = 0
        def compute():
            nonlocal call_count
            call_count += 1
            return 42
        
        c = Computed(compute)
        assert call_count == 0
        assert c.get() == 42
        assert call_count == 1
    
    def test_caches_result(self):
        call_count = 0
        def compute():
            nonlocal call_count
            call_count += 1
            return "cached"
        
        c = Computed(compute)
        c.get()
        c.get()
        c.get()
        assert call_count == 1
    
    def test_invalidate_triggers_recompute(self):
        call_count = 0
        def compute():
            nonlocal call_count
            call_count += 1
            return call_count
        
        c = Computed(compute)
        assert c.get() == 1
        c.invalidate()
        assert c.get() == 2
    
    def test_computed_with_signals(self):
        sig = Signal(10, "x")
        
        def compute():
            return sig.get() * 2
        
        c = Computed(compute)
        assert c.get() == 20
        
        sig._apply(5)
        c.invalidate()
        assert c.get() == 10


class TestActionQueue:
    def test_enqueue_adds_action(self):
        queue = ActionQueue()
        action = StateAction(key="x", action_type="set", value=1)
        queue.enqueue(action)
        assert queue.has_pending
        assert len(queue.pending()) == 1
    
    def test_flush_returns_and_clears(self):
        queue = ActionQueue()
        queue.enqueue(StateAction(key="x", action_type="set", value=1))
        queue.enqueue(StateAction(key="y", action_type="set", value=2))
        
        actions = queue.flush()
        assert len(actions) == 2
        assert not queue.has_pending
    
    def test_action_index_increments(self):
        queue = ActionQueue()
        queue.enqueue(StateAction(key="x", action_type="set", value=1))
        queue.enqueue(StateAction(key="x", action_type="set", value=2))
        
        actions = queue.pending()
        assert actions[0].action_index == 0
        assert actions[1].action_index == 1
    
    def test_clear_removes_all(self):
        queue = ActionQueue()
        queue.enqueue(StateAction(key="x", action_type="set", value=1))
        queue.clear()
        assert not queue.has_pending


class TestResolveConflicts:
    def test_last_set_wins(self):
        actions = [
            StateAction(key="x", action_type="set", value=1, action_index=0),
            StateAction(key="x", action_type="set", value=2, action_index=1),
            StateAction(key="x", action_type="set", value=3, action_index=2),
        ]
        result = resolve_conflicts(actions)
        assert result["x"] == 3
    
    def test_update_chains(self):
        actions = [
            StateAction(key="x", action_type="set", value=1, action_index=0),
            StateAction(key="x", action_type="update", reducer=lambda v: v + 10, action_index=1),
            StateAction(key="x", action_type="update", reducer=lambda v: v * 2, action_index=2),
        ]
        result = resolve_conflicts(actions)
        assert result["x"] == 22  # (1 + 10) * 2
    
    def test_delete_sets_none(self):
        actions = [
            StateAction(key="x", action_type="set", value=100, action_index=0),
            StateAction(key="x", action_type="delete", action_index=1),
        ]
        result = resolve_conflicts(actions)
        assert result["x"] is None
    
    def test_multiple_keys(self):
        actions = [
            StateAction(key="x", action_type="set", value=1, action_index=0),
            StateAction(key="y", action_type="set", value=2, action_index=1),
            StateAction(key="x", action_type="set", value=10, action_index=2),
        ]
        result = resolve_conflicts(actions)
        assert result["x"] == 10
        assert result["y"] == 2
    
    def test_frame_ordering(self):
        actions = [
            StateAction(key="x", action_type="set", value=100, frame_id=2, action_index=0),
            StateAction(key="x", action_type="set", value=1, frame_id=1, action_index=0),
        ]
        result = resolve_conflicts(actions)
        assert result["x"] == 100  # frame 2 comes after frame 1
    
    def test_task_ordering(self):
        actions = [
            StateAction(key="x", action_type="set", value=1, task_id="b", action_index=0),
            StateAction(key="x", action_type="set", value=2, task_id="a", action_index=0),
        ]
        result = resolve_conflicts(actions)
        assert result["x"] == 1  # "b" > "a" lexically


class TestSignalRegistry:
    def test_create_signal(self):
        reg = SignalRegistry()
        sig = reg.create_signal("x", 42)
        assert sig.get() == 42
        assert reg.get("x") == 42
    
    def test_create_signal_idempotent(self):
        reg = SignalRegistry()
        sig1 = reg.create_signal("x", 1)
        sig2 = reg.create_signal("x", 999)
        assert sig1 is sig2
        assert reg.get("x") == 1
    
    def test_get_nonexistent_returns_none(self):
        reg = SignalRegistry()
        assert reg.get("missing") is None
    
    def test_set_creates_and_queues(self):
        reg = SignalRegistry()
        reg.set("x", 100)
        assert reg.action_queue.has_pending
    
    def test_flush_applies_changes(self):
        reg = SignalRegistry()
        reg.create_signal("x", 0)
        reg.set("x", 50)
        
        result = reg.flush()
        assert result["x"] == 50
        assert reg.get("x") == 50
    
    def test_start_end_render_tracks_deps(self):
        reg = SignalRegistry()
        reg.create_signal("a", 1)
        reg.create_signal("b", 2)
        
        reg.start_render(frame_id=1)
        _ = reg.get("a")
        deps = reg.end_render()
        
        assert deps == {"a"}
    
    def test_integration_render_then_flush(self):
        reg = SignalRegistry()
        reg.create_signal("count", 0)
        
        reg.start_render(1)
        val = reg.get("count")
        deps = reg.end_render()
        
        assert val == 0
        assert "count" in deps
        
        reg.set("count", 1)
        reg.set("count", 2)
        
        result = reg.flush()
        assert result["count"] == 2
        assert reg.get("count") == 2


class TestSignalNotification:
    def test_signal_notifies_computed_on_change(self):
        sig = Signal(10, "x")
        
        invalidated = []
        c = Computed(lambda: sig.get())
        c.get()  # force compute
        
        original_invalidate = c.invalidate
        def tracking_invalidate():
            invalidated.append(True)
            original_invalidate()
        c.invalidate = tracking_invalidate
        
        sig._subscribe(c)
        sig._apply(20)
        
        assert len(invalidated) == 1
    
    def test_no_notification_when_value_unchanged(self):
        sig = Signal(10, "x")
        
        invalidated = []
        c = Computed(lambda: sig.get())
        c.get()
        
        original_invalidate = c.invalidate
        def tracking_invalidate():
            invalidated.append(True)
            original_invalidate()
        c.invalidate = tracking_invalidate
        
        sig._subscribe(c)
        sig._apply(10)  # same value
        
        assert len(invalidated) == 0
