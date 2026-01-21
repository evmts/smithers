"""MCP Tools implementation for Smithers execution control.

Provides tools for controlling smithers executions through the MCP protocol:
- start_execution: Start new orchestration execution
- tick: Run single tick for execution
- run_until_idle: Run until quiescent state
- stop: Gracefully stop execution
- pause: Pause execution after current node
- resume: Resume paused execution
- set_state: Set state key/value
- restart_from_frame: Restart execution from specific frame
- get_frame: Get frame data by index
"""

import asyncio
import json
import logging
import os
import sqlite3
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Literal, Union
from concurrent.futures import Future
import threading

from pydantic import BaseModel, Field, ConfigDict, field_validator

from ..db.database import SmithersDB, ExecutionModule
from ..engine.tick_loop import TickLoop, Context
from ..state.volatile import VolatileStore
from ..errors import SmithersError


logger = logging.getLogger(__name__)


# Pydantic models for tool parameters
class ExecutionConfig(BaseModel):
    """Configuration for execution."""

    model_config = ConfigDict(extra='forbid')

    max_frames: int = Field(default=1000, ge=1, le=10000, description="Maximum frames before stopping")
    tick_interval: float = Field(default=0.25, gt=0, le=10.0, description="Minimum interval between ticks in seconds")
    timeout: Optional[float] = Field(default=None, ge=0, le=3600, description="Execution timeout in seconds")


class StartExecutionParams(BaseModel):
    """Parameters for start_execution tool."""

    model_config = ConfigDict(extra='forbid')

    script: str = Field(description="Script file path to execute")
    args: List[str] = Field(default_factory=list, description="Arguments to pass to script")
    name: Optional[str] = Field(default=None, description="Name for the execution")
    tags: List[str] = Field(default_factory=list, description="Tags to associate with execution")
    config: Optional[ExecutionConfig] = Field(default=None, description="Execution configuration")
    idempotency_key: Optional[str] = Field(default=None, description="Idempotency key for deduplication")
    correlation_id: Optional[str] = Field(default=None, description="Correlation ID for tracking")

    @field_validator('script')
    def validate_script(cls, v):
        if not v.strip():
            raise ValueError("Script path cannot be empty")
        return v


class TickParams(BaseModel):
    """Parameters for tick tool."""

    model_config = ConfigDict(extra='forbid')

    execution_id: str = Field(description="ID of execution to tick")

    @field_validator('execution_id')
    def validate_execution_id(cls, v):
        if not v.strip():
            raise ValueError("Execution ID cannot be empty")
        return v


class RunUntilIdleParams(BaseModel):
    """Parameters for run_until_idle tool."""

    model_config = ConfigDict(extra='forbid')

    execution_id: str = Field(description="ID of execution to run")
    max_frames: Optional[int] = Field(default=100, ge=1, le=1000, description="Maximum frames before stopping")

    @field_validator('execution_id')
    def validate_execution_id(cls, v):
        if not v.strip():
            raise ValueError("Execution ID cannot be empty")
        return v


class StopParams(BaseModel):
    """Parameters for stop tool."""

    model_config = ConfigDict(extra='forbid')

    execution_id: str = Field(description="ID of execution to stop")
    reason: Optional[str] = Field(default=None, description="Reason for stopping")

    @field_validator('execution_id')
    def validate_execution_id(cls, v):
        if not v.strip():
            raise ValueError("Execution ID cannot be empty")
        return v


class PauseResumeParams(BaseModel):
    """Parameters for pause/resume tools."""

    model_config = ConfigDict(extra='forbid')

    execution_id: str = Field(description="ID of execution to pause/resume")

    @field_validator('execution_id')
    def validate_execution_id(cls, v):
        if not v.strip():
            raise ValueError("Execution ID cannot be empty")
        return v


class SetStateParams(BaseModel):
    """Parameters for set_state tool."""

    model_config = ConfigDict(extra='forbid')

    execution_id: str = Field(description="ID of execution")
    key: str = Field(description="State key to set")
    value: Any = Field(description="Value to set")
    trigger: str = Field(description="Trigger source for audit")

    @field_validator('execution_id')
    def validate_execution_id(cls, v):
        if not v.strip():
            raise ValueError("Execution ID cannot be empty")
        return v

    @field_validator('key')
    def validate_key(cls, v):
        if not v.strip():
            raise ValueError("State key cannot be empty")
        return v

    @field_validator('trigger')
    def validate_trigger(cls, v):
        if not v.strip():
            raise ValueError("Trigger source cannot be empty")
        return v


class RestartFromFrameParams(BaseModel):
    """Parameters for restart_from_frame tool."""

    model_config = ConfigDict(extra='forbid')

    execution_id: str = Field(description="ID of execution to restart")
    frame_index: int = Field(ge=0, description="Frame index to restart from")

    @field_validator('execution_id')
    def validate_execution_id(cls, v):
        if not v.strip():
            raise ValueError("Execution ID cannot be empty")
        return v


class GetFrameParams(BaseModel):
    """Parameters for get_frame tool."""

    model_config = ConfigDict(extra='forbid')

    execution_id: str = Field(description="ID of execution")
    frame_index: int = Field(ge=0, description="Frame index to retrieve")

    @field_validator('execution_id')
    def validate_execution_id(cls, v):
        if not v.strip():
            raise ValueError("Execution ID cannot be empty")
        return v


# Response models
class ExecutionSummary(BaseModel):
    """Summary of execution state."""

    model_config = ConfigDict(extra='forbid')

    execution_id: str
    status: Literal["pending", "running", "paused", "completed", "failed", "cancelled"]
    name: Optional[str] = None
    source_file: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    error: Optional[str] = None
    current_frame: int = 0
    tags: List[str] = field(default_factory=list)


class StateChangeResult(BaseModel):
    """Result of state change operation."""

    model_config = ConfigDict(extra='forbid')

    key: str
    old_value: Any = None
    new_value: Any
    trigger: str
    timestamp: str


class FrameData(BaseModel):
    """Frame data for get_frame response."""

    model_config = ConfigDict(extra='forbid')

    frame_index: int
    execution_id: str
    xml_content: str
    timestamp: str


@dataclass
class ExecutionContext:
    """Context for a running execution."""

    execution_id: str
    db: SmithersDB
    tick_loop: TickLoop
    volatile_state: VolatileStore
    status: str = "running"
    paused: bool = False
    stop_requested: bool = False
    stop_reason: Optional[str] = None
    task: Optional[asyncio.Task] = None
    loop: Optional[asyncio.AbstractEventLoop] = None


class MCPToolProvider:
    """Provider for MCP tools managing smithers executions."""

    def __init__(self, db_path: Optional[str] = None):
        """Initialize MCP tool provider.

        Args:
            db_path: Path to SQLite database. If None, uses in-memory database.
        """
        self.db_path = db_path or ":memory:"
        self._executions: Dict[str, ExecutionContext] = {}
        self._lock = threading.Lock()

        # Background event loop for async operations
        self._loop_thread = threading.Thread(target=self._run_event_loop, daemon=True)
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._loop_ready = threading.Event()
        self._loop_thread.start()
        self._loop_ready.wait()

    def _run_event_loop(self):
        """Run the background event loop."""
        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)
        self._loop_ready.set()
        self._loop.run_forever()

    def _run_async(self, coro):
        """Run async coroutine in background loop and wait for result."""
        if not self._loop:
            raise RuntimeError("Event loop not initialized")

        future = asyncio.run_coroutine_threadsafe(coro, self._loop)
        return future.result()

    def start_execution(self, params: StartExecutionParams) -> ExecutionSummary:
        """Start a new execution.

        Args:
            params: Start execution parameters

        Returns:
            ExecutionSummary with execution details

        Raises:
            FileNotFoundError: If script file not found
            SmithersError: For other execution errors
        """
        script_path = Path(params.script)
        if not script_path.exists():
            raise FileNotFoundError(f"Script file not found: {script_path}")

        with self._lock:
            # Check idempotency key
            if params.idempotency_key:
                for exec_id, ctx in self._executions.items():
                    # In a real implementation, we'd store idempotency keys in DB
                    pass

            # Create execution ID
            execution_id = str(os.urandom(8).hex())

            # Create database and stores
            db = SmithersDB(self.db_path)

            # Initialize volatile state
            volatile_state = VolatileStore()

            # Load and compile script
            try:
                with open(script_path, 'r') as f:
                    script_content = f.read()

                # In a real implementation, we'd compile the script to a component
                # For now, create a dummy component
                def app_component(ctx: Context):
                    from smithers_py.nodes import Text
                    return Text(f"Execution {execution_id} running")

                # Create tick loop
                tick_loop = TickLoop(
                    db=db,
                    volatile_state=volatile_state,
                    app_component=app_component,
                    execution_id=execution_id
                )

                # Start execution in database
                execution_module = ExecutionModule(db.connection)
                self._run_async(execution_module.start(
                    name=params.name or script_path.stem,
                    source_file=str(script_path),
                    config=params.config.model_dump() if params.config else None,
                    execution_id=execution_id
                ))

                # Create execution context
                ctx = ExecutionContext(
                    execution_id=execution_id,
                    db=db,
                    tick_loop=tick_loop,
                    volatile_state=volatile_state,
                    loop=self._loop
                )

                self._executions[execution_id] = ctx

                # Store tags if provided
                if params.tags:
                    db.connection.execute(
                        "UPDATE executions SET config = json_set(config, '$.tags', json(?)) WHERE id = ?",
                        (json.dumps(params.tags), execution_id)
                    )
                    db.connection.commit()

                return ExecutionSummary(
                    execution_id=execution_id,
                    status="running",
                    name=params.name or script_path.stem,
                    source_file=str(script_path),
                    started_at=datetime.now().isoformat(),
                    tags=params.tags
                )

            except Exception as e:
                logger.error(f"Failed to start execution: {e}")
                raise SmithersError(f"Failed to start execution: {str(e)}")

    def tick(self, params: TickParams) -> ExecutionSummary:
        """Run a single tick for execution.

        Args:
            params: Tick parameters

        Returns:
            ExecutionSummary with updated state

        Raises:
            ValueError: If execution not found
            SmithersError: For execution errors
        """
        with self._lock:
            if params.execution_id not in self._executions:
                raise ValueError(f"Execution not found: {params.execution_id}")

            ctx = self._executions[params.execution_id]

            if ctx.status != "running" or ctx.paused:
                raise SmithersError(f"Execution not in running state: {ctx.status}")

            try:
                # Run single frame
                async def run_tick():
                    await ctx.tick_loop._run_single_frame()

                self._run_async(run_tick())

                return self._get_execution_summary(ctx)

            except Exception as e:
                logger.error(f"Tick failed: {e}")
                raise SmithersError(f"Tick failed: {str(e)}")

    def run_until_idle(self, params: RunUntilIdleParams) -> ExecutionSummary:
        """Run execution until it reaches idle state.

        Args:
            params: Run until idle parameters

        Returns:
            ExecutionSummary with final state

        Raises:
            ValueError: If execution not found
            SmithersError: For execution errors
        """
        with self._lock:
            if params.execution_id not in self._executions:
                raise ValueError(f"Execution not found: {params.execution_id}")

            ctx = self._executions[params.execution_id]

            if ctx.status != "running" or ctx.paused:
                raise SmithersError(f"Execution not in running state: {ctx.status}")

            try:
                # Run until idle
                async def run_loop():
                    frames_run = 0
                    while frames_run < (params.max_frames or 100):
                        if ctx.stop_requested or ctx.paused:
                            break

                        # Check if any tasks running or state pending
                        if not ctx.tick_loop.running_tasks:
                            # Check for pending state writes
                            has_pending = False
                            # In a real implementation, check state stores for pending writes

                            if not has_pending:
                                break  # Reached idle state

                        await ctx.tick_loop._run_single_frame()
                        frames_run += 1

                    return frames_run

                frames = self._run_async(run_loop())
                logger.info(f"Execution {params.execution_id} ran {frames} frames")

                return self._get_execution_summary(ctx)

            except Exception as e:
                logger.error(f"Run until idle failed: {e}")
                raise SmithersError(f"Run until idle failed: {str(e)}")

    def stop(self, params: StopParams) -> ExecutionSummary:
        """Gracefully stop execution.

        Args:
            params: Stop parameters

        Returns:
            ExecutionSummary with stopped state

        Raises:
            ValueError: If execution not found
        """
        with self._lock:
            if params.execution_id not in self._executions:
                raise ValueError(f"Execution not found: {params.execution_id}")

            ctx = self._executions[params.execution_id]
            ctx.stop_requested = True
            ctx.stop_reason = params.reason
            ctx.status = "stopped"

            # Update database
            try:
                execution_module = ExecutionModule(ctx.db.connection)
                self._run_async(execution_module.complete(params.execution_id, {
                    "stopped": True,
                    "reason": params.reason
                }))
            except Exception as e:
                logger.error(f"Failed to update execution status: {e}")

            return self._get_execution_summary(ctx)

    def pause(self, params: PauseResumeParams) -> ExecutionSummary:
        """Pause execution after current node.

        Args:
            params: Pause parameters

        Returns:
            ExecutionSummary with paused state

        Raises:
            ValueError: If execution not found
            SmithersError: If not in running state
        """
        with self._lock:
            if params.execution_id not in self._executions:
                raise ValueError(f"Execution not found: {params.execution_id}")

            ctx = self._executions[params.execution_id]

            if ctx.status != "running":
                raise SmithersError(f"Cannot pause execution in state: {ctx.status}")

            ctx.paused = True
            ctx.status = "paused"

            return self._get_execution_summary(ctx)

    def resume(self, params: PauseResumeParams) -> ExecutionSummary:
        """Resume paused execution.

        Args:
            params: Resume parameters

        Returns:
            ExecutionSummary with running state

        Raises:
            ValueError: If execution not found
            SmithersError: If not in paused state
        """
        with self._lock:
            if params.execution_id not in self._executions:
                raise ValueError(f"Execution not found: {params.execution_id}")

            ctx = self._executions[params.execution_id]

            if ctx.status != "paused":
                raise SmithersError(f"Cannot resume execution in state: {ctx.status}")

            ctx.paused = False
            ctx.status = "running"

            return self._get_execution_summary(ctx)

    def set_state(self, params: SetStateParams) -> StateChangeResult:
        """Set state key/value in execution.

        Args:
            params: Set state parameters

        Returns:
            StateChangeResult with old and new values

        Raises:
            ValueError: If execution not found
            SmithersError: For state update errors
        """
        with self._lock:
            if params.execution_id not in self._executions:
                raise ValueError(f"Execution not found: {params.execution_id}")

            ctx = self._executions[params.execution_id]

            try:
                # Get old value
                old_value = self._run_async(
                    ctx.tick_loop.sqlite_state.get(params.key)
                )

                # Set new value
                self._run_async(
                    ctx.tick_loop.sqlite_state.set(
                        params.key,
                        params.value,
                        params.trigger
                    )
                )

                return StateChangeResult(
                    key=params.key,
                    old_value=old_value,
                    new_value=params.value,
                    trigger=params.trigger,
                    timestamp=datetime.now().isoformat()
                )

            except Exception as e:
                logger.error(f"State update failed: {e}")
                raise SmithersError(f"State update failed: {str(e)}")

    def restart_from_frame(self, params: RestartFromFrameParams) -> ExecutionSummary:
        """Restart execution from a specific frame.

        Args:
            params: Restart from frame parameters

        Returns:
            ExecutionSummary for new execution branch

        Raises:
            ValueError: If execution or frame not found
            SmithersError: For restart errors
        """
        with self._lock:
            if params.execution_id not in self._executions:
                raise ValueError(f"Execution not found: {params.execution_id}")

            ctx = self._executions[params.execution_id]

            try:
                # Get frame data
                cursor = ctx.db.connection.execute(
                    """SELECT xml_content, created_at FROM render_frames
                       WHERE execution_id = ? AND sequence_number = ?""",
                    (params.execution_id, params.frame_index)
                )
                row = cursor.fetchone()

                if not row:
                    raise ValueError(f"Frame not found: {params.frame_index}")

                # In a real implementation, we'd:
                # 1. Create new execution branch
                # 2. Restore state from frame
                # 3. Start execution from that point

                # For now, return error
                raise SmithersError("Restart from frame not yet implemented")

            except Exception as e:
                logger.error(f"Restart from frame failed: {e}")
                raise SmithersError(f"Restart from frame failed: {str(e)}")

    def get_frame(self, params: GetFrameParams) -> FrameData:
        """Get frame data by index.

        Args:
            params: Get frame parameters

        Returns:
            FrameData with frame content

        Raises:
            ValueError: If execution or frame not found
        """
        with self._lock:
            if params.execution_id not in self._executions:
                raise ValueError(f"Execution not found: {params.execution_id}")

            ctx = self._executions[params.execution_id]

            cursor = ctx.db.connection.execute(
                """SELECT xml_content, created_at FROM render_frames
                   WHERE execution_id = ? AND sequence_number = ?""",
                (params.execution_id, params.frame_index)
            )
            row = cursor.fetchone()

            if not row:
                raise ValueError(f"Frame not found: {params.frame_index}")

            return FrameData(
                frame_index=params.frame_index,
                execution_id=params.execution_id,
                xml_content=row[0],
                timestamp=row[1]
            )

    def _get_execution_summary(self, ctx: ExecutionContext) -> ExecutionSummary:
        """Get execution summary from context."""
        # Get execution details from database
        cursor = ctx.db.connection.execute(
            """SELECT name, source_file, status, started_at, completed_at, error, config
               FROM executions WHERE id = ?""",
            (ctx.execution_id,)
        )
        row = cursor.fetchone()

        if row:
            config = json.loads(row[6]) if row[6] else {}
            tags = config.get('tags', [])

            return ExecutionSummary(
                execution_id=ctx.execution_id,
                status=ctx.status or row[2],
                name=row[0],
                source_file=row[1],
                started_at=row[3],
                completed_at=row[4],
                error=row[5],
                current_frame=ctx.tick_loop.frame_id,
                tags=tags
            )
        else:
            return ExecutionSummary(
                execution_id=ctx.execution_id,
                status=ctx.status,
                source_file="unknown",
                current_frame=ctx.tick_loop.frame_id
            )

    def cleanup(self):
        """Cleanup resources."""
        with self._lock:
            # Stop all executions
            for exec_id in list(self._executions.keys()):
                try:
                    self.stop(StopParams(execution_id=exec_id, reason="Provider cleanup"))
                except:
                    pass

            self._executions.clear()

        # Stop event loop
        if self._loop:
            self._loop.call_soon_threadsafe(self._loop.stop)
            self._loop_thread.join(timeout=5)


# Tool definitions for MCP
TOOL_DEFINITIONS = [
    {
        "name": "start_execution",
        "description": "Start a new smithers execution",
        "inputSchema": StartExecutionParams.model_json_schema()
    },
    {
        "name": "tick",
        "description": "Run a single tick for an execution",
        "inputSchema": TickParams.model_json_schema()
    },
    {
        "name": "run_until_idle",
        "description": "Run execution until it reaches idle state",
        "inputSchema": RunUntilIdleParams.model_json_schema()
    },
    {
        "name": "stop",
        "description": "Gracefully stop an execution",
        "inputSchema": StopParams.model_json_schema()
    },
    {
        "name": "pause",
        "description": "Pause execution after current node",
        "inputSchema": PauseResumeParams.model_json_schema()
    },
    {
        "name": "resume",
        "description": "Resume a paused execution",
        "inputSchema": PauseResumeParams.model_json_schema()
    },
    {
        "name": "set_state",
        "description": "Set state key/value in execution",
        "inputSchema": SetStateParams.model_json_schema()
    },
    {
        "name": "restart_from_frame",
        "description": "Restart execution from specific frame",
        "inputSchema": RestartFromFrameParams.model_json_schema()
    },
    {
        "name": "get_frame",
        "description": "Get frame data by index",
        "inputSchema": GetFrameParams.model_json_schema()
    }
]