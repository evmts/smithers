"""Tests for Render Purity Enforcement.

Tests the render phase purity checks and guarded state.
"""

import pytest
from unittest.mock import Mock

from smithers_py.engine.render_purity import (
    FramePhase,
    RenderPhaseWriteError,
    RenderPhaseTaskError,
    RenderPhaseDbWriteError,
    get_current_phase,
    set_current_phase,
    is_render_phase,
    phase_context,
    enforce_purity,
    check_write_allowed,
    check_task_allowed,
    PurityGuardedState,
    PurityAuditor,
    PurityViolation,
)


class TestFramePhase:
    """Tests for FramePhase enum."""
    
    def test_all_phases_defined(self):
        """Test all frame phases are defined."""
        phases = [
            FramePhase.SNAPSHOT,
            FramePhase.RENDER,
            FramePhase.RECONCILE,
            FramePhase.COMMIT,
            FramePhase.EXECUTE,
            FramePhase.EFFECTS,
            FramePhase.FLUSH,
            FramePhase.IDLE,
        ]
        assert len(phases) == 8
    
    def test_phase_values(self):
        """Test phase string values."""
        assert FramePhase.RENDER.value == "render"
        assert FramePhase.IDLE.value == "idle"


class TestPhaseTracking:
    """Tests for phase tracking functions."""
    
    def setup_method(self):
        """Reset phase to IDLE before each test."""
        set_current_phase(FramePhase.IDLE)
    
    def test_default_phase(self):
        """Test default phase is IDLE."""
        set_current_phase(FramePhase.IDLE)
        assert get_current_phase() == FramePhase.IDLE
    
    def test_set_and_get_phase(self):
        """Test setting and getting phase."""
        set_current_phase(FramePhase.RENDER)
        assert get_current_phase() == FramePhase.RENDER
        
        set_current_phase(FramePhase.COMMIT)
        assert get_current_phase() == FramePhase.COMMIT
    
    def test_is_render_phase(self):
        """Test is_render_phase check."""
        set_current_phase(FramePhase.IDLE)
        assert not is_render_phase()
        
        set_current_phase(FramePhase.RENDER)
        assert is_render_phase()
        
        set_current_phase(FramePhase.EXECUTE)
        assert not is_render_phase()
    
    def test_phase_context_manager(self):
        """Test phase context manager."""
        set_current_phase(FramePhase.IDLE)
        
        with phase_context(FramePhase.RENDER):
            assert get_current_phase() == FramePhase.RENDER
        
        assert get_current_phase() == FramePhase.IDLE
    
    def test_phase_context_nesting(self):
        """Test nested phase contexts."""
        set_current_phase(FramePhase.IDLE)
        
        with phase_context(FramePhase.RENDER):
            assert get_current_phase() == FramePhase.RENDER
            
            with phase_context(FramePhase.EXECUTE):
                assert get_current_phase() == FramePhase.EXECUTE
            
            assert get_current_phase() == FramePhase.RENDER
        
        assert get_current_phase() == FramePhase.IDLE
    
    def test_phase_context_exception_safety(self):
        """Test phase is restored even on exception."""
        set_current_phase(FramePhase.IDLE)
        
        with pytest.raises(ValueError):
            with phase_context(FramePhase.RENDER):
                assert get_current_phase() == FramePhase.RENDER
                raise ValueError("test error")
        
        assert get_current_phase() == FramePhase.IDLE


class TestPurityChecks:
    """Tests for purity check functions."""
    
    def setup_method(self):
        set_current_phase(FramePhase.IDLE)
    
    def test_check_write_allowed_in_idle(self):
        """Test writes allowed in IDLE phase."""
        set_current_phase(FramePhase.IDLE)
        check_write_allowed("test_write")  # Should not raise
    
    def test_check_write_blocked_in_render(self):
        """Test writes blocked in RENDER phase."""
        set_current_phase(FramePhase.RENDER)
        
        with pytest.raises(RenderPhaseDbWriteError) as exc:
            check_write_allowed("test_write")
        
        assert "test_write" in str(exc.value)
    
    def test_check_task_allowed_in_execute(self):
        """Test tasks allowed in EXECUTE phase."""
        set_current_phase(FramePhase.EXECUTE)
        check_task_allowed("start agent")  # Should not raise
    
    def test_check_task_blocked_in_render(self):
        """Test tasks blocked in RENDER phase."""
        set_current_phase(FramePhase.RENDER)
        
        with pytest.raises(RenderPhaseTaskError) as exc:
            check_task_allowed("start agent")
        
        assert "start agent" in str(exc.value)


class TestEnforcePurityDecorator:
    """Tests for enforce_purity decorator."""
    
    def setup_method(self):
        set_current_phase(FramePhase.IDLE)
    
    def test_decorator_sets_render_phase(self):
        """Test decorator sets render phase during execution."""
        @enforce_purity
        def my_component():
            return is_render_phase()
        
        result = my_component()
        assert result is True
    
    def test_decorator_restores_phase(self):
        """Test decorator restores original phase."""
        set_current_phase(FramePhase.EXECUTE)
        
        @enforce_purity
        def my_component():
            return "result"
        
        my_component()
        
        assert get_current_phase() == FramePhase.EXECUTE
    
    def test_decorator_preserves_function_name(self):
        """Test decorator preserves function name."""
        @enforce_purity
        def my_named_component():
            pass
        
        assert my_named_component.__name__ == "my_named_component"


class TestPurityGuardedState:
    """Tests for PurityGuardedState wrapper."""
    
    def setup_method(self):
        set_current_phase(FramePhase.IDLE)
    
    def test_get_always_allowed(self):
        """Test get is always allowed."""
        store = Mock()
        store.get.return_value = "value"
        
        guarded = PurityGuardedState(store)
        
        # In render phase
        set_current_phase(FramePhase.RENDER)
        result = guarded.get("key")
        
        assert result == "value"
        store.get.assert_called_with("key")
    
    def test_set_blocked_in_render(self):
        """Test set is blocked in render phase."""
        store = Mock()
        guarded = PurityGuardedState(store)
        
        set_current_phase(FramePhase.RENDER)
        
        with pytest.raises(RenderPhaseWriteError) as exc:
            guarded.set("key", "value")
        
        assert exc.value.key == "key"
        assert exc.value.value == "value"
    
    def test_set_allowed_outside_render(self):
        """Test set is allowed outside render phase."""
        store = Mock()
        guarded = PurityGuardedState(store)
        
        set_current_phase(FramePhase.EFFECTS)
        guarded.set("key", "value", "trigger")
        
        store.set.assert_called_with("key", "value", "trigger")
    
    def test_init_always_allowed(self):
        """Test init is allowed even in render phase."""
        store = Mock()
        store.get.return_value = None
        
        guarded = PurityGuardedState(store)
        
        set_current_phase(FramePhase.RENDER)
        result = guarded.init("new_key", "initial_value")
        
        assert result is True
        store.set.assert_called_with("new_key", "initial_value", trigger="init")
    
    def test_init_skips_if_exists(self):
        """Test init doesn't overwrite existing value."""
        store = Mock()
        store.get.return_value = "existing"
        
        guarded = PurityGuardedState(store)
        result = guarded.init("key", "new_value")
        
        assert result is False
        store.set.assert_not_called()
    
    def test_snapshot_allowed(self):
        """Test snapshot is always allowed."""
        store = Mock()
        store.snapshot.return_value = {"key": "value"}
        
        guarded = PurityGuardedState(store)
        
        set_current_phase(FramePhase.RENDER)
        result = guarded.snapshot()
        
        assert result == {"key": "value"}
    
    def test_commit_blocked_in_render(self):
        """Test commit is blocked in render phase."""
        store = Mock()
        guarded = PurityGuardedState(store)
        
        set_current_phase(FramePhase.RENDER)
        
        with pytest.raises(RenderPhaseDbWriteError):
            guarded.commit()


class TestPurityAuditor:
    """Tests for PurityAuditor class."""
    
    def setup_method(self):
        set_current_phase(FramePhase.IDLE)
    
    def test_strict_mode_raises(self):
        """Test strict mode raises exceptions."""
        auditor = PurityAuditor(strict=True)
        
        with pytest.raises(RenderPhaseWriteError):
            auditor.record_violation("write", "key1")
    
    def test_non_strict_mode_records(self):
        """Test non-strict mode just records."""
        auditor = PurityAuditor(strict=False)
        
        auditor.record_violation("write", "key1", frame_id=1)
        auditor.record_violation("task", "agent1", frame_id=2)
        
        violations = auditor.get_violations()
        assert len(violations) == 2
        assert violations[0].details == "key1"
        assert violations[1].details == "agent1"
    
    def test_violation_includes_phase(self):
        """Test violation records current phase."""
        set_current_phase(FramePhase.RENDER)
        auditor = PurityAuditor(strict=False)
        
        auditor.record_violation("write", "test")
        
        violations = auditor.get_violations()
        assert violations[0].phase == FramePhase.RENDER
    
    def test_clear_violations(self):
        """Test clearing violation history."""
        auditor = PurityAuditor(strict=False)
        auditor.record_violation("write", "test")
        
        auditor.clear()
        
        assert len(auditor.get_violations()) == 0


class TestExceptions:
    """Tests for exception classes."""
    
    def test_render_phase_write_error(self):
        """Test RenderPhaseWriteError message."""
        error = RenderPhaseWriteError("mykey", 42)
        
        assert "mykey" in str(error)
        assert "render phase" in str(error).lower()
        assert error.key == "mykey"
        assert error.value == 42
    
    def test_render_phase_task_error(self):
        """Test RenderPhaseTaskError message."""
        error = RenderPhaseTaskError("run agent")
        
        assert "run agent" in str(error)
        assert "render phase" in str(error).lower()
        assert error.task_description == "run agent"
    
    def test_render_phase_db_write_error(self):
        """Test RenderPhaseDbWriteError message."""
        error = RenderPhaseDbWriteError("INSERT")
        
        assert "INSERT" in str(error)
        assert "render phase" in str(error).lower()
        assert error.operation == "INSERT"
