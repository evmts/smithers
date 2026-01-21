"""Tests for Phase Registry."""

import sqlite3
import pytest

from smithers_py.engine.phases import PhaseRegistry, PhaseProgress, StepProgress, PhaseStatus


@pytest.fixture
def db_connection():
    """Create in-memory database."""
    conn = sqlite3.connect(":memory:")
    return conn


@pytest.fixture
def phase_registry(db_connection):
    """Create phase registry."""
    return PhaseRegistry(db_connection, "exec-123")


class TestPhaseRegistry:
    """Tests for PhaseRegistry phase operations."""
    
    def test_start_phase(self, phase_registry):
        """Test starting a new phase."""
        progress = phase_registry.start_phase(
            phase_id="phase-1",
            name="Research",
            total_steps=3,
            metadata={"priority": "high"}
        )
        
        assert progress.phase_id == "phase-1"
        assert progress.name == "Research"
        assert progress.status == PhaseStatus.RUNNING
        assert progress.total_steps == 3
        assert progress.current_step == 0
        assert progress.started_at is not None
        assert progress.metadata == {"priority": "high"}
    
    def test_start_phase_resume(self, phase_registry):
        """Test resuming an existing phase."""
        # Start phase
        phase_registry.start_phase("phase-1", "Research", total_steps=3)
        
        # Try to start again - should resume
        progress = phase_registry.start_phase("phase-1", "Research")
        
        assert progress.status == PhaseStatus.RUNNING
        assert progress.name == "Research"
    
    def test_complete_phase(self, phase_registry):
        """Test completing a phase."""
        phase_registry.start_phase("phase-1", "Research")
        phase_registry.complete_phase("phase-1")
        
        phase = phase_registry.get_phase("phase-1")
        assert phase.status == PhaseStatus.COMPLETED
        assert phase.completed_at is not None
    
    def test_fail_phase(self, phase_registry):
        """Test failing a phase."""
        phase_registry.start_phase("phase-1", "Research")
        phase_registry.fail_phase("phase-1", "Tests failed")
        
        phase = phase_registry.get_phase("phase-1")
        assert phase.status == PhaseStatus.FAILED
        assert phase.error == "Tests failed"
    
    def test_skip_phase(self, phase_registry):
        """Test skipping a phase."""
        phase_registry.start_phase("phase-1", "Research")
        phase_registry.skip_phase("phase-1", "Not needed")
        
        phase = phase_registry.get_phase("phase-1")
        assert phase.status == PhaseStatus.SKIPPED
    
    def test_get_current_phase(self, phase_registry):
        """Test getting current running phase."""
        phase_registry.start_phase("phase-1", "Research")
        phase_registry.complete_phase("phase-1")
        phase_registry.start_phase("phase-2", "Implement")
        
        current = phase_registry.get_current_phase()
        
        assert current.phase_id == "phase-2"
        assert current.name == "Implement"
    
    def test_list_phases(self, phase_registry):
        """Test listing all phases."""
        phase_registry.start_phase("phase-1", "Research")
        phase_registry.start_phase("phase-2", "Implement")
        phase_registry.start_phase("phase-3", "Test")
        
        phases = phase_registry.list_phases()
        
        assert len(phases) == 3
        assert [p.name for p in phases] == ["Research", "Implement", "Test"]


class TestStepProgress:
    """Tests for step operations."""
    
    def test_start_step(self, phase_registry):
        """Test starting a step."""
        phase_registry.start_phase("phase-1", "Research", total_steps=3)
        
        step = phase_registry.start_step(
            step_id="step-1",
            phase_id="phase-1",
            name="Gather requirements",
            index=0
        )
        
        assert step.step_id == "step-1"
        assert step.name == "Gather requirements"
        assert step.status == PhaseStatus.RUNNING
        assert step.index == 0
        
        # Phase should update current_step
        phase = phase_registry.get_phase("phase-1")
        assert phase.current_step == 1
    
    def test_complete_step(self, phase_registry):
        """Test completing a step."""
        phase_registry.start_phase("phase-1", "Research")
        phase_registry.start_step("step-1", "phase-1", "Step 1", 0)
        
        phase_registry.complete_step("step-1", result={"files_found": 42})
        
        step = phase_registry.get_step("step-1")
        assert step.status == PhaseStatus.COMPLETED
        assert step.result == {"files_found": 42}
    
    def test_fail_step(self, phase_registry):
        """Test failing a step."""
        phase_registry.start_phase("phase-1", "Research")
        phase_registry.start_step("step-1", "phase-1", "Step 1", 0)
        
        phase_registry.fail_step("step-1", "File not found")
        
        step = phase_registry.get_step("step-1")
        assert step.status == PhaseStatus.FAILED
        assert step.error == "File not found"
    
    def test_list_steps(self, phase_registry):
        """Test listing steps for a phase."""
        phase_registry.start_phase("phase-1", "Research")
        phase_registry.start_step("step-1", "phase-1", "Step 1", 0)
        phase_registry.start_step("step-2", "phase-1", "Step 2", 1)
        phase_registry.start_step("step-3", "phase-1", "Step 3", 2)
        
        steps = phase_registry.list_steps("phase-1")
        
        assert len(steps) == 3
        assert [s.name for s in steps] == ["Step 1", "Step 2", "Step 3"]
        assert [s.index for s in steps] == [0, 1, 2]
    
    def test_progress_path(self, phase_registry):
        """Test getting progress path string."""
        # No phase yet
        assert phase_registry.get_progress_path() == "/"
        
        # Start phase and step
        phase_registry.start_phase("phase-1", "Research", total_steps=3)
        assert phase_registry.get_progress_path() == "Research/step-0"
        
        phase_registry.start_step("step-1", "phase-1", "Step 1", 0)
        assert phase_registry.get_progress_path() == "Research/step-1"
