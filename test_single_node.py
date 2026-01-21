#!/usr/bin/env python3
"""Test single node creation."""

try:
    from smithers_py.nodes import TextNode
    node = TextNode(text="Hello")
    print(f"✓ TextNode created successfully: {node.text}")
    print(f"  Type: {node.type}")
    print(f"  Children: {node.children}")
except Exception as e:
    print(f"✗ Failed to create TextNode: {e}")
    import traceback
    traceback.print_exc()

try:
    from smithers_py.nodes import IfNode
    node = IfNode(condition=True)
    print(f"✓ IfNode created successfully: condition={node.condition}")
except Exception as e:
    print(f"✗ Failed to create IfNode: {e}")
    import traceback
    traceback.print_exc()

try:
    from smithers_py.nodes import ClaudeNode
    node = ClaudeNode(model="sonnet", prompt="Test")
    print(f"✓ ClaudeNode created successfully: model={node.model}")

    # Test serialization
    data = node.model_dump()
    print(f"  Serialized keys: {list(data.keys())}")
except Exception as e:
    print(f"✗ Failed to create ClaudeNode: {e}")
    import traceback
    traceback.print_exc()