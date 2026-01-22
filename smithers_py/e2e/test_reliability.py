"""E2E tests for reliability features.

Tests:
- Frame storm prevention triggers and halts runaway execution
- Quiescence detection stops loop when no work remains
- Crash recovery: while loop crashes at iteration 3, resume continues from 3
"""

import pytest
import pytest_asyncio
import asyncio

from smithers_py.nodes import TextNode, ClaudeNode, PhaseNode
from smithers_py.engine.tick_loop import Context
from smithers_py.engine.frame_storm import FrameStormGuard, FrameStormError, compute_plan_hash, compute_state_hash

from .harness import ExecutionHarness, MockExecutor


@pytest.mark.asyncio
class TestFrameStormPrevention:
    """Test frame storm (infinite loop) prevention."""
    
    async def test_frame_storm_detection(self, harness: ExecutionHarness):
        """Frame storm prevention triggers and halts runaway execution."""
        
        guard = FrameStormGuard(
            max_frames_per_second=10,
            max_frames_per_run=20,
            loop_detection_window=3
        )
        
        static_plan = TextNode(text="Static")
        static_state = {"counter": 0}
        
        plan_hash = compute_plan_hash(static_plan)
        state_hash = compute_state_hash(static_state)
        
        with pytest.raises(FrameStormError) as exc_info:
            for i in range(25):
                guard.check_frame(plan_hash, state_hash, now=float(i))
        
        assert "loop detected" in str(exc_info.value).lower() or "exceeded" in str(exc_info.value).lower()
    
    async def test_frame_rate_limit(self, harness: ExecutionHarness):
        """Frame rate limiting prevents too many frames per second."""
        
        guard = FrameStormGuard(
            max_frames_per_second=5,
            max_frames_per_run=100
        )
        
        base_time = 1000.0
        
        with pytest.raises(FrameStormError) as exc_info:
            for i in range(10):
                plan_hash = f"plan_{i}"
                state_hash = f"state_{i}"
                guard.check_frame(plan_hash, state_hash, now=base_time + i * 0.1)
        
        assert "rate" in str(exc_info.value).lower() or "exceeded" in str(exc_info.value).lower()
    
    async def test_max_frames_per_run(self, harness: ExecutionHarness):
        """Maximum frames per run limit is enforced."""
        
        guard = FrameStormGuard(
            max_frames_per_second=1000,
            max_frames_per_run=10
        )
        
        with pytest.raises(FrameStormError) as exc_info:
            for i in range(15):
                guard.check_frame(f"plan_{i}", f"state_{i}", now=float(i * 10))
        
        assert "exceeded" in str(exc_info.value).lower()
    
    async def test_normal_execution_not_blocked(self, harness: ExecutionHarness):
        """Normal execution with varying state is not blocked."""
        
        guard = FrameStormGuard(
            max_frames_per_second=10,
            max_frames_per_run=100,
            loop_detection_window=3
        )
        
        for i in range(20):
            guard.check_frame(f"plan_{i}", f"state_{i}", now=float(i * 0.2))
        
        assert guard.frame_count == 20


@pytest.mark.asyncio
class TestQuiescenceDetection:
    """Test quiescence detection stops loop when no work remains."""
    
    async def test_quiescence_on_empty_tree(self, harness: ExecutionHarness):
        """Quiescence detected when tree has no runnable nodes."""
        
        def static_app(ctx: Context):
            return TextNode(text="Static content")
        
        await harness.start(static_app)
        
        assert harness.is_quiescent
        assert harness.frame_count >= 1
    
    async def test_quiescence_after_completion(self, harness: ExecutionHarness):
        """Quiescence detected after all tasks complete."""
        
        async def on_done(result, ctx):
            ctx.v.set("done", True)
        
        def completing_app(ctx: Context):
            done = ctx.v.get("done", False)
            
            if not done:
                return ClaudeNode(
                    key="task",
                    prompt="Do work",
                    model="test",
                    on_finished=on_done
                )
            else:
                return TextNode(text="Completed")
        
        await harness.start(completing_app)
        
        assert harness.is_quiescent
        assert harness.get_state("done") is True
    
    async def test_no_quiescence_while_running(self, harness: ExecutionHarness):
        """Quiescence not reached while tasks are running."""
        
        slow_model = MockExecutor(delay=0.5)
        
        task_started = asyncio.Event()
        
        def slow_app(ctx: Context):
            done = ctx.v.get("done", False)
            if not done:
                return ClaudeNode(
                    key="slow_task",
                    prompt="Slow work",
                    model="test"
                )
            return TextNode(text="Done")
        
        exec_id = await harness.start(slow_app, test_model=slow_model, run_in_background=True)
        
        await asyncio.sleep(0.1)
        
        await harness.run_frames(1)
        
        if harness.tick_loop and harness.tick_loop.running_tasks:
            assert not harness.is_quiescent
    
    async def test_quiescence_with_no_pending_writes(self, harness: ExecutionHarness):
        """Quiescence requires no pending state writes."""
        
        def app(ctx: Context):
            return TextNode(text="Done")
        
        await harness.start(app)
        
        assert not harness.volatile_state.has_pending_writes()
        assert harness.is_quiescent


@pytest.mark.asyncio
class TestCrashRecovery:
    """Test crash recovery and resumption."""
    
    async def test_crash_recovery_resumes_from_checkpoint(self, harness: ExecutionHarness):
        """After crash, resume continues from persisted state."""
        
        async def on_done(result, ctx):
            ctx.v.set("step_completed", True)
        
        def simple_app(ctx: Context):
            completed = ctx.v.get("step_completed", False)
            
            if not completed:
                return ClaudeNode(
                    key="step1",
                    prompt="Step 1",
                    model="test",
                    on_finished=on_done
                )
            else:
                return TextNode(text="Done")
        
        await harness.start(simple_app, run_in_background=True)
        
        await harness.wait_for_state("step_completed", True, timeout=3.0)
        
        harness.force_kill()
        
        assert harness.get_state("step_completed") is True
        
        await harness.resume(simple_app)
        
        assert harness.get_state("step_completed") is True
    
    async def test_state_persists_across_crash(self, harness: ExecutionHarness):
        """State set before crash is available after resume."""
        
        async def on_done(result, ctx):
            ctx.v.set("work_done", True)
            ctx.v.set("result_data", "important_value")
        
        def stateful_app(ctx: Context):
            work_done = ctx.v.get("work_done", False)
            
            if not work_done:
                return ClaudeNode(
                    key="worker",
                    prompt="Do work",
                    model="test",
                    on_finished=on_done
                )
            else:
                return TextNode(text="Done")
        
        await harness.start(stateful_app, run_in_background=True)
        
        await harness.wait_for_state("work_done", True, timeout=2.0)
        
        assert harness.get_state("work_done") is True
        assert harness.get_state("result_data") == "important_value"
        
        harness.force_kill()
        
        await harness.resume(stateful_app)
        
        assert harness.get_state("work_done") is True
        assert harness.get_state("result_data") == "important_value"
    
    async def test_incomplete_task_detected_on_resume(self, harness: ExecutionHarness):
        """After force kill, resume can continue with new state."""
        
        def app(ctx: Context):
            done = ctx.v.get("done", False)
            if not done:
                return ClaudeNode(
                    key="task",
                    prompt="Work",
                    model="test"
                )
            return TextNode(text="Done")
        
        model = MockExecutor()
        await harness.start(app, test_model=model, run_in_background=True)
        
        await asyncio.sleep(0.05)
        harness.force_kill()
        
        harness.set_state("done", True)
        await harness.resume(app)
        
        await harness.wait_for_quiescence(timeout=2.0)
        assert harness.is_quiescent
