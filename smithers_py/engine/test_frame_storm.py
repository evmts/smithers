"""Tests for Frame Storm Guard.

Tests the FrameStormGuard loop detection and rate limiting.
"""

import pytest
from datetime import datetime
from smithers_py.engine.frame_storm import (
    FrameStormGuard,
    FrameStormError,
    compute_plan_hash,
    compute_state_hash,
)


class TestFrameStormGuard:
    """Tests for FrameStormGuard class."""
    
    def test_normal_operation(self):
        """Test guard allows normal operation."""
        guard = FrameStormGuard(max_frames_per_run=100)
        
        # Should allow 10 different frames
        for i in range(10):
            guard.check_frame(f"plan_{i}", f"state_{i}")
        
        assert guard.frame_count == 10
    
    def test_max_frames_exceeded(self):
        """Test guard raises on max frames exceeded."""
        guard = FrameStormGuard(max_frames_per_run=5)
        
        for i in range(5):
            guard.check_frame(f"plan_{i}", f"state_{i}")
        
        with pytest.raises(FrameStormError) as exc:
            guard.check_frame("plan_6", "state_6")
        
        assert "Maximum frames exceeded" in str(exc.value)
    
    def test_loop_detection(self):
        """Test guard detects infinite loops."""
        guard = FrameStormGuard(
            max_frames_per_run=100,
            loop_detection_window=3
        )
        
        # Same signature repeated 4 times should trigger
        guard.check_frame("same_plan", "same_state")
        guard.check_frame("same_plan", "same_state")
        guard.check_frame("same_plan", "same_state")
        
        with pytest.raises(FrameStormError) as exc:
            guard.check_frame("same_plan", "same_state")
        
        assert "Infinite loop detected" in str(exc.value)
    
    def test_loop_detection_different_plans(self):
        """Test different plans don't trigger loop detection."""
        guard = FrameStormGuard(
            max_frames_per_run=100,
            loop_detection_window=3
        )
        
        # Different plans should not trigger
        for i in range(10):
            guard.check_frame(f"plan_{i}", "same_state")
        
        assert guard.frame_count == 10
    
    def test_rate_limit_per_second(self):
        """Test frames per second limit."""
        guard = FrameStormGuard(
            max_frames_per_second=3,
            max_frames_per_run=100
        )
        
        now = datetime.now().timestamp()
        
        # First 3 should pass
        for i in range(3):
            guard.check_frame(f"plan_{i}", f"state_{i}", now=now)
        
        # 4th in same second should fail
        with pytest.raises(FrameStormError) as exc:
            guard.check_frame("plan_4", "state_4", now=now + 0.1)
        
        assert "Frame rate exceeded" in str(exc.value)
    
    def test_rate_limit_allows_after_cooldown(self):
        """Test rate limit resets after time passes."""
        guard = FrameStormGuard(
            max_frames_per_second=2,
            max_frames_per_run=100
        )
        
        now = 1000.0
        
        # 2 frames at t=1000
        guard.check_frame("plan_1", "state_1", now=now)
        guard.check_frame("plan_2", "state_2", now=now + 0.1)
        
        # After 1 second, should allow more
        guard.check_frame("plan_3", "state_3", now=now + 1.5)
        guard.check_frame("plan_4", "state_4", now=now + 1.6)
        
        assert guard.frame_count == 4
    
    def test_reset(self):
        """Test guard reset clears state."""
        guard = FrameStormGuard(max_frames_per_run=10)
        
        for i in range(5):
            guard.check_frame(f"plan_{i}", f"state_{i}")
        
        assert guard.frame_count == 5
        
        guard.reset()
        
        assert guard.frame_count == 0
        
        # Should be able to run again
        for i in range(10):
            guard.check_frame(f"plan_{i}", f"state_{i}")
        
        assert guard.frame_count == 10


class TestHashFunctions:
    """Tests for hash computation functions."""
    
    def test_plan_hash_deterministic(self):
        """Test plan hash is deterministic."""
        plan = {"type": "phase", "name": "test", "children": []}
        
        hash1 = compute_plan_hash(plan)
        hash2 = compute_plan_hash(plan)
        
        assert hash1 == hash2
    
    def test_plan_hash_different_for_different_plans(self):
        """Test different plans produce different hashes."""
        plan1 = {"type": "phase", "name": "test1"}
        plan2 = {"type": "phase", "name": "test2"}
        
        hash1 = compute_plan_hash(plan1)
        hash2 = compute_plan_hash(plan2)
        
        assert hash1 != hash2
    
    def test_state_hash_deterministic(self):
        """Test state hash is deterministic."""
        state = {"phase": "research", "count": 5}
        
        hash1 = compute_state_hash(state)
        hash2 = compute_state_hash(state)
        
        assert hash1 == hash2
    
    def test_state_hash_order_independent(self):
        """Test state hash is independent of key order."""
        state1 = {"a": 1, "b": 2}
        state2 = {"b": 2, "a": 1}
        
        hash1 = compute_state_hash(state1)
        hash2 = compute_state_hash(state2)
        
        assert hash1 == hash2
    
    def test_hash_length(self):
        """Test hashes are expected length."""
        plan_hash = compute_plan_hash({"test": True})
        state_hash = compute_state_hash({"test": True})
        
        assert len(plan_hash) == 12
        assert len(state_hash) == 12
