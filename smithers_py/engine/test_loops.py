"""Tests for Loop Registry."""

import sqlite3
import pytest

from smithers_py.engine.loops import LoopRegistry, LoopState, compute_iteration_node_id


@pytest.fixture
def db_connection():
    """Create in-memory database."""
    conn = sqlite3.connect(":memory:")
    return conn


@pytest.fixture
def loop_registry(db_connection):
    """Create loop registry."""
    return LoopRegistry(db_connection, "exec-123")


class TestLoopRegistry:
    """Tests for LoopRegistry."""
    
    def test_get_or_create_new(self, loop_registry):
        """Test creating new loop."""
        state = loop_registry.get_or_create("while-1", "while", max_iterations=50)
        
        assert state.loop_id == "while-1"
        assert state.loop_type == "while"
        assert state.current_iteration == 0
        assert state.max_iterations == 50
        assert state.status == "running"
        assert state.started_at is not None
    
    def test_get_or_create_existing(self, loop_registry):
        """Test getting existing loop state."""
        # Create first
        state1 = loop_registry.get_or_create("ralph-1", "ralph")
        
        # Increment
        loop_registry.increment_iteration("ralph-1")
        loop_registry.increment_iteration("ralph-1")
        
        # Get again - should have incremented iterations
        state2 = loop_registry.get_or_create("ralph-1", "ralph")
        
        assert state2.current_iteration == 2
        assert state2.loop_id == state1.loop_id
    
    def test_increment_iteration(self, loop_registry):
        """Test incrementing iteration counter."""
        loop_registry.get_or_create("loop-1", "while")
        
        new_iter = loop_registry.increment_iteration("loop-1")
        assert new_iter == 1
        
        new_iter = loop_registry.increment_iteration("loop-1")
        assert new_iter == 2
        
        state = loop_registry.get_state("loop-1")
        assert state.current_iteration == 2
        assert state.last_iteration_at is not None
    
    def test_should_continue_while(self, loop_registry):
        """Test while loop continuation check."""
        loop_registry.get_or_create("while-1", "while", max_iterations=5)
        
        # Should continue with condition True
        assert loop_registry.should_continue("while-1", condition_met=True)
        
        # Should stop with condition False
        assert not loop_registry.should_continue("while-1", condition_met=False)
        
        # Check it was marked completed
        state = loop_registry.get_state("while-1")
        assert state.status == "completed"
    
    def test_should_continue_max_iterations(self, loop_registry):
        """Test max iterations stops loop."""
        loop_registry.get_or_create("loop-1", "ralph", max_iterations=3)
        
        # Run 3 iterations
        for _ in range(3):
            loop_registry.increment_iteration("loop-1")
        
        # Should stop now
        assert not loop_registry.should_continue("loop-1")
        
        state = loop_registry.get_state("loop-1")
        assert state.status == "max_reached"
    
    def test_complete_loop(self, loop_registry):
        """Test completing a loop."""
        loop_registry.get_or_create("loop-1", "while")
        loop_registry.complete("loop-1", "success")
        
        state = loop_registry.get_state("loop-1")
        assert state.status == "completed"
        assert state.stop_reason == "success"
        assert state.completed_at is not None
    
    def test_reset_loop(self, loop_registry):
        """Test resetting a loop."""
        loop_registry.get_or_create("loop-1", "while")
        loop_registry.increment_iteration("loop-1")
        loop_registry.increment_iteration("loop-1")
        loop_registry.complete("loop-1")
        
        # Reset
        loop_registry.reset("loop-1")
        
        state = loop_registry.get_state("loop-1")
        assert state.current_iteration == 0
        assert state.status == "running"
        assert state.completed_at is None
    
    def test_list_active(self, loop_registry):
        """Test listing active loops."""
        loop_registry.get_or_create("loop-1", "while")
        loop_registry.get_or_create("loop-2", "ralph")
        loop_registry.get_or_create("loop-3", "while")
        loop_registry.complete("loop-2", "success")
        
        active = loop_registry.list_active()
        
        assert len(active) == 2
        assert all(s.status == "running" for s in active)


class TestIterationNodeId:
    """Tests for iteration node ID computation."""
    
    def test_deterministic(self):
        """Test node ID is deterministic."""
        id1 = compute_iteration_node_id("loop-1", 0, "child-a")
        id2 = compute_iteration_node_id("loop-1", 0, "child-a")
        
        assert id1 == id2
    
    def test_different_for_different_iterations(self):
        """Test different iterations produce different IDs."""
        id1 = compute_iteration_node_id("loop-1", 0, "child-a")
        id2 = compute_iteration_node_id("loop-1", 1, "child-a")
        
        assert id1 != id2
    
    def test_different_for_different_children(self):
        """Test different children produce different IDs."""
        id1 = compute_iteration_node_id("loop-1", 0, "child-a")
        id2 = compute_iteration_node_id("loop-1", 0, "child-b")
        
        assert id1 != id2
