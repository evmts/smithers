"""
Comprehensive tests for M0-Tick-Loop implementation.

Tests all 7 phases of the tick loop and various edge cases:
- State snapshot isolation
- Render phase purity
- Reconciliation logic
- Frame persistence
- Task execution
- Event handling
- State update flushing
- Error handling
"""

import asyncio
import tempfile
import os
import uuid
from pathlib import Path
from datetime import datetime
from typing import Optional

import pytest

from smithers_py.db.database import SmithersDB
from smithers_py.db.migrations import run_migrations
from smithers_py.state.volatile import VolatileStore
from smithers_py.state.base import StoreTarget, WriteOp
from smithers_py.nodes.structural import IfNode, PhaseNode
from smithers_py.nodes.text import TextNode
from smithers_py.nodes.runnable import ClaudeNode
from smithers_py.engine.tick_loop import TickLoop, Context
# No EventHandler import needed - handlers are just callables
from smithers_py.executors.base import TaskStatus, AgentResult, StreamEvent


class TestTickLoopComprehensive:
    """Comprehensive tests for M0-Tick-Loop."""

    @pytest.fixture
    async def setup_test_db(self):
        """Create a temporary database for testing."""
        temp_fd, temp_path = tempfile.mkstemp(suffix='.db')
        os.close(temp_fd)

        try:
            db = SmithersDB(temp_path, is_async=True)
            await db.connect()
            await run_migrations(db.connection)

            execution_id = str(uuid.uuid4())
            await db.execution.start(
                name="test_tick_loop_comprehensive",
                source_file="test_tick_loop_comprehensive.py",
                config={"test": True}
            )

            yield db, execution_id

        finally:
            await db.close()
            Path(temp_path).unlink(missing_ok=True)

    async def test_phase1_state_snapshot_isolation(self, setup_test_db):
        """Test Phase 1: State snapshots are truly isolated."""
        db, execution_id = setup_test_db

        # Create stores with test data
        volatile_state = VolatileStore()
        volatile_state.set('test_value', 100)
        volatile_state.set('list_value', [1, 2, 3])
        volatile_state.set('dict_value', {'a': 1, 'b': 2})
        volatile_state.commit()

        # Track render calls to verify isolation
        render_calls = []

        def test_app(ctx: Context):
            # Capture original values
            original_test = ctx.v.get('test_value')
            original_list = ctx.v.get('list_value')
            original_dict = ctx.v.get('dict_value')

            render_calls.append({
                'test_value': original_test,
                'list_value': original_list.copy() if original_list else None,
                'dict_value': original_dict.copy() if original_dict else None
            })

            # Try to mutate snapshot (should fail or have no effect)
            try:
                ctx.v['test_value'] = 999  # Should fail
            except (TypeError, AttributeError):
                pass  # Expected - snapshot is immutable

            # For mutable values, mutations shouldn't affect store
            if original_list:
                original_list.append(4)  # Modify the reference
            if original_dict:
                original_dict['c'] = 3  # Modify the reference

            return TextNode(text=f"Value: {original_test}")

        # Create tick loop and run frame
        tick_loop = TickLoop(db, volatile_state, test_app, execution_id)
        await tick_loop._run_single_frame()

        # Verify store values are unchanged
        assert volatile_state.get('test_value') == 100
        assert volatile_state.get('list_value') == [1, 2, 3]
        assert volatile_state.get('dict_value') == {'a': 1, 'b': 2}

        # Verify render saw correct values
        assert len(render_calls) == 1
        assert render_calls[0]['test_value'] == 100

    async def test_phase2_render_purity_enforcement(self, setup_test_db):
        """Test Phase 2: Render phase enforces purity (no side effects)."""
        db, execution_id = setup_test_db

        violations = []

        def impure_app(ctx: Context):
            # Try various side effects that should be prevented

            # 1. Try to write to volatile state during render
            try:
                ctx.v['new_key'] = 'should_fail'
                violations.append('volatile_write_allowed')
            except:
                pass  # Expected

            # 2. Try to write to sqlite state during render
            try:
                ctx.state['new_key'] = 'should_fail'
                violations.append('sqlite_write_allowed')
            except:
                pass  # Expected

            # 3. Try to start async task during render (not applicable for M0)
            # M0 doesn't prevent this since tasks are only started in execute phase

            return TextNode(text="Purity test")

        volatile_state = VolatileStore()
        tick_loop = TickLoop(db, volatile_state, impure_app, execution_id)

        await tick_loop._run_single_frame()

        # No violations should have occurred
        assert len(violations) == 0, f"Render purity violations: {violations}"

    async def test_phase3_reconciliation_logic(self, setup_test_db):
        """Test Phase 3: Reconciliation correctly identifies mounted/unmounted nodes."""
        db, execution_id = setup_test_db

        volatile_state = VolatileStore()
        volatile_state.set('render_count', 0)
        volatile_state.commit()

        # Track reconciliation results
        reconcile_results = []

        class TestTickLoop(TickLoop):
            async def _phase3_reconcile(self, current_tree):
                result = await super()._phase3_reconcile(current_tree)
                reconcile_results.append(result)
                return result

        def dynamic_app(ctx: Context):
            count = ctx.v.get('render_count', 0)

            # Different trees based on render count
            if count == 0:
                # First render: just a text node
                return TextNode(text="Initial")
            elif count == 1:
                # Second render: add a Claude node
                return PhaseNode(
                    key="phase1",
                    name="test",
                    children=[
                        ClaudeNode(
                            key="claude1",
                            prompt="Test prompt",
                            model="sonnet"
                        )
                    ]
                )
            else:
                # Third render: remove Claude node, add different one
                return PhaseNode(
                    key="phase1",
                    name="test",
                    children=[
                        ClaudeNode(
                            key="claude2",  # Different key
                            prompt="Different prompt",
                            model="haiku"
                        )
                    ]
                )

        tick_loop = TestTickLoop(db, volatile_state, dynamic_app, execution_id)

        # First frame
        await tick_loop._run_single_frame()
        assert len(reconcile_results) == 1
        assert reconcile_results[0]['mounted'] == []  # No runnable nodes
        assert reconcile_results[0]['unmounted'] == []
        assert reconcile_results[0]['tree_changed'] == True  # First render

        # Second frame - mount claude1
        volatile_state.set('render_count', 1)
        volatile_state.commit()
        await tick_loop._run_single_frame()

        assert len(reconcile_results) == 2
        assert len(reconcile_results[1]['mounted']) == 1
        assert reconcile_results[1]['mounted'][0].key == "claude1"
        assert reconcile_results[1]['unmounted'] == []

        # Third frame - unmount claude1, mount claude2
        volatile_state.set('render_count', 2)
        volatile_state.commit()
        await tick_loop._run_single_frame()

        assert len(reconcile_results) == 3
        assert len(reconcile_results[2]['mounted']) == 1
        assert reconcile_results[2]['mounted'][0].key == "claude2"
        assert len(reconcile_results[2]['unmounted']) == 1
        assert reconcile_results[2]['unmounted'][0].key == "claude1"

    async def test_phase4_frame_persistence(self, setup_test_db):
        """Test Phase 4: Frames are correctly persisted to SQLite."""
        db, execution_id = setup_test_db

        def static_app(ctx: Context):
            return PhaseNode(
                key="test_phase",
                name="persistence_test",
                children=[
                    TextNode(text="Frame content"),
                    IfNode(
                        key="conditional",
                        condition=True,
                        children=[TextNode(text="Visible")]
                    )
                ]
            )

        volatile_state = VolatileStore()
        tick_loop = TickLoop(db, volatile_state, static_app, execution_id)

        # Run single frame
        await tick_loop._run_single_frame()

        # Verify frame was saved
        frames = await db.frames.list(execution_id)
        assert len(frames) == 1

        frame = frames[0]
        assert frame['execution_id'] == execution_id
        assert frame['sequence_number'] == 0

        # Verify XML content structure
        xml = frame['xml_content']
        assert '<phase key="test_phase"' in xml
        assert 'name="persistence_test"' in xml
        assert '<text>Frame content</text>' in xml
        assert '<if key="conditional" condition="True">' in xml
        assert '<text>Visible</text>' in xml

    async def test_phase4_frame_coalescing(self, setup_test_db):
        """Test Phase 4: Identical frames are coalesced (not duplicated)."""
        db, execution_id = setup_test_db

        def static_app(ctx: Context):
            # Always returns same tree
            return TextNode(text="Static content")

        volatile_state = VolatileStore()
        tick_loop = TickLoop(db, volatile_state, static_app, execution_id)

        # Run multiple frames
        for _ in range(3):
            await tick_loop._run_single_frame()
            # Small delay to ensure different timestamps
            await asyncio.sleep(0.01)

        # Should only have one frame due to coalescing
        frames = await db.frames.list(execution_id)
        assert len(frames) == 1, "Identical frames should be coalesced"

    async def test_phase5_task_execution(self, setup_test_db):
        """Test Phase 5: Tasks are started for newly mounted runnable nodes."""
        db, execution_id = setup_test_db

        # Track task executions
        executed_nodes = []

        # Mock ClaudeExecutor to track executions
        class MockClaudeExecutor:
            def __init__(self, db):
                self.db = db

            async def execute(self, node_id, prompt, model, execution_id, max_turns):
                executed_nodes.append({
                    'node_id': node_id,
                    'prompt': prompt,
                    'model': model
                })

                # Simulate execution
                yield StreamEvent(
                    kind="token",
                    timestamp=datetime.now(),
                    payload={"text": "Test "}
                )
                yield StreamEvent(
                    kind="token",
                    timestamp=datetime.now(),
                    payload={"text": "response"}
                )

                # Return result
                yield AgentResult(
                    run_id=str(uuid.uuid4()),
                    node_id=node_id,
                    status=TaskStatus.SUCCESS,
                    model=model,
                    started_at=datetime.now(),
                    ended_at=datetime.now(),
                    output="Test response"
                )

        def app_with_claude(ctx: Context):
            return ClaudeNode(
                key="test_claude",
                prompt="Test prompt for execution",
                model="sonnet"
            )

        volatile_state = VolatileStore()
        tick_loop = TickLoop(db, volatile_state, app_with_claude, execution_id)

        # Replace executor with mock
        tick_loop.claude_executor = MockClaudeExecutor(db)

        # Run frame to mount and execute
        await tick_loop._run_single_frame()

        # Wait briefly for async execution
        await asyncio.sleep(0.1)

        # Verify execution started
        assert len(executed_nodes) == 1
        assert executed_nodes[0]['node_id'] == 'test_claude'
        assert executed_nodes[0]['prompt'] == "Test prompt for execution"
        assert executed_nodes[0]['model'] == "sonnet"

        # Verify task tracking
        assert 'test_claude' in tick_loop.running_tasks

    async def test_phase5_event_handler_execution(self, setup_test_db):
        """Test Phase 5: Event handlers fire when tasks complete."""
        db, execution_id = setup_test_db

        # Track event handler calls
        handler_calls = []
        state_changes_requested = []

        # Create event handler function
        async def test_event_handler(result):
            handler_calls.append({
                'node_id': 'claude_with_handler',
                'status': result.status,
                'output': result.output
            })

            # Handler sets state directly (not through return value)
            volatile_state.set("task_completed", True, f"completed_claude_with_handler")
            state_changes_requested.append("task_completed")

        # App with Claude node and event handler
        def app_with_events(ctx: Context):
            completed = ctx.v.get('task_completed', False)

            return PhaseNode(
                key="phase",
                name="test",
                children=[
                    ClaudeNode(
                        key="claude_with_handler",
                        prompt="Test",
                        model="haiku",
                        on_finished=test_event_handler
                    ),
                    TextNode(text=f"Completed: {completed}")
                ]
            )

        volatile_state = VolatileStore()
        tick_loop = TickLoop(db, volatile_state, app_with_events, execution_id)

        # Mock executor for immediate completion
        class ImmediateExecutor:
            async def execute(self, node_id, prompt, model, execution_id, max_turns):
                yield AgentResult(
                    run_id=str(uuid.uuid4()),
                    node_id=node_id,
                    status=TaskStatus.SUCCESS,
                    model=model,
                    started_at=datetime.now(),
                    ended_at=datetime.now(),
                    output="Immediate result"
                )

        tick_loop.claude_executor = ImmediateExecutor()

        # First frame: mount and start execution
        await tick_loop._run_single_frame()

        # Second frame: task should complete and handler should fire
        await tick_loop._run_single_frame()

        # Verify handler was called
        assert len(handler_calls) == 1
        assert handler_calls[0]['node_id'] == 'claude_with_handler'
        assert handler_calls[0]['status'] == TaskStatus.SUCCESS

        # Verify state was updated
        assert volatile_state.get('task_completed') == True

    async def test_phase7_state_flush(self, setup_test_db):
        """Test Phase 7: Queued state updates are flushed atomically."""
        db, execution_id = setup_test_db

        # Track flushes
        flush_count = 0

        class TrackingVolatileStore(VolatileStore):
            def commit(self):
                nonlocal flush_count
                flush_count += 1
                super().commit()

        def app_with_state_writes(ctx: Context):
            # This app doesn't directly write, but event handlers will
            return TextNode(text="State flush test")

        volatile_state = TrackingVolatileStore()
        tick_loop = TickLoop(db, volatile_state, app_with_state_writes, execution_id)

        # Add pending write
        volatile_state.set('test_key', 'test_value', 'test_trigger')

        # Run frame - should flush pending writes
        await tick_loop._run_single_frame()

        # Verify flush occurred
        assert flush_count == 1
        assert not volatile_state.has_pending_writes()

    async def test_quiescence_detection(self, setup_test_db):
        """Test that tick loop correctly detects quiescence."""
        db, execution_id = setup_test_db

        frame_count = 0

        def counting_app(ctx: Context):
            nonlocal frame_count
            frame_count += 1

            # Only show Claude node on first frame
            if frame_count == 1:
                return ClaudeNode(
                    key="one_time_claude",
                    prompt="Run once",
                    model="haiku"
                )
            else:
                return TextNode(text="Done")

        volatile_state = VolatileStore()
        tick_loop = TickLoop(db, volatile_state, counting_app, execution_id)

        # Mock executor that completes quickly
        class QuickExecutor:
            async def execute(self, node_id, prompt, model, execution_id, max_turns):
                yield AgentResult(
                    run_id=str(uuid.uuid4()),
                    node_id=node_id,
                    status=TaskStatus.SUCCESS,
                    model=model,
                    started_at=datetime.now(),
                    ended_at=datetime.now(),
                    output="Quick result"
                )

        tick_loop.claude_executor = QuickExecutor()
        tick_loop.min_frame_interval = 0.01  # Speed up for testing

        # Run should complete when quiescent
        await tick_loop.run()

        # Should have run at least 2 frames (mount + complete)
        assert frame_count >= 2

        # Should reach quiescence
        assert tick_loop._is_quiescent()

    async def test_error_handling_in_execution(self, setup_test_db):
        """Test error handling during task execution."""
        db, execution_id = setup_test_db

        error_results = []

        async def error_handler(error):
            error_results.append({
                'node_id': 'error_node',
                'error_type': type(error).__name__,
                'error_message': str(error)
            })

        def app_with_error_handler(ctx: Context):
            return ClaudeNode(
                key="error_node",
                prompt="This will error",
                model="sonnet",
                on_error=error_handler
            )

        volatile_state = VolatileStore()
        tick_loop = TickLoop(db, volatile_state, app_with_error_handler, execution_id)

        # Mock executor that errors
        class ErrorExecutor:
            async def execute(self, node_id, prompt, model, execution_id, max_turns):
                raise RuntimeError("Simulated execution error")

        tick_loop.claude_executor = ErrorExecutor()

        # Run frames
        await tick_loop._run_single_frame()  # Mount and start
        await asyncio.sleep(0.1)  # Let execution fail
        await tick_loop._run_single_frame()  # Process error

        # Verify error was handled
        assert len(error_results) == 1
        assert error_results[0]['node_id'] == 'error_node'
        assert error_results[0]['error_type'] == 'RuntimeError'
        assert 'Simulated execution error' in error_results[0]['error_message']

    async def test_node_progress_callbacks(self, setup_test_db):
        """Test that progress callbacks are invoked during streaming."""
        db, execution_id = setup_test_db

        progress_tokens = []

        def app_with_progress(ctx: Context):
            return ClaudeNode(
                key="progress_node",
                prompt="Stream test",
                model="haiku",
                on_progress=lambda token: progress_tokens.append(token)
            )

        volatile_state = VolatileStore()
        tick_loop = TickLoop(db, volatile_state, app_with_progress, execution_id)

        # Mock streaming executor
        class StreamingExecutor:
            async def execute(self, node_id, prompt, model, execution_id, max_turns):
                tokens = ["Hello", " ", "world", "!"]
                for token in tokens:
                    yield StreamEvent(
                        kind="token",
                        timestamp=datetime.now(),
                        payload={"text": token}
                    )

                yield AgentResult(
                    run_id=str(uuid.uuid4()),
                    node_id=node_id,
                    status=TaskStatus.SUCCESS,
                    model=model,
                    started_at=datetime.now(),
                    ended_at=datetime.now(),
                    output="Hello world!"
                )

        tick_loop.claude_executor = StreamingExecutor()

        # Run to execute
        await tick_loop._run_single_frame()
        await asyncio.sleep(0.1)

        # Verify progress callbacks were called
        assert progress_tokens == ["Hello", " ", "world", "!"]


# Run all tests
if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])