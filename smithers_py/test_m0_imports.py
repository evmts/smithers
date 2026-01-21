#!/usr/bin/env python3
"""Test imports for M0 Package Structure."""

import sys
import traceback

def test_imports():
    """Test all imports from smithers_py.nodes."""
    print("Testing M0 Package Structure imports...")

    errors = []

    # Test base imports
    try:
        from smithers_py.nodes import NodeBase, NodeHandlers, NodeMeta
        print("✓ Base classes imported successfully")
    except Exception as e:
        errors.append(f"Failed to import base classes: {e}")
        traceback.print_exc()

    # Test node types
    node_types = [
        "TextNode", "IfNode", "PhaseNode", "StepNode", "RalphNode",
        "WhileNode", "FragmentNode", "EachNode", "StopNode", "EndNode",
        "ClaudeNode", "EffectNode", "ToolPolicy"
    ]

    for node_type in node_types:
        try:
            exec(f"from smithers_py.nodes import {node_type}")
            print(f"✓ {node_type} imported successfully")
        except Exception as e:
            errors.append(f"Failed to import {node_type}: {e}")
            traceback.print_exc()

    # Test union type
    try:
        from smithers_py.nodes import Node
        print("✓ Node union type imported successfully")
    except Exception as e:
        errors.append(f"Failed to import Node union: {e}")
        traceback.print_exc()

    # Test creating instances
    try:
        from smithers_py.nodes import TextNode, IfNode, ClaudeNode

        text = TextNode(text="Hello")
        print(f"✓ Created TextNode: {text.text}")

        if_node = IfNode(condition=True)
        print(f"✓ Created IfNode: condition={if_node.condition}")

        claude = ClaudeNode(model="sonnet", prompt="Test")
        print(f"✓ Created ClaudeNode: model={claude.model}")

    except Exception as e:
        errors.append(f"Failed to create node instances: {e}")
        traceback.print_exc()

    # Summary
    print(f"\n{'='*50}")
    if errors:
        print(f"❌ {len(errors)} errors found:")
        for error in errors:
            print(f"  - {error}")
        return False
    else:
        print("✅ All imports successful! M0 package structure is valid.")
        return True

if __name__ == "__main__":
    success = test_imports()
    sys.exit(0 if success else 1)