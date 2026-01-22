"""E2E tests for multi-step workflows.

Tests:
- Multi-step workflow with state dependencies executes in correct order
"""

import pytest
import pytest_asyncio
import asyncio

from smithers_py.nodes import TextNode, ClaudeNode, PhaseNode, IfNode
from smithers_py.engine.tick_loop import Context

from .harness import ExecutionHarness, TestModel


@pytest.mark.asyncio
class TestMultiStepWorkflow:
    """Test multi-step workflow execution."""
    
    async def test_sequential_steps(self, harness: ExecutionHarness):
        """Multi-step workflow with state dependencies executes in correct order."""
        
        step_order = []
        
        async def step1_done(result, ctx):
            step_order.append("step1")
            ctx.v.set("step1_result", result.output_text)
            ctx.v.set("current_step", 2)
        
        async def step2_done(result, ctx):
            step_order.append("step2")
            ctx.v.set("step2_result", result.output_text)
            ctx.v.set("current_step", 3)
        
        async def step3_done(result, ctx):
            step_order.append("step3")
            ctx.v.set("step3_result", result.output_text)
            ctx.v.set("current_step", 4)
        
        def workflow_app(ctx: Context):
            current = ctx.v.get("current_step", 1)
            
            if current == 1:
                return ClaudeNode(
                    key="step1",
                    prompt="Execute step 1",
                    model="test",
                    on_finished=step1_done
                )
            elif current == 2:
                step1_result = ctx.v.get("step1_result")
                return ClaudeNode(
                    key="step2",
                    prompt=f"Execute step 2 with {step1_result}",
                    model="test",
                    on_finished=step2_done
                )
            elif current == 3:
                step2_result = ctx.v.get("step2_result")
                return ClaudeNode(
                    key="step3",
                    prompt=f"Execute step 3 with {step2_result}",
                    model="test",
                    on_finished=step3_done
                )
            else:
                return TextNode(text="Workflow complete")
        
        model = TestModel(responses={
            "step 1": "Result from step 1",
            "step 2": "Result from step 2",
            "step 3": "Result from step 3"
        })
        
        await harness.start(workflow_app, test_model=model)
        
        assert harness.is_quiescent
        assert step_order == ["step1", "step2", "step3"]
        assert harness.get_state("current_step") == 4
        assert harness.get_state("step1_result") == "Result from step 1"
        assert harness.get_state("step2_result") == "Result from step 2"
        assert harness.get_state("step3_result") == "Result from step 3"
    
    async def test_conditional_branches(self, harness: ExecutionHarness):
        """Workflow with conditional branches takes correct path."""
        
        path_taken = []
        
        async def analyze_done(result, ctx):
            path_taken.append("analyze")
            ctx.v.set("analysis_result", "needs_fix")
            ctx.v.set("analysis_done", True)
        
        async def fix_done(result, ctx):
            path_taken.append("fix")
            ctx.v.set("fix_done", True)
        
        async def deploy_done(result, ctx):
            path_taken.append("deploy")
            ctx.v.set("deploy_done", True)
        
        def branching_app(ctx: Context):
            analysis_done = ctx.v.get("analysis_done", False)
            analysis_result = ctx.v.get("analysis_result")
            fix_done_flag = ctx.v.get("fix_done", False)
            deploy_done_flag = ctx.v.get("deploy_done", False)
            
            if not analysis_done:
                return ClaudeNode(
                    key="analyze",
                    prompt="Analyze the code",
                    model="test",
                    on_finished=analyze_done
                )
            elif analysis_result == "needs_fix" and not fix_done_flag:
                return ClaudeNode(
                    key="fix",
                    prompt="Fix the issues",
                    model="test",
                    on_finished=fix_done
                )
            elif not deploy_done_flag:
                return ClaudeNode(
                    key="deploy",
                    prompt="Deploy the code",
                    model="test",
                    on_finished=deploy_done
                )
            else:
                return TextNode(text="Done")
        
        await harness.start(branching_app)
        
        assert harness.is_quiescent
        assert path_taken == ["analyze", "fix", "deploy"]
    
    async def test_parallel_agents_in_phase(self, harness: ExecutionHarness):
        """Multiple agents in same phase can run (mounted in same frame)."""
        
        completed_agents = set()
        
        async def agent_done(result, ctx):
            completed_agents.add(result.node_id)
            current = ctx.v.get("completed_count", 0)
            ctx.v.set("completed_count", current + 1)
            
            if current + 1 >= 3:
                ctx.v.set("all_done", True)
        
        def parallel_app(ctx: Context):
            all_done = ctx.v.get("all_done", False)
            
            if not all_done:
                return PhaseNode(
                    key="parallel_phase",
                    name="Parallel Work",
                    children=[
                        ClaudeNode(
                            key="agent_a",
                            prompt="Task A",
                            model="test",
                            on_finished=agent_done
                        ),
                        ClaudeNode(
                            key="agent_b",
                            prompt="Task B",
                            model="test",
                            on_finished=agent_done
                        ),
                        ClaudeNode(
                            key="agent_c",
                            prompt="Task C",
                            model="test",
                            on_finished=agent_done
                        )
                    ]
                )
            else:
                return TextNode(text="All agents completed")
        
        await harness.start(parallel_app)
        
        assert harness.is_quiescent
        assert harness.get_state("all_done") is True
        assert harness.get_state("completed_count") == 3
    
    async def test_loop_with_counter(self, harness: ExecutionHarness):
        """While-loop style workflow with counter terminates correctly."""
        
        iteration_count = 0
        
        async def iteration_done(result, ctx):
            nonlocal iteration_count
            iteration_count += 1
            current = ctx.v.get("iteration", 0)
            ctx.v.set("iteration", current + 1)
        
        def loop_app(ctx: Context):
            iteration = ctx.v.get("iteration", 0)
            
            if iteration < 5:
                return ClaudeNode(
                    key=f"iter_{iteration}",
                    prompt=f"Iteration {iteration}",
                    model="test",
                    on_finished=iteration_done
                )
            else:
                return TextNode(text="Loop complete")
        
        await harness.start(loop_app)
        
        assert harness.is_quiescent
        assert iteration_count == 5
        assert harness.get_state("iteration") == 5
