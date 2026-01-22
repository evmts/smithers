"""Tests for MCP Tools implementation."""

import json
import sqlite3
import tempfile
import threading
import time
from datetime import datetime
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock

import pytest
from pydantic import ValidationError

from smithers_py.mcp.tools import (
    MCPToolProvider,
    StartExecutionParams,
    ExecutionConfig,
    TickParams,
    RunUntilIdleParams,
    StopParams,
    PauseResumeParams,
    SetStateParams,
    RestartFromFrameParams,
    GetFrameParams,
    ExecutionSummary,
    StateChangeResult,
    FrameData,
    TOOL_DEFINITIONS
)
from smithers_py.errors import SmithersError


@pytest.fixture
def temp_db():
    """Create a temporary database with schema."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name

    # Initialize database with schema directly using sqlite3
    conn = sqlite3.connect(db_path)
    schema_path = Path(__file__).parent.parent / "db" / "schema.sql"
    with open(schema_path, 'r') as f:
        schema_sql = f.read()
    conn.executescript(schema_sql)
    conn.commit()
    conn.close()

    yield db_path

    # Cleanup
    Path(db_path).unlink()


@pytest.fixture
def provider(temp_db):
    """Create MCPToolProvider with temp database."""
    provider = MCPToolProvider(temp_db)
    yield provider
    provider.cleanup()


@pytest.fixture
def sample_script(tmp_path):
    """Create a sample script file."""
    script_path = tmp_path / "test_script.smithers"
    script_path.write_text("""
    <Phase name="test">
        <Text>Hello World</Text>
    </Phase>
    """)
    return str(script_path)


class TestValidationModels:
    """Test parameter validation models."""

    def test_execution_config_validation(self):
        """Test ExecutionConfig validation."""
        # Valid config
        config = ExecutionConfig(max_frames=500, tick_interval=1.0, timeout=300.0)
        assert config.max_frames == 500
        assert config.tick_interval == 1.0
        assert config.timeout == 300.0

        # Default values
        config = ExecutionConfig()
        assert config.max_frames == 1000
        assert config.tick_interval == 0.25
        assert config.timeout is None

        # Invalid values
        with pytest.raises(ValidationError):
            ExecutionConfig(max_frames=0)  # Too small

        with pytest.raises(ValidationError):
            ExecutionConfig(max_frames=20000)  # Too large

        with pytest.raises(ValidationError):
            ExecutionConfig(tick_interval=-1)  # Negative

        with pytest.raises(ValidationError):
            ExecutionConfig(timeout=4000)  # Too large

    def test_start_execution_params(self):
        """Test StartExecutionParams validation."""
        # Valid params
        params = StartExecutionParams(
            script="/path/to/script.smithers",
            args=["arg1", "arg2"],
            name="Test Execution",
            tags=["test", "sample"],
            config=ExecutionConfig(max_frames=100)
        )
        assert params.script == "/path/to/script.smithers"
        assert params.args == ["arg1", "arg2"]
        assert params.tags == ["test", "sample"]

        # Empty script should fail
        with pytest.raises(ValidationError):
            StartExecutionParams(script="")

        # Whitespace script should fail
        with pytest.raises(ValidationError):
            StartExecutionParams(script="   ")

    def test_tick_params(self):
        """Test TickParams validation."""
        # Valid
        params = TickParams(execution_id="exec-123")
        assert params.execution_id == "exec-123"

        # Invalid
        with pytest.raises(ValidationError):
            TickParams(execution_id="")

        with pytest.raises(ValidationError):
            TickParams(execution_id="   ")

    def test_set_state_params(self):
        """Test SetStateParams validation."""
        # Valid
        params = SetStateParams(
            execution_id="exec-123",
            key="test_key",
            value={"data": 42},
            trigger="test_trigger"
        )
        assert params.key == "test_key"
        assert params.value == {"data": 42}

        # Empty key should fail
        with pytest.raises(ValidationError):
            SetStateParams(
                execution_id="exec-123",
                key="",
                value="val",
                trigger="trigger"
            )

        # Empty trigger should fail
        with pytest.raises(ValidationError):
            SetStateParams(
                execution_id="exec-123",
                key="key",
                value="val",
                trigger=""
            )

    def test_restart_from_frame_params(self):
        """Test RestartFromFrameParams validation."""
        # Valid
        params = RestartFromFrameParams(execution_id="exec-123", frame_index=5)
        assert params.frame_index == 5

        # Negative frame index should fail
        with pytest.raises(ValidationError):
            RestartFromFrameParams(execution_id="exec-123", frame_index=-1)


class TestMCPToolProvider:
    """Test MCPToolProvider functionality."""

    def test_provider_initialization(self):
        """Test provider initializes correctly."""
        provider = MCPToolProvider()
        assert provider.db_path == ":memory:"
        assert provider._loop is not None
        assert provider._loop.is_running()
        provider.cleanup()

    def test_start_execution_success(self, provider, sample_script):
        """Test successful execution start."""
        params = StartExecutionParams(
            script=sample_script,
            name="Test Run",
            tags=["test", "integration"]
        )

        result = provider.start_execution(params)

        assert isinstance(result, ExecutionSummary)
        assert result.status == "running"
        assert result.name == "Test Run"
        assert result.source_file == sample_script
        assert result.tags == ["test", "integration"]
        assert result.started_at is not None
        assert result.execution_id in provider._executions

    def test_start_execution_file_not_found(self, provider):
        """Test start execution with non-existent script."""
        params = StartExecutionParams(script="/nonexistent/script.smithers")

        with pytest.raises(FileNotFoundError) as exc_info:
            provider.start_execution(params)

        assert "Script file not found" in str(exc_info.value)

    def test_tick_execution(self, provider, sample_script):
        """Test running single tick."""
        # Start execution first
        start_params = StartExecutionParams(script=sample_script)
        start_result = provider.start_execution(start_params)

        # Run tick
        tick_params = TickParams(execution_id=start_result.execution_id)
        tick_result = provider.tick(tick_params)

        assert isinstance(tick_result, ExecutionSummary)
        assert tick_result.execution_id == start_result.execution_id
        assert tick_result.status == "running"

    def test_tick_nonexistent_execution(self, provider):
        """Test ticking non-existent execution."""
        params = TickParams(execution_id="nonexistent")

        with pytest.raises(ValueError) as exc_info:
            provider.tick(params)

        assert "Execution not found" in str(exc_info.value)

    def test_tick_paused_execution(self, provider, sample_script):
        """Test ticking paused execution fails."""
        # Start and pause execution
        start_params = StartExecutionParams(script=sample_script)
        start_result = provider.start_execution(start_params)

        pause_params = PauseResumeParams(execution_id=start_result.execution_id)
        provider.pause(pause_params)

        # Try to tick
        tick_params = TickParams(execution_id=start_result.execution_id)

        with pytest.raises(SmithersError) as exc_info:
            provider.tick(tick_params)

        assert "not in running state" in str(exc_info.value)

    def test_run_until_idle(self, provider, sample_script):
        """Test running execution until idle."""
        # Start execution
        start_params = StartExecutionParams(script=sample_script)
        start_result = provider.start_execution(start_params)

        # Run until idle
        run_params = RunUntilIdleParams(
            execution_id=start_result.execution_id,
            max_frames=50
        )
        run_result = provider.run_until_idle(run_params)

        assert isinstance(run_result, ExecutionSummary)
        assert run_result.execution_id == start_result.execution_id

    def test_stop_execution(self, provider, sample_script):
        """Test stopping execution."""
        # Start execution
        start_params = StartExecutionParams(script=sample_script)
        start_result = provider.start_execution(start_params)

        # Stop it
        stop_params = StopParams(
            execution_id=start_result.execution_id,
            reason="Test stop"
        )
        stop_result = provider.stop(stop_params)

        assert stop_result.status == "stopped"

        # Check internal state
        ctx = provider._executions[start_result.execution_id]
        assert ctx.stop_requested is True
        assert ctx.stop_reason == "Test stop"

    def test_pause_resume_execution(self, provider, sample_script):
        """Test pausing and resuming execution."""
        # Start execution
        start_params = StartExecutionParams(script=sample_script)
        start_result = provider.start_execution(start_params)

        # Pause it
        pause_params = PauseResumeParams(execution_id=start_result.execution_id)
        pause_result = provider.pause(pause_params)
        assert pause_result.status == "paused"

        # Check context
        ctx = provider._executions[start_result.execution_id]
        assert ctx.paused is True
        assert ctx.status == "paused"

        # Resume it
        resume_result = provider.resume(pause_params)
        assert resume_result.status == "running"
        assert ctx.paused is False
        assert ctx.status == "running"

    def test_pause_non_running_execution(self, provider, sample_script):
        """Test pausing non-running execution fails."""
        # Start and stop execution
        start_params = StartExecutionParams(script=sample_script)
        start_result = provider.start_execution(start_params)

        stop_params = StopParams(execution_id=start_result.execution_id)
        provider.stop(stop_params)

        # Try to pause
        pause_params = PauseResumeParams(execution_id=start_result.execution_id)

        with pytest.raises(SmithersError) as exc_info:
            provider.pause(pause_params)

        assert "Cannot pause execution in state: stopped" in str(exc_info.value)

    def test_resume_non_paused_execution(self, provider, sample_script):
        """Test resuming non-paused execution fails."""
        # Start execution (running state)
        start_params = StartExecutionParams(script=sample_script)
        start_result = provider.start_execution(start_params)

        # Try to resume
        resume_params = PauseResumeParams(execution_id=start_result.execution_id)

        with pytest.raises(SmithersError) as exc_info:
            provider.resume(resume_params)

        assert "Cannot resume execution in state: running" in str(exc_info.value)

    def test_set_state(self, provider, sample_script):
        """Test setting state value."""
        # Start execution
        start_params = StartExecutionParams(script=sample_script)
        start_result = provider.start_execution(start_params)

        # Set state
        state_params = SetStateParams(
            execution_id=start_result.execution_id,
            key="test_key",
            value={"count": 42, "message": "test"},
            trigger="unit_test"
        )
        state_result = provider.set_state(state_params)

        assert isinstance(state_result, StateChangeResult)
        assert state_result.key == "test_key"
        assert state_result.old_value is None
        assert state_result.new_value == {"count": 42, "message": "test"}
        assert state_result.trigger == "unit_test"
        assert state_result.timestamp is not None

    def test_get_frame_not_found(self, provider, sample_script):
        """Test getting non-existent frame."""
        # Start execution
        start_params = StartExecutionParams(script=sample_script)
        start_result = provider.start_execution(start_params)

        # Try to get frame that doesn't exist
        frame_params = GetFrameParams(
            execution_id=start_result.execution_id,
            frame_index=999
        )

        with pytest.raises(ValueError) as exc_info:
            provider.get_frame(frame_params)

        assert "Frame not found" in str(exc_info.value)

    def test_restart_from_frame_not_implemented(self, provider, sample_script):
        """Test restart from frame (currently not implemented)."""
        # Start execution
        start_params = StartExecutionParams(script=sample_script)
        start_result = provider.start_execution(start_params)

        # Add a dummy frame to database
        ctx = provider._executions[start_result.execution_id]
        import uuid
        ctx.db.connection.execute(
            """INSERT INTO render_frames (id, execution_id, sequence_number, xml_content, timestamp)
               VALUES (?, ?, ?, ?, ?)""",
            (str(uuid.uuid4()), start_result.execution_id, 0, "<frame>test</frame>", datetime.now().isoformat())
        )
        ctx.db.connection.commit()

        # Try to restart from frame
        restart_params = RestartFromFrameParams(
            execution_id=start_result.execution_id,
            frame_index=0
        )

        with pytest.raises(SmithersError) as exc_info:
            provider.restart_from_frame(restart_params)

        assert "not yet implemented" in str(exc_info.value)

    def test_cleanup(self, provider, sample_script):
        """Test provider cleanup."""
        # Start multiple executions
        for i in range(3):
            params = StartExecutionParams(script=sample_script, name=f"Test {i}")
            provider.start_execution(params)

        assert len(provider._executions) == 3

        # Cleanup
        provider.cleanup()

        # All executions should be cleared
        assert len(provider._executions) == 0

        # Event loop should be stopped
        time.sleep(0.1)  # Give time for thread to stop
        assert not provider._loop.is_running()

    def test_concurrent_operations(self, provider, sample_script):
        """Test concurrent operations on executions."""
        # Start execution
        start_params = StartExecutionParams(script=sample_script)
        start_result = provider.start_execution(start_params)
        exec_id = start_result.execution_id

        # Define concurrent operations
        results = {}
        errors = {}

        def run_tick():
            try:
                results['tick'] = provider.tick(TickParams(execution_id=exec_id))
            except Exception as e:
                errors['tick'] = e

        def run_pause():
            try:
                time.sleep(0.05)  # Small delay
                results['pause'] = provider.pause(PauseResumeParams(execution_id=exec_id))
            except Exception as e:
                errors['pause'] = e

        # Run operations in parallel
        threads = [
            threading.Thread(target=run_tick),
            threading.Thread(target=run_pause)
        ]

        for t in threads:
            t.start()

        for t in threads:
            t.join()

        # Should have completed without deadlock
        assert len(results) + len(errors) == 2


class TestToolDefinitions:
    """Test tool definitions for MCP."""

    def test_tool_definitions_structure(self):
        """Test tool definitions have correct structure."""
        assert len(TOOL_DEFINITIONS) == 14

        expected_tools = [
            "start_execution",
            "tick",
            "run_until_idle",
            "stop",
            "pause",
            "resume",
            "set_state",
            "restart_from_frame",
            "get_frame",
            "cancel_node",
            "retry_node",
            "fork_from_frame",
            "approve",
            "deny"
        ]

        for tool in TOOL_DEFINITIONS:
            assert "name" in tool
            assert "description" in tool
            assert "inputSchema" in tool
            assert tool["name"] in expected_tools

            # Check schema is valid JSON schema
            schema = tool["inputSchema"]
            assert "type" in schema
            assert schema["type"] == "object"
            assert "properties" in schema
            assert "required" in schema

    def test_start_execution_schema(self):
        """Test start_execution tool schema."""
        tool = next(t for t in TOOL_DEFINITIONS if t["name"] == "start_execution")
        schema = tool["inputSchema"]

        assert "script" in schema["properties"]
        assert "args" in schema["properties"]
        assert "name" in schema["properties"]
        assert "tags" in schema["properties"]
        assert "config" in schema["properties"]

        assert "script" in schema["required"]

    def test_set_state_schema(self):
        """Test set_state tool schema."""
        tool = next(t for t in TOOL_DEFINITIONS if t["name"] == "set_state")
        schema = tool["inputSchema"]

        assert "execution_id" in schema["properties"]
        assert "key" in schema["properties"]
        assert "value" in schema["properties"]
        assert "trigger" in schema["properties"]

        assert all(k in schema["required"] for k in ["execution_id", "key", "value", "trigger"])


class TestErrorHandling:
    """Test error handling scenarios."""

    @patch('smithers_py.mcp.tools.TickLoop')
    def test_tick_loop_initialization_error(self, mock_tick_loop, provider, sample_script):
        """Test handling TickLoop initialization errors."""
        mock_tick_loop.side_effect = Exception("TickLoop init failed")

        params = StartExecutionParams(script=sample_script)

        with pytest.raises(SmithersError) as exc_info:
            provider.start_execution(params)

        assert "Failed to start execution" in str(exc_info.value)

    def test_async_operation_error(self, provider, sample_script):
        """Test handling async operation errors."""
        # Start execution
        start_params = StartExecutionParams(script=sample_script)
        start_result = provider.start_execution(start_params)

        # Mock a failing async operation
        ctx = provider._executions[start_result.execution_id]

        # Replace tick_loop with mock that fails
        mock_loop = MagicMock()
        mock_loop._run_single_frame = MagicMock(side_effect=Exception("Async op failed"))
        ctx.tick_loop = mock_loop

        # Try to tick
        tick_params = TickParams(execution_id=start_result.execution_id)

        with pytest.raises(SmithersError) as exc_info:
            provider.tick(tick_params)

        assert "Tick failed" in str(exc_info.value)

    def test_database_error_handling(self, provider, sample_script):
        """Test database error handling."""
        # Start execution
        start_params = StartExecutionParams(script=sample_script)
        start_result = provider.start_execution(start_params)

        # Corrupt the database connection
        ctx = provider._executions[start_result.execution_id]
        ctx.db.connection.close()

        # Try to get frame (database operation)
        frame_params = GetFrameParams(
            execution_id=start_result.execution_id,
            frame_index=0
        )

        with pytest.raises(Exception):  # sqlite3.ProgrammingError or similar
            provider.get_frame(frame_params)

    def test_validation_error_propagation(self, provider):
        """Test that validation errors are properly propagated."""
        # Invalid execution ID (empty)
        with pytest.raises(ValidationError) as exc_info:
            TickParams(execution_id="")

        errors = exc_info.value.errors()
        assert any("Execution ID cannot be empty" in str(e) for e in errors)

        # Invalid frame index (negative)
        with pytest.raises(ValidationError) as exc_info:
            GetFrameParams(execution_id="test", frame_index=-1)

        errors = exc_info.value.errors()
        assert any("greater than or equal to 0" in str(e) for e in errors)