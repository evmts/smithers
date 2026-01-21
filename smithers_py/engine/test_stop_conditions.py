"""Tests for stop conditions and frame storm detection."""

import pytest
from datetime import datetime, timedelta

from smithers_py.engine.stop_conditions import (
    StopConditions,
    ExecutionStats,
    StopResult,
    check_stop_conditions,
    FrameStormGuard,
)


class TestStopConditions:
    """Tests for stop condition checking."""
    
    def test_no_conditions_returns_false(self):
        """Test with default conditions - nothing triggers."""
        conditions = StopConditions()
        stats = ExecutionStats(started_at=datetime.now())
        
        result = check_stop_conditions(conditions, stats)
        
        assert result.should_stop is False
        assert result.reason is None
    
    def test_stop_requested(self):
        """Test user-requested stop."""
        conditions = StopConditions(stop_requested=True)
        stats = ExecutionStats(started_at=datetime.now())
        
        result = check_stop_conditions(conditions, stats)
        
        assert result.should_stop is True
        assert "requested" in result.reason.lower()
        assert result.condition_type == "stop_requested"
    
    def test_wall_clock_limit(self):
        """Test wall clock time limit."""
        conditions = StopConditions(max_wall_clock_ms=1000)
        stats = ExecutionStats(
            started_at=datetime.now() - timedelta(seconds=2)  # 2 seconds ago
        )
        
        result = check_stop_conditions(conditions, stats)
        
        assert result.should_stop is True
        assert result.condition_type == "wall_clock_limit"
    
    def test_wall_clock_not_exceeded(self):
        """Test wall clock limit not yet reached."""
        conditions = StopConditions(max_wall_clock_ms=60000)  # 1 minute
        stats = ExecutionStats(started_at=datetime.now())
        
        result = check_stop_conditions(conditions, stats)
        
        assert result.should_stop is False
    
    def test_token_limit(self):
        """Test token limit."""
        conditions = StopConditions(max_total_tokens=1000)
        stats = ExecutionStats(
            started_at=datetime.now(),
            total_tokens=1500
        )
        
        result = check_stop_conditions(conditions, stats)
        
        assert result.should_stop is True
        assert result.condition_type == "token_limit"
    
    def test_tool_call_limit(self):
        """Test tool call limit."""
        conditions = StopConditions(max_tool_calls=10)
        stats = ExecutionStats(
            started_at=datetime.now(),
            total_tool_calls=15
        )
        
        result = check_stop_conditions(conditions, stats)
        
        assert result.should_stop is True
        assert result.condition_type == "tool_call_limit"
    
    def test_cost_limit(self):
        """Test cost limit."""
        conditions = StopConditions(max_cost_usd=5.00)
        stats = ExecutionStats(
            started_at=datetime.now(),
            total_cost_usd=5.50
        )
        
        result = check_stop_conditions(conditions, stats)
        
        assert result.should_stop is True
        assert result.condition_type == "cost_limit"
    
    def test_frame_limit(self):
        """Test frame limit."""
        conditions = StopConditions(max_frames=100)
        stats = ExecutionStats(
            started_at=datetime.now(),
            frame_count=150
        )
        
        result = check_stop_conditions(conditions, stats)
        
        assert result.should_stop is True
        assert result.condition_type == "frame_limit"
    
    def test_iteration_limit(self):
        """Test iteration limit (Ralph loops)."""
        conditions = StopConditions(max_iterations=5)
        stats = ExecutionStats(
            started_at=datetime.now(),
            iteration_count=10
        )
        
        result = check_stop_conditions(conditions, stats)
        
        assert result.should_stop is True
        assert result.condition_type == "iteration_limit"
    
    def test_retry_limit(self):
        """Test max retries per task."""
        conditions = StopConditions(max_retries_per_task=3)
        stats = ExecutionStats(
            started_at=datetime.now(),
            retry_counts={"task-1": 1, "task-2": 4}  # task-2 exceeded
        )
        
        result = check_stop_conditions(conditions, stats)
        
        assert result.should_stop is True
        assert result.condition_type == "retry_limit"
    
    def test_custom_check(self):
        """Test custom stop condition."""
        def custom_check(stats):
            if stats.total_tokens > 500:
                return "Custom: too many tokens"
            return None
        
        conditions = StopConditions(
            custom_checks=[custom_check]
        )
        stats = ExecutionStats(
            started_at=datetime.now(),
            total_tokens=600
        )
        
        result = check_stop_conditions(conditions, stats)
        
        assert result.should_stop is True
        assert result.condition_type == "custom"
        assert "Custom" in result.reason
    
    def test_multiple_conditions_first_wins(self):
        """Test that first matching condition wins."""
        conditions = StopConditions(
            stop_requested=True,
            max_total_tokens=100
        )
        stats = ExecutionStats(
            started_at=datetime.now(),
            total_tokens=200
        )
        
        result = check_stop_conditions(conditions, stats)
        
        # stop_requested comes first
        assert result.condition_type == "stop_requested"


class TestFrameStormGuard:
    """Tests for frame storm detection."""
    
    def test_loop_detection(self):
        """Test detecting infinite loops."""
        guard = FrameStormGuard()
        
        # Same signature multiple times
        for _ in range(4):
            guard.record_frame("plan-hash-1", "state-hash-1")
        
        # Should detect loop
        assert guard.check_loop("plan-hash-1", "state-hash-1") is True
    
    def test_no_loop_different_states(self):
        """Test no loop with different states."""
        guard = FrameStormGuard()
        
        guard.record_frame("plan-1", "state-1")
        guard.record_frame("plan-1", "state-2")
        guard.record_frame("plan-1", "state-3")
        
        # Different states - no loop
        assert guard.check_loop("plan-1", "state-4") is False
    
    def test_max_frames_per_run(self):
        """Test max frames per run limit."""
        guard = FrameStormGuard(max_frames_per_run=10)
        
        for i in range(11):
            guard.record_frame(f"plan-{i}", f"state-{i}")
        
        reason = guard.check_rate_limits()
        assert reason is not None
        assert "per run" in reason
    
    def test_reset(self):
        """Test reset clears state."""
        guard = FrameStormGuard()
        
        for _ in range(5):
            guard.record_frame("plan", "state")
        
        guard.reset()
        
        # After reset, should not detect loop
        assert guard.check_loop("plan", "state") is False


class TestExecutionStats:
    """Tests for ExecutionStats helpers."""
    
    def test_wall_clock_ms(self):
        """Test wall clock calculation."""
        stats = ExecutionStats(
            started_at=datetime.now() - timedelta(seconds=5)
        )
        
        elapsed = stats.wall_clock_ms()
        assert elapsed >= 5000
        assert elapsed < 6000  # Should be around 5000ms
    
    def test_max_retry_count_empty(self):
        """Test max retry with no retries."""
        stats = ExecutionStats(started_at=datetime.now())
        assert stats.max_retry_count() == 0
    
    def test_max_retry_count(self):
        """Test max retry count calculation."""
        stats = ExecutionStats(
            started_at=datetime.now(),
            retry_counts={"a": 2, "b": 5, "c": 1}
        )
        assert stats.max_retry_count() == 5
