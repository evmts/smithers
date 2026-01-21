#!/usr/bin/env python3
"""Simple test to verify JSX runtime imports and basic functionality."""

import sys
sys.path.insert(0, '.')

try:
    # Test imports
    from smithers_py.jsx_runtime import jsx, Fragment, INTRINSICS, OBSERVABLE_NODES, EVENT_PROPS
    from smithers_py.nodes import TextNode, PhaseNode, StepNode, ClaudeNode, SmithersNode
    print("✓ All imports successful")

    # Test basic jsx call
    phase = jsx("phase", {"name": "test"})
    print(f"✓ Created phase node: {phase.name}")

    # Test children normalization
    phase_with_children = jsx("phase", {"name": "parent"}, "Hello", "World")
    print(f"✓ Phase with {len(phase_with_children.children)} text children")

    # Test Fragment
    frag_result = Fragment(["a", "b", "c"])
    print(f"✓ Fragment returned {len(frag_result)} nodes")

    # Test event validation - should work
    claude = jsx("claude", {
        "model": "sonnet",
        "prompt": "test",
        "on_finished": lambda x: None
    })
    print("✓ Created claude node with event handler")

    # Test event validation - should fail
    try:
        jsx("phase", {"name": "test", "on_finished": lambda x: None})
        print("✗ ERROR: Event validation should have failed!")
        sys.exit(1)
    except Exception as e:
        print(f"✓ Event validation correctly rejected: {type(e).__name__}")

    print("\n✅ All basic tests passed!")

except Exception as e:
    print(f"\n❌ Test failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)