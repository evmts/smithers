"""Tests for effect registry and loop detection."""

import pytest

from smithers_py.engine.effects import (
    EffectRegistry,
    EffectLoopDetector,
    EffectLoopError,
    run_effects_strict_mode,
)


class TestEffectRegistry:
    """Tests for EffectRegistry."""
    
    def test_should_run_first_time(self):
        """Effect should run on first mount."""
        registry = EffectRegistry()
        
        result = registry.should_run("effect-1", [1, 2, 3])
        
        assert result is True
    
    def test_should_run_deps_changed(self):
        """Effect should run when deps change."""
        registry = EffectRegistry()
        
        # First run
        registry.record_run("effect-1", [1, 2, 3])
        
        # Check with changed deps
        result = registry.should_run("effect-1", [1, 2, 4])
        
        assert result is True
    
    def test_should_not_run_same_deps(self):
        """Effect should not run when deps are same."""
        registry = EffectRegistry()
        
        # First run
        registry.record_run("effect-1", [1, 2, 3])
        
        # Check with same deps
        result = registry.should_run("effect-1", [1, 2, 3])
        
        assert result is False
    
    def test_deps_equality_with_objects(self):
        """Test deps comparison with objects."""
        registry = EffectRegistry()
        
        deps1 = {"a": 1, "b": 2}
        deps2 = {"b": 2, "a": 1}  # Same content, different order
        
        registry.record_run("effect-1", [deps1])
        
        # Should be equal despite dict ordering
        result = registry.should_run("effect-1", [deps2])
        
        assert result is False
    
    def test_cleanup_scheduling(self):
        """Test cleanup functions are scheduled."""
        registry = EffectRegistry()
        cleanup_called = []
        
        def cleanup1():
            cleanup_called.append("cleanup1")
        
        def cleanup2():
            cleanup_called.append("cleanup2")
        
        # First run with cleanup
        registry.record_run("effect-1", [1], cleanup=cleanup1)
        
        # Second run with new cleanup - should schedule old
        registry.record_run("effect-1", [2], cleanup=cleanup2)
        
        # Run pending cleanups
        count = registry.run_pending_cleanups()
        
        assert count == 1
        assert cleanup_called == ["cleanup1"]
    
    def test_cleanup_unmounted(self):
        """Test cleanup when effects are unmounted."""
        registry = EffectRegistry()
        cleanup_called = []
        
        def cleanup():
            cleanup_called.append("cleaned")
        
        registry.record_run("effect-1", [1], cleanup=cleanup)
        
        # Cleanup unmounted effects
        count = registry.cleanup_unmounted(["effect-1"])
        
        assert count == 1
        assert cleanup_called == ["cleaned"]
    
    def test_run_limit_per_frame(self):
        """Test max runs per frame limit."""
        registry = EffectRegistry(max_runs_per_frame=3)
        
        for _ in range(3):
            registry.record_run("effect-1", [1])
        
        # Should be at limit
        assert registry.check_run_limit("effect-1") is False
    
    def test_reset_frame_counts(self):
        """Test resetting per-frame counts."""
        registry = EffectRegistry(max_runs_per_frame=3)
        
        for _ in range(3):
            registry.record_run("effect-1", [1])
        
        registry.reset_frame_counts()
        
        # Should be able to run again
        assert registry.check_run_limit("effect-1") is True


class TestEffectLoopDetector:
    """Tests for EffectLoopDetector."""
    
    def test_no_loop_different_deps(self):
        """No loop with different deps."""
        detector = EffectLoopDetector(threshold=3)
        
        # Should not raise
        detector.check("effect-1", [1])
        detector.check("effect-1", [2])
        detector.check("effect-1", [3])
    
    def test_loop_detected(self):
        """Loop detected with same deps."""
        detector = EffectLoopDetector(threshold=3)
        
        # Need threshold + 1 checks to trigger (count >= threshold after adding)
        detector.check("effect-1", [1])
        detector.check("effect-1", [1])
        detector.check("effect-1", [1])
        
        with pytest.raises(EffectLoopError) as exc_info:
            detector.check("effect-1", [1])
        
        assert "effect-1" in str(exc_info.value)
        assert "infinite loop" in str(exc_info.value).lower()
    
    def test_different_effects_no_loop(self):
        """Different effect IDs don't count together."""
        detector = EffectLoopDetector(threshold=3)
        
        # Same deps but different effect IDs
        detector.check("effect-1", [1])
        detector.check("effect-2", [1])
        detector.check("effect-1", [1])
        detector.check("effect-2", [1])
        
        # Should not raise - different effect IDs
    
    def test_reset_clears_history(self):
        """Reset clears detection history."""
        detector = EffectLoopDetector(threshold=3)
        
        detector.check("effect-1", [1])
        detector.check("effect-1", [1])
        
        detector.reset()
        
        # Should not raise after reset
        detector.check("effect-1", [1])
        detector.check("effect-1", [1])


class TestStrictMode:
    """Tests for strict effects mode."""
    
    def test_strict_mode_double_invokes(self):
        """Strict mode runs effect twice."""
        call_count = [0]
        
        def effect():
            call_count[0] += 1
        
        run_effects_strict_mode(effect)
        
        assert call_count[0] == 2
    
    def test_strict_mode_with_cleanup(self):
        """Strict mode runs cleanup between invocations."""
        log = []
        
        def effect():
            log.append("effect")
        
        def cleanup():
            log.append("cleanup")
        
        run_effects_strict_mode(effect, cleanup)
        
        assert log == ["effect", "cleanup", "effect"]
    
    def test_strict_mode_no_cleanup(self):
        """Strict mode works without cleanup."""
        log = []
        
        def effect():
            log.append("effect")
        
        run_effects_strict_mode(effect, None)
        
        assert log == ["effect", "effect"]
