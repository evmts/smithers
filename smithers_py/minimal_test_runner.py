#!/usr/bin/env python3
"""Minimal test runner for node tests."""

import sys
import traceback

# Test imports
print("Testing imports...")
try:
    from smithers_py.nodes import (
        Node, NodeBase, NodeHandlers, NodeMeta,
        TextNode, IfNode, PhaseNode, StepNode, RalphNode,
        WhileNode, FragmentNode, EachNode, StopNode, EndNode,
        ClaudeNode, ToolPolicy, EffectNode
    )
    print("✓ All imports successful")
except Exception as e:
    print(f"✗ Import failed: {e}")
    traceback.print_exc()
    sys.exit(1)

# Test basic node creation
print("\nTesting node creation...")
errors = []

try:
    text = TextNode(text="Hello")
    assert text.type == "text"
    assert text.text == "Hello"
    print("✓ TextNode")
except Exception as e:
    errors.append(f"TextNode: {e}")

try:
    if_node = IfNode(condition=True)
    assert if_node.type == "if"
    assert if_node.condition is True
    print("✓ IfNode")
except Exception as e:
    errors.append(f"IfNode: {e}")

try:
    phase = PhaseNode(name="test")
    assert phase.type == "phase"
    assert phase.name == "test"
    print("✓ PhaseNode")
except Exception as e:
    errors.append(f"PhaseNode: {e}")

try:
    step = StepNode(name="analyze")
    assert step.type == "step"
    assert step.name == "analyze"
    print("✓ StepNode")
except Exception as e:
    errors.append(f"StepNode: {e}")

try:
    ralph = RalphNode(id="loop")
    assert ralph.type == "ralph"
    assert ralph.id == "loop"
    assert ralph.max_iterations == 10
    print("✓ RalphNode")
except Exception as e:
    errors.append(f"RalphNode: {e}")

try:
    while_node = WhileNode(id="test", condition=True)
    assert while_node.type == "while"
    assert while_node.id == "test"
    assert while_node.condition is True
    print("✓ WhileNode")
except Exception as e:
    errors.append(f"WhileNode: {e}")

try:
    frag = FragmentNode()
    assert frag.type == "fragment"
    print("✓ FragmentNode")
except Exception as e:
    errors.append(f"FragmentNode: {e}")

try:
    each = EachNode()
    assert each.type == "each"
    print("✓ EachNode")
except Exception as e:
    errors.append(f"EachNode: {e}")

try:
    stop = StopNode()
    assert stop.type == "stop"
    print("✓ StopNode")
except Exception as e:
    errors.append(f"StopNode: {e}")

try:
    end = EndNode()
    assert end.type == "end"
    print("✓ EndNode")
except Exception as e:
    errors.append(f"EndNode: {e}")

try:
    claude = ClaudeNode(model="sonnet", prompt="Test")
    assert claude.type == "claude"
    assert claude.model == "sonnet"
    assert claude.prompt == "Test"
    print("✓ ClaudeNode")
except Exception as e:
    errors.append(f"ClaudeNode: {e}")
    traceback.print_exc()

try:
    effect = EffectNode(id="test-effect")
    assert effect.type == "effect"
    assert effect.id == "test-effect"
    print("✓ EffectNode")
except Exception as e:
    errors.append(f"EffectNode: {e}")

# Test serialization
print("\nTesting serialization...")
try:
    node = ClaudeNode(model="sonnet", prompt="Test", max_turns=10)
    data = node.model_dump()
    assert data["type"] == "claude"
    assert data["model"] == "sonnet"
    assert data["prompt"] == "Test"
    assert data["max_turns"] == 10
    assert "handlers" not in data  # handlers excluded
    print("✓ ClaudeNode serialization")
except Exception as e:
    errors.append(f"Serialization: {e}")
    traceback.print_exc()

# Test discriminated union
print("\nTesting discriminated union...")
try:
    from pydantic import TypeAdapter
    adapter = TypeAdapter(Node)

    # Test parsing TextNode
    node_data = {"type": "text", "text": "Hello"}
    node = adapter.validate_python(node_data)
    assert isinstance(node, TextNode)
    assert node.text == "Hello"
    print("✓ Union parsing TextNode")

    # Test parsing ClaudeNode
    node_data = {"type": "claude", "model": "sonnet", "prompt": "Test"}
    node = adapter.validate_python(node_data)
    assert isinstance(node, ClaudeNode)
    assert node.model == "sonnet"
    print("✓ Union parsing ClaudeNode")

except Exception as e:
    errors.append(f"Union: {e}")
    traceback.print_exc()

# Summary
print(f"\n{'='*50}")
if errors:
    print(f"❌ {len(errors)} errors found:")
    for error in errors:
        print(f"  - {error}")
else:
    print("✅ All basic tests passed!")

print(f"\nRun 'python3 -m pytest smithers_py/nodes/test_nodes.py -v' for full test suite")