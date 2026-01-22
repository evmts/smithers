"""ExecutionHarness for E2E testing.

Provides controlled environment for testing full orchestration flows
with mocked executors and state inspection.
"""

import asyncio
import tempfile
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, Optional, Union

from smithers_py.db import SmithersDB, create_async_smithers_db, run_migrations
from smithers_py.engine import TickLoop
from smithers_py.engine.frame_storm import FrameStormGuard, FrameStormError
from smithers_py.state import VolatileStore
from smithers_py.executors.base import TaskStatus, AgentResult, StreamEvent


class MockExecutor:
    """Mock executor that simulates Claude responses without API calls.
    
    Configurable response behavior for testing various scenarios.
    Responses can be keyed by node key (partial match) or full node_id.
    """
    
    def __init__(
        self,
        responses: Optional[Dict[str, str]] = None,
        delay: float = 0.01,
        fail_on: Optional[set] = None,
        crash_at_iteration: Optional[int] = None,
        default_response: str = "Test response"
    ):
        self.responses = responses or {}
        self.delay = delay
        self.fail_on = fail_on or set()
        self.crash_at_iteration = crash_at_iteration
        self.default_response = default_response
        self.call_count = 0
        self.calls: list[Dict[str, Any]] = []
        self._node_key_map: Dict[str, str] = {}
    
    def _find_response(self, node_id: str, prompt: str) -> str:
        """Find response matching node_id or prompt keywords."""
        if node_id in self.responses:
            return self.responses[node_id]
        
        for key, response in self.responses.items():
            if key in node_id or key in prompt:
                return response
        
        return self.default_response
    
    def _should_fail(self, node_id: str, prompt: str) -> bool:
        """Check if this node should fail."""
        if node_id in self.fail_on:
            return True
        for fail_key in self.fail_on:
            if fail_key in node_id or fail_key in prompt:
                return True
        return False
    
    async def execute(
        self,
        node_id: str,
        prompt: str,
        model: str,
        execution_id: str,
        max_turns: int = 50,
        **kwargs
    ):
        """Simulate execution yielding stream events and final result."""
        self.call_count += 1
        self.calls.append({
            "node_id": node_id,
            "prompt": prompt,
            "model": model,
            "execution_id": execution_id,
            "iteration": self.call_count
        })
        
        await asyncio.sleep(self.delay)
        
        if self.crash_at_iteration and self.call_count == self.crash_at_iteration:
            raise RuntimeError(f"Simulated crash at iteration {self.call_count}")
        
        if self._should_fail(node_id, prompt):
            yield AgentResult(
                run_id=str(uuid.uuid4()),
                node_id=node_id,
                status=TaskStatus.ERROR,
                model=model,
                started_at=datetime.now(),
                ended_at=datetime.now(),
                error=RuntimeError(f"Simulated failure for {node_id}"),
                error_message=f"Simulated failure for {node_id}",
                error_type="RuntimeError"
            )
            return
        
        response = self._find_response(node_id, prompt)
        
        for token in response.split():
            yield StreamEvent(
                kind="token",
                timestamp=datetime.now(),
                payload={"text": token + " "}
            )
            await asyncio.sleep(0.001)
        
        yield AgentResult(
            run_id=str(uuid.uuid4()),
            node_id=node_id,
            status=TaskStatus.DONE,
            model=model,
            started_at=datetime.now(),
            ended_at=datetime.now(),
            output_text=response
        )


class ExecutionHarness:
    """Test harness for E2E orchestration testing.
    
    Provides:
    - start(script): Start execution of a script/component
    - wait_for_state(key, value): Wait for state condition
    - wait_for_status(status): Wait for execution status
    - force_kill(): Simulate crash
    - resume(exec_id): Resume after crash
    - db: Database access for assertions
    """
    
    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path
        self.db: Optional[SmithersDB] = None
        self.tick_loop: Optional[TickLoop] = None
        self.volatile_state: Optional[VolatileStore] = None
        self.execution_id: Optional[str] = None
        self._run_task: Optional[asyncio.Task] = None
        self._temp_fd: Optional[int] = None
        self._temp_path: Optional[str] = None
        self.test_model: Optional[MockExecutor] = None
        self.frame_storm_guard: Optional[FrameStormGuard] = None
    
    async def setup(self) -> "ExecutionHarness":
        """Initialize database and state stores."""
        import tempfile
        import os
        
        if self.db_path is None:
            self._temp_fd, self._temp_path = tempfile.mkstemp(suffix='.db')
            os.close(self._temp_fd)
            self.db_path = self._temp_path
        
        self.db = SmithersDB(self.db_path, is_async=False)
        await self.db.connect()
        await run_migrations(self.db.connection)
        
        self.volatile_state = VolatileStore()
        self.test_model = MockExecutor()
        self.frame_storm_guard = FrameStormGuard(
            max_frames_per_second=10,
            max_frames_per_run=100,
            max_frames_per_minute=50,
            loop_detection_window=3
        )
        
        return self
    
    async def teardown(self) -> None:
        """Clean up resources."""
        if self._run_task and not self._run_task.done():
            self._run_task.cancel()
            try:
                await self._run_task
            except asyncio.CancelledError:
                pass
        
        if self.db:
            await self.db.close()
        
        if self._temp_path:
            Path(self._temp_path).unlink(missing_ok=True)
    
    async def start(
        self,
        app_component: Callable,
        test_model: Optional[MockExecutor] = None,
        execution_id: Optional[str] = None,
        run_in_background: bool = False
    ) -> str:
        """Start execution of an app component.
        
        Args:
            app_component: The render function (ctx) -> Node
            test_model: Optional custom TestModel executor
            execution_id: Optional execution ID (generated if not provided)
            run_in_background: If True, run tick loop in background task
            
        Returns:
            Execution ID
        """
        if test_model:
            self.test_model = test_model
        
        self.execution_id = execution_id or str(uuid.uuid4())
        
        await self.db.execution.start(
            name="e2e_test",
            source_file="e2e_test.py",
            config={"test": True},
            execution_id=self.execution_id
        )
        
        self.tick_loop = TickLoop(
            db=self.db,
            volatile_state=self.volatile_state,
            app_component=app_component,
            execution_id=self.execution_id
        )
        self.tick_loop.claude_executor = self.test_model
        self.tick_loop.min_frame_interval = 0.01
        
        if run_in_background:
            self._run_task = asyncio.create_task(self.tick_loop.run())
        else:
            await self.tick_loop.run()
        
        return self.execution_id
    
    async def run_frames(self, count: int = 1) -> None:
        """Run a specific number of frames."""
        for _ in range(count):
            await self.tick_loop._run_single_frame()
            await asyncio.sleep(0.02)
    
    async def wait_for_state(
        self,
        key: str,
        value: Any,
        timeout: float = 5.0,
        poll_interval: float = 0.05,
        run_frames: bool = True
    ) -> bool:
        """Wait for volatile state to reach expected value.
        
        Args:
            key: State key to check
            value: Expected value
            timeout: Maximum time to wait
            poll_interval: Time between checks
            run_frames: If True, run frames while waiting
            
        Returns:
            True if value matched, False if timeout
        """
        start = asyncio.get_event_loop().time()
        
        while asyncio.get_event_loop().time() - start < timeout:
            current = self.volatile_state.get(key)
            if current == value:
                return True
            
            if run_frames and self.tick_loop:
                try:
                    await self.tick_loop._run_single_frame()
                except Exception:
                    pass
            
            await asyncio.sleep(poll_interval)
        
        return False
    
    async def wait_for_status(
        self,
        status: str,
        timeout: float = 5.0,
        poll_interval: float = 0.05
    ) -> bool:
        """Wait for execution to reach a status.
        
        Args:
            status: Expected status ("running", "completed", "failed")
            timeout: Maximum time to wait
            poll_interval: Time between checks
            
        Returns:
            True if status reached, False if timeout
        """
        start = asyncio.get_event_loop().time()
        
        while asyncio.get_event_loop().time() - start < timeout:
            result = await self.db.connection.execute(
                "SELECT status FROM executions WHERE id = ?",
                (self.execution_id,)
            )
            row = await result.fetchone()
            if row and row[0] == status:
                return True
            await asyncio.sleep(poll_interval)
        
        return False
    
    async def wait_for_quiescence(self, timeout: float = 5.0) -> bool:
        """Wait for tick loop to reach quiescence."""
        if not self.tick_loop:
            return False
        
        start = asyncio.get_event_loop().time()
        
        while asyncio.get_event_loop().time() - start < timeout:
            if self.tick_loop._is_quiescent():
                return True
            await asyncio.sleep(0.05)
        
        return False
    
    def force_kill(self) -> None:
        """Simulate crash by cancelling execution."""
        if self._run_task and not self._run_task.done():
            self._run_task.cancel()
        
        self.tick_loop = None
    
    async def resume(
        self,
        app_component: Callable,
        exec_id: Optional[str] = None
    ) -> str:
        """Resume execution after crash.
        
        Args:
            app_component: The render function
            exec_id: Execution ID to resume (uses last if not provided)
            
        Returns:
            Execution ID
        """
        exec_id = exec_id or self.execution_id
        
        cursor = self.db.connection.execute(
            "SELECT COALESCE(MAX(sequence_number), -1) + 1 FROM render_frames WHERE execution_id = ?",
            (exec_id,)
        )
        row = cursor.fetchone()
        start_frame_id = row[0] if row else 0
        
        self.tick_loop = TickLoop(
            db=self.db,
            volatile_state=self.volatile_state,
            app_component=app_component,
            execution_id=exec_id
        )
        self.tick_loop.frame_id = start_frame_id
        self.tick_loop.claude_executor = self.test_model
        self.tick_loop.min_frame_interval = 0.01
        
        await self.tick_loop.run()
        
        return exec_id
    
    def get_state(self, key: str) -> Any:
        """Get current volatile state value."""
        return self.volatile_state.get(key)
    
    def set_state(self, key: str, value: Any, trigger: str = "test") -> None:
        """Set volatile state value."""
        self.volatile_state.set(key, value, trigger)
        self.volatile_state.commit()
    
    @property
    def frame_count(self) -> int:
        """Get current frame count."""
        return self.tick_loop.frame_id if self.tick_loop else 0
    
    @property
    def is_quiescent(self) -> bool:
        """Check if tick loop is quiescent."""
        return self.tick_loop._is_quiescent() if self.tick_loop else True
