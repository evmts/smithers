"""E2E tests for CLI script execution.

Tests:
- Minimal script produces correct DB state and exits cleanly
"""

import pytest
import pytest_asyncio
import asyncio

from smithers_py.nodes import TextNode, ClaudeNode, PhaseNode
from smithers_py.engine.tick_loop import Context

from .harness import ExecutionHarness, TestModel


@pytest.mark.asyncio
class TestCLIExecution:
    """Test CLI execution flows."""
    
    async def test_minimal_script_execution(self, harness: ExecutionHarness):
        """CLI executes minimal script, produces correct DB state, exits cleanly."""
        
        render_count = 0
        
        def minimal_app(ctx: Context):
            nonlocal render_count
            render_count += 1
            return TextNode(text=f"Render {render_count}")
        
        exec_id = await harness.start(minimal_app)
        
        assert exec_id is not None
        assert harness.is_quiescent
        assert render_count >= 1
    
    async def test_script_with_claude_node(self, harness: ExecutionHarness):
        """Script with ClaudeNode executes and completes."""
        
        results_received = []
        
        async def on_finished(result, ctx):
            results_received.append(result.output_text)
            ctx.v.set("completed", True)
        
        def app_with_claude(ctx: Context):
            completed = ctx.v.get("completed", False)
            
            if not completed:
                return ClaudeNode(
                    key="test_claude",
                    prompt="Hello world",
                    model="test",
                    on_finished=on_finished
                )
            else:
                return TextNode(text="Done")
        
        test_model = TestModel(responses={"Hello world": "Hello from test model"})
        await harness.start(app_with_claude, test_model=test_model)
        
        assert harness.is_quiescent
        assert harness.get_state("completed") is True
        assert len(results_received) == 1
        assert results_received[0] == "Hello from test model"
    
    async def test_script_with_multiple_phases(self, harness: ExecutionHarness):
        """Script with multiple phases executes in order."""
        
        phase_order = []
        
        async def phase1_done(result, ctx):
            phase_order.append("phase1")
            ctx.v.set("phase1_done", True)
        
        async def phase2_done(result, ctx):
            phase_order.append("phase2")
            ctx.v.set("phase2_done", True)
        
        def multi_phase_app(ctx: Context):
            phase1_done_flag = ctx.v.get("phase1_done", False)
            phase2_done_flag = ctx.v.get("phase2_done", False)
            
            if not phase1_done_flag:
                return PhaseNode(
                    key="phase1",
                    name="Phase 1",
                    children=[
                        ClaudeNode(
                            key="p1_agent",
                            prompt="Phase 1 work",
                            model="test",
                            on_finished=phase1_done
                        )
                    ]
                )
            elif not phase2_done_flag:
                return PhaseNode(
                    key="phase2",
                    name="Phase 2",
                    children=[
                        ClaudeNode(
                            key="p2_agent",
                            prompt="Phase 2 work",
                            model="test",
                            on_finished=phase2_done
                        )
                    ]
                )
            else:
                return TextNode(text="All phases complete")
        
        await harness.start(multi_phase_app)
        
        assert harness.is_quiescent
        assert phase_order == ["phase1", "phase2"]
        assert harness.get_state("phase1_done") is True
        assert harness.get_state("phase2_done") is True
    
    async def test_script_error_handling(self, harness: ExecutionHarness):
        """Script handles agent errors gracefully."""
        
        errors_caught = []
        
        async def on_error(error, ctx):
            errors_caught.append(str(error))
            ctx.v.set("error_handled", True)
        
        def app_with_error(ctx: Context):
            handled = ctx.v.get("error_handled", False)
            
            if not handled:
                return ClaudeNode(
                    key="failing_node",
                    prompt="This will fail",
                    model="test",
                    on_error=on_error
                )
            else:
                return TextNode(text="Error handled")
        
        failing_model = TestModel(fail_on={"failing_node"})
        await harness.start(app_with_error, test_model=failing_model)
        
        assert harness.is_quiescent
        assert harness.get_state("error_handled") is True
        assert len(errors_caught) == 1
