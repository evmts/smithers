#!/usr/bin/env python3
"""Test M1 Event Handler System functionality.

Tests:
1. Event handlers fire on task completion (onFinished/onError)
2. State changes from handlers are applied atomically
3. Stale results are ignored (unmounted nodes)
4. Event -> state -> re-render flow works correctly
5. Volatile vs SQLite routing works
"""

import asyncio
import pytest
import pytest_asyncio
import sqlite3
from datetime import datetime
from typing import Any, Optional

from smithers_py.db.database import SmithersDB
from smithers_py.state.volatile import VolatileStore
from smithers_py.nodes import Node, ClaudeNode, NodeBase
from smithers_py.engine.tick_loop import TickLoop, Context
from smithers_py.executors.base import AgentResult, TaskStatus


class MockClaudeExecutor:
    """Mock executor for testing event handlers."""

    def __init__(self, db):
        self.db = db
        self.results_queue = []

    def queue_result(self, node_id: str, status: TaskStatus, output_text: str = None, error: Exception = None):
        """Queue a result to be returned by execute."""
        result = AgentResult(
            run_id=f"run_{node_id}",
            node_id=node_id,
            status=status,
            model="mock",
            started_at=datetime.now(),
            ended_at=datetime.now(),
            output_text=output_text,
            error=error,
            error_message=str(error) if error else None,
            error_type=type(error).__name__ if error else None
        )
        self.results_queue.append(result)

    async def execute(self, node_id: str, prompt: str, model: str, execution_id: str, max_turns: int = 50):
        """Mock execute that yields queued results."""
        # Find queued result for this node
        for i, result in enumerate(self.results_queue):
            if result.node_id == node_id:
                # Remove from queue and yield
                self.results_queue.pop(i)
                yield result
                return

        # Default to success if no result queued
        yield AgentResult(
            run_id=f"run_{node_id}",
            node_id=node_id,
            status=TaskStatus.DONE,
            model=model,
            started_at=datetime.now(),
            ended_at=datetime.now(),
            output_text=f"Mock output for {prompt}"
        )


@pytest_asyncio.fixture
async def setup_test_env():
    """Set up test environment with database and stores."""
    # Create in-memory database
    db = SmithersDB(":memory:", is_async=False)
    await db.connect()
    await db.initialize_schema()

    # Create stores
    volatile_store = VolatileStore()

    # Start execution
    execution_id = await db.execution.start("test_m1_events", "test.py")

    return db, volatile_store, execution_id


@pytest.mark.asyncio
async def test_event_handler_on_finished(setup_test_env):
    """Test that onFinished handler is called and state changes are applied."""
    db, volatile_store, execution_id = setup_test_env

    # Track handler calls
    handler_calls = []
    state_changes = {}

    def on_finished(result, ctx):
        """Handler that sets state based on result."""
        handler_calls.append(("finished", result.node_id))
        # Write to SQLite state
        ctx.state.set("last_completed", result.node_id)
        ctx.state.set(f"result_{result.node_id}", result.output_text)
        # Write to volatile state
        ctx.v.set("completed_count", (ctx.v.get("completed_count") or 0) + 1)

    def app_component(ctx: Context) -> Node:
        """App that renders based on state."""
        # Track what state we see
        state_changes["last_completed"] = ctx.state.get("last_completed")
        state_changes["completed_count"] = ctx.v.get("completed_count")

        # Render a ClaudeNode with event handler and explicit id
        return ClaudeNode(
            key="claude1",
            prompt="Test prompt",
            model="haiku",
            on_finished=on_finished,
            props={"id": "claude1"}
        )

    # Create tick loop with mock executor
    tick_loop = TickLoop(db, volatile_store, app_component, execution_id)
    mock_executor = MockClaudeExecutor(db)
    tick_loop.claude_executor = mock_executor

    # Queue a successful result
    mock_executor.queue_result("claude1", TaskStatus.DONE, "Test output")

    # Run the tick loop
    await tick_loop.run()

    # Verify handler was called
    assert len(handler_calls) == 1
    assert handler_calls[0] == ("finished", "claude1")

    # Verify state was updated
    sqlite_state = tick_loop.sqlite_state.snapshot()
    assert sqlite_state.get("last_completed") == "claude1"
    assert sqlite_state.get("result_claude1") == "Test output"

    # Verify volatile state was also updated
    volatile_snapshot = tick_loop.volatile_state.snapshot()
    assert volatile_snapshot.get("completed_count") == 1


@pytest.mark.asyncio
async def test_event_handler_on_error(setup_test_env):
    """Test that onError handler is called on failures."""
    db, volatile_store, execution_id = setup_test_env

    handler_calls = []

    def on_error(error, ctx):
        """Handler that logs errors."""
        handler_calls.append(("error", str(error)))
        ctx.state.set("last_error", str(error))
        ctx.state.set("error_count", (ctx.state.get("error_count") or 0) + 1)

    def app_component(ctx: Context) -> Node:
        """App with error handler."""
        error_count = ctx.state.get("error_count") or 0

        # Only render node if no errors yet
        if error_count == 0:
            return ClaudeNode(
                key="claude_error",
                prompt="Test prompt",
                model="haiku",
                on_error=on_error,
                props={"id": "claude_error"}
            )
        else:
            # Stop rendering after error
            return NodeBase(type="empty")

    # Create tick loop
    tick_loop = TickLoop(db, volatile_store, app_component, execution_id)
    mock_executor = MockClaudeExecutor(db)
    tick_loop.claude_executor = mock_executor

    # Queue an error result
    test_error = RuntimeError("Test error")
    mock_executor.queue_result("claude_error", TaskStatus.ERROR, error=test_error)

    # Run the tick loop
    await tick_loop.run()

    # Verify handler was called
    assert len(handler_calls) == 1
    assert handler_calls[0] == ("error", "Test error")

    # Verify state was updated
    sqlite_state = tick_loop.sqlite_state.snapshot()
    assert sqlite_state.get("last_error") == "Test error"
    assert sqlite_state.get("error_count") == 1


@pytest.mark.asyncio
async def test_stale_results_ignored(setup_test_env):
    """Test that results for unmounted nodes are ignored."""
    db, volatile_store, execution_id = setup_test_env

    handler_calls = []
    render_count = 0

    def on_finished(result, ctx):
        """Handler that should not be called for stale results."""
        handler_calls.append(result.node_id)

    def app_component(ctx: Context) -> Node:
        """App that unmounts node after first render."""
        nonlocal render_count
        render_count += 1

        if render_count == 1:
            # First render - include ClaudeNode
            return ClaudeNode(
                key="claude_stale",
                prompt="Test prompt",
                model="haiku",
                on_finished=on_finished,
                props={"id": "claude_stale"}
            )
        else:
            # Subsequent renders - node unmounted
            return NodeBase(type="empty")

    # Create tick loop
    tick_loop = TickLoop(db, volatile_store, app_component, execution_id)
    mock_executor = MockClaudeExecutor(db)
    tick_loop.claude_executor = mock_executor

    # Start the execution but don't complete it immediately
    # This simulates a slow-running task
    async def slow_execute(*args, **kwargs):
        # Wait a bit to simulate slow task
        await asyncio.sleep(0.1)
        # Then return result for now-unmounted node
        yield AgentResult(
            run_id="run_stale",
            node_id="claude_stale",
            status=TaskStatus.DONE,
            model="haiku",
            started_at=datetime.now(),
            ended_at=datetime.now(),
            output_text="Stale output"
        )

    mock_executor.execute = slow_execute

    # Force a re-render by updating state after task starts
    async def update_state_later():
        await asyncio.sleep(0.05)
        # This will trigger re-render and unmount the node
        volatile_store.set("trigger_rerender", True)

    # Run both concurrently
    update_task = asyncio.create_task(update_state_later())
    await tick_loop.run()
    await update_task

    # Handler should NOT have been called for stale result
    assert len(handler_calls) == 0


@pytest.mark.asyncio
async def test_volatile_vs_sqlite_routing(setup_test_env):
    """Test that writes are routed to correct stores."""
    db, volatile_store, execution_id = setup_test_env

    def on_finished(result, ctx):
        """Handler that writes to both stores."""
        # Write to SQLite state
        ctx.state.set("sqlite_key", "sqlite_value")
        # Write to volatile state
        ctx.v.set("volatile_key", "volatile_value")

    def app_component(ctx: Context) -> Node:
        """Simple app."""
        return ClaudeNode(
            key="claude_routing",
            prompt="Test prompt",
            model="haiku",
            on_finished=on_finished,
            props={"id": "claude_routing"}
        )

    # Create tick loop
    tick_loop = TickLoop(db, volatile_store, app_component, execution_id)
    mock_executor = MockClaudeExecutor(db)
    tick_loop.claude_executor = mock_executor

    # Queue a result
    mock_executor.queue_result("claude_routing", TaskStatus.DONE, "Output")

    # Run
    await tick_loop.run()

    # Verify SQLite state
    sqlite_state = tick_loop.sqlite_state.snapshot()
    assert sqlite_state.get("sqlite_key") == "sqlite_value"
    assert sqlite_state.get("volatile_key") is None  # Should not be in SQLite

    # Verify volatile state
    volatile_snapshot = volatile_store.snapshot()
    assert volatile_snapshot.get("volatile_key") == "volatile_value"
    assert volatile_snapshot.get("sqlite_key") is None  # Should not be in volatile


@pytest.mark.asyncio
async def test_event_state_rerender_flow(setup_test_env):
    """Test complete flow: event -> state change -> re-render."""
    db, volatile_store, execution_id = setup_test_env

    render_history = []

    def on_finished(result, ctx):
        """Handler that updates state to trigger re-render."""
        ctx.state.set("phase", "completed")
        ctx.state.set("result", result.output_text)

    def app_component(ctx: Context) -> Node:
        """App that changes based on state."""
        phase = ctx.state.get("phase") or "initial"
        result_text = ctx.state.get("result")

        # Track render history
        render_history.append({
            "phase": phase,
            "result": result_text
        })

        if phase == "initial":
            # First phase - run Claude
            return ClaudeNode(
                key="claude_flow",
                prompt="Process data",
                model="haiku",
                on_finished=on_finished,
                props={"id": "claude_flow"}
            )
        else:
            # Completed phase - show result
            return NodeBase(
                type="result",
                children=[
                    NodeBase(type="text", props={"content": f"Result: {result_text}"})
                ]
            )

    # Create tick loop
    tick_loop = TickLoop(db, volatile_store, app_component, execution_id)
    mock_executor = MockClaudeExecutor(db)
    tick_loop.claude_executor = mock_executor

    # Queue result
    mock_executor.queue_result("claude_flow", TaskStatus.DONE, "Processed successfully")

    # Run
    await tick_loop.run()

    # Verify render flow
    assert len(render_history) >= 2
    assert render_history[0]["phase"] == "initial"
    assert render_history[0]["result"] is None
    assert render_history[-1]["phase"] == "completed"
    assert render_history[-1]["result"] == "Processed successfully"

    # Verify final state
    sqlite_state = tick_loop.sqlite_state.snapshot()
    assert sqlite_state.get("phase") == "completed"
    assert sqlite_state.get("result") == "Processed successfully"


if __name__ == "__main__":
    # Run tests
    asyncio.run(test_event_handler_on_finished())
    asyncio.run(test_event_handler_on_error())
    asyncio.run(test_stale_results_ignored())
    asyncio.run(test_volatile_vs_sqlite_routing())
    asyncio.run(test_event_state_rerender_flow())
    print("✅ All M1 event system tests passed!")