#!/usr/bin/env python3
"""
Multi-Phase Smithers Example

Demonstrates a three-phase workflow: Research -> Implement -> Test
"""

from smithers_py import component, RalphNode, PhaseNode, ClaudeNode


@component
def app(ctx):
    """Multi-phase workflow with Research, Implement, and Test phases."""
    phase = ctx.state.get("phase", "research")
    
    return RalphNode(
        max_iterations=3,
        children=[
            PhaseNode(
                name="research",
                children=[
                    ClaudeNode(
                        model="sonnet",
                        prompt="Research best practices for Python testing.",
                        max_turns=2,
                    )
                ] if phase == "research" else []
            ),
            PhaseNode(
                name="implement",
                children=[
                    ClaudeNode(
                        model="sonnet",
                        prompt="Implement a simple test suite based on research.",
                        max_turns=3,
                    )
                ] if phase == "implement" else []
            ),
            PhaseNode(
                name="test",
                children=[
                    ClaudeNode(
                        model="sonnet",
                        prompt="Run and verify the test suite.",
                        max_turns=2,
                    )
                ] if phase == "test" else []
            ),
        ]
    )
