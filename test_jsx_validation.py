#!/usr/bin/env python3
"""Test JSX runtime validation changes."""

import sys
sys.path.insert(0, '.')

from smithers_py.jsx_runtime import jsx
from smithers_py.nodes import ClaudeNode, PhaseNode
from smithers_py.errors import EventValidationError

def test_event_validation():
    """Test the updated event validation logic."""

    # Test 1: Generic event props on non-observable nodes should fail
    print("Test 1: Generic event props on non-observable nodes...")
    try:
        jsx("phase", {"name": "test", "onComplete": lambda: None})
        print("❌ FAILED: Should have raised EventValidationError")
        return False
    except EventValidationError as e:
        print(f"✓ Correctly rejected: {e}")

    # Test 2: Non-event props should work
    print("\nTest 2: Non-event props on all nodes...")
    try:
        jsx("phase", {"name": "test", "onclick": lambda: None})  # lowercase 'c'
        jsx("step", {"name": "test", "on_click": lambda: None})  # underscore
        print("✓ Non-event props accepted")
    except Exception as e:
        print(f"❌ FAILED: {e}")
        return False

    # Test 3: Generic event props on observable nodes should work
    print("\nTest 3: Generic event props on observable nodes...")
    try:
        node = jsx("claude", {
            "model": "sonnet",
            "prompt": "test",
            "onSuccess": lambda x: print("success"),
            "onCustom": lambda x: print("custom"),
            "on_finished": lambda x: print("finished")  # traditional style
        })
        # Check handlers were set
        assert hasattr(node.handlers, 'onSuccess')
        assert hasattr(node.handlers, 'onCustom')
        assert hasattr(node.handlers, 'on_finished')
        print("✓ All event handlers accepted on observable node")
    except Exception as e:
        print(f"❌ FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False

    # Test 4: Handler access
    print("\nTest 4: Handler access...")
    try:
        node = jsx("smithers", {
            "prompt": "test",
            "onDone": lambda: print("done")
        })
        # Access via attribute
        assert node.handlers.onDone is not None
        assert callable(node.handlers.onDone)
        # Access non-existent handler
        assert node.handlers.onMissing is None
        print("✓ Handler access works correctly")
    except Exception as e:
        print(f"❌ FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False

    return True

if __name__ == "__main__":
    print("Testing JSX runtime event validation...\n")
    success = test_event_validation()
    if success:
        print("\n✅ All validation tests passed!")
        sys.exit(0)
    else:
        print("\n❌ Some tests failed!")
        sys.exit(1)