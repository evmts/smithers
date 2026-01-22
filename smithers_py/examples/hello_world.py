#!/usr/bin/env python3
"""
Simple Hello World Smithers Example

This demonstrates the basic structure of a Smithers orchestration.
"""

from smithers_py import component, PhaseNode, ClaudeNode, TextNode


@component
def app(ctx):
    """Main app component that renders a simple phase with Claude."""
    return PhaseNode(
        name="hello",
        children=[
            ClaudeNode(
                model="sonnet",
                prompt="Say hello world and explain what Smithers is.",
                max_turns=1,
            )
        ]
    )
