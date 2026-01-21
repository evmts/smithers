#!/usr/bin/env python3
"""Quick test of M0-Plan-IR implementation."""

import json
from smithers_py.nodes import (
    Node, TextNode, IfNode, PhaseNode, StepNode,
    ClaudeNode, EffectNode, WhileNode, RalphNode
)
from pydantic import TypeAdapter

def test_basic_nodes():
    """Test basic node creation."""
    print("Testing basic node creation...")

    # Create simple nodes
    text = TextNode(text="Hello, World!")
    assert text.type == "text"
    print("✓ TextNode created")

    if_node = IfNode(condition=True)
    assert if_node.type == "if"
    print("✓ IfNode created")

    phase = PhaseNode(name="implementation")
    assert phase.type == "phase"
    print("✓ PhaseNode created")

    claude = ClaudeNode(model="sonnet", prompt="Fix the tests")
    assert claude.type == "claude"
    print("✓ ClaudeNode created")

    effect = EffectNode(id="test-effect", deps=["phase"])
    assert effect.type == "effect"
    print("✓ EffectNode created")

def test_complex_structure():
    """Test complex nested structure."""
    print("\nTesting complex structure...")

    # Build a workflow
    workflow = PhaseNode(
        name="test-fix",
        children=[
            StepNode(
                name="analyze",
                children=[
                    ClaudeNode(model="haiku", prompt="Analyze failing tests"),
                    EffectNode(id="log-analysis", deps=["analysis_result"])
                ]
            ),
            StepNode(
                name="fix",
                children=[
                    RalphNode(
                        id="fix-loop",
                        max_iterations=5,
                        children=[
                            ClaudeNode(model="sonnet", prompt="Fix test failures"),
                            IfNode(
                                condition=True,
                                children=[TextNode(text="Tests passing!")]
                            )
                        ]
                    )
                ]
            )
        ]
    )

    # Serialize
    data = workflow.model_dump()
    assert data["type"] == "phase"
    assert len(data["children"]) == 2
    print("✓ Complex structure created and serialized")

    # JSON round trip
    json_str = workflow.model_dump_json(indent=2)
    parsed = json.loads(json_str)
    print("✓ JSON serialization successful")

    return json_str

def test_discriminated_union():
    """Test discriminated union parsing."""
    print("\nTesting discriminated union...")

    adapter = TypeAdapter(Node)

    # Test different node types
    nodes_data = [
        {"type": "text", "text": "Hello"},
        {"type": "if", "condition": False},
        {"type": "phase", "name": "test"},
        {"type": "claude", "model": "haiku", "prompt": "Test"},
        {"type": "effect", "id": "test-effect", "deps": []}
    ]

    for data in nodes_data:
        node = adapter.validate_python(data)
        assert node.type == data["type"]
        print(f"✓ Parsed {data['type']} node via union")

def test_handlers_excluded():
    """Test that handlers are excluded from serialization."""
    print("\nTesting handler exclusion...")

    def on_finished(result):
        print(f"Finished: {result}")

    claude = ClaudeNode(
        model="sonnet",
        prompt="Test",
        on_finished=on_finished
    )

    # Handler should be accessible
    assert claude.on_finished is on_finished
    print("✓ Handler accessible at runtime")

    # But excluded from serialization
    data = claude.model_dump()
    assert "on_finished" not in data
    assert "handlers" not in data
    print("✓ Handler excluded from serialization")

def main():
    """Run all tests."""
    print("M0-Plan-IR Implementation Test")
    print("=" * 40)

    try:
        test_basic_nodes()
        json_output = test_complex_structure()
        test_discriminated_union()
        test_handlers_excluded()

        print("\n" + "=" * 40)
        print("✅ All tests passed!")
        print("\nExample serialized workflow:")
        print(json_output)

    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        return 1

    return 0

if __name__ == "__main__":
    exit(main())