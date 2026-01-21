#!/usr/bin/env python3
"""Minimal JSX runtime test focusing on potential issues."""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def test_normalize_children():
    from smithers_py.jsx_runtime import _normalize_children
    from smithers_py.nodes import TextNode

    # Test None
    assert _normalize_children(None) == []

    # Test string
    result = _normalize_children("hello")
    assert len(result) == 1
    assert isinstance(result[0], TextNode)
    assert result[0].text == "hello"

    # Test nested lists
    result = _normalize_children([["a", ["b", "c"]], "d"])
    assert len(result) == 4
    assert all(isinstance(n, TextNode) for n in result)
    assert [n.text for n in result] == ["a", "b", "c", "d"]

    print("✓ _normalize_children tests passed")

def test_extract_event_handlers():
    from smithers_py.jsx_runtime import _extract_event_handlers

    # Test extraction
    props = {
        "name": "test",
        "on_finished": lambda: None,
        "on_error": lambda: None,
        "other": "value"
    }
    handlers = _extract_event_handlers(props)

    assert "on_finished" in handlers
    assert "on_error" in handlers
    assert "on_finished" not in props  # Should be removed
    assert "on_error" not in props     # Should be removed
    assert props["name"] == "test"     # Should remain
    assert props["other"] == "value"   # Should remain

    print("✓ _extract_event_handlers tests passed")

def test_validate_event_props():
    from smithers_py.jsx_runtime import _validate_event_props, OBSERVABLE_NODES
    from smithers_py.nodes import PhaseNode, ClaudeNode
    from smithers_py.errors import EventValidationError

    # Test non-observable node
    try:
        _validate_event_props(PhaseNode, {"name": "test", "on_finished": lambda: None})
        assert False, "Should have raised EventValidationError"
    except EventValidationError as e:
        assert "PhaseNode" in str(e)
        assert "on_finished" in str(e)

    # Test observable node (should not raise)
    _validate_event_props(ClaudeNode, {"on_finished": lambda: None})

    print("✓ _validate_event_props tests passed")

def test_jsx_basic():
    from smithers_py.jsx_runtime import jsx
    from smithers_py.nodes import PhaseNode

    # Test basic creation
    node = jsx("phase", {"name": "test"})
    assert isinstance(node, PhaseNode)
    assert node.name == "test"
    assert node.children == []

    print("✓ jsx basic tests passed")

def test_jsx_with_children():
    from smithers_py.jsx_runtime import jsx

    # Test with string children
    node = jsx("phase", {"name": "test"}, "hello", "world")
    assert len(node.children) == 2
    assert node.children[0].text == "hello"
    assert node.children[1].text == "world"

    print("✓ jsx with children tests passed")

def test_fragment():
    from smithers_py.jsx_runtime import Fragment
    from smithers_py.nodes import TextNode

    # Test Fragment
    result = Fragment(["a", "b", TextNode(text="c")])
    assert len(result) == 3
    assert result[0].text == "a"
    assert result[1].text == "b"
    assert result[2].text == "c"

    print("✓ Fragment tests passed")

def test_component_function():
    from smithers_py.jsx_runtime import jsx
    from smithers_py.nodes import PhaseNode

    def MyComponent(children, **props):
        return PhaseNode(name=props.get("name", "default"), children=children)

    node = jsx(MyComponent, {"name": "custom"}, "child")
    assert isinstance(node, PhaseNode)
    assert node.name == "custom"
    assert len(node.children) == 1
    assert node.children[0].text == "child"

    print("✓ Component function tests passed")

def test_invalid_jsx_type():
    from smithers_py.jsx_runtime import jsx

    try:
        jsx(123, {})
        assert False, "Should have raised TypeError"
    except TypeError as e:
        assert "Invalid JSX type: 123" in str(e)

    print("✓ Invalid JSX type test passed")

def test_unknown_intrinsic():
    from smithers_py.jsx_runtime import jsx

    try:
        jsx("unknown", {})
        assert False, "Should have raised ValueError"
    except ValueError as e:
        assert "Unknown intrinsic element: 'unknown'" in str(e)

    print("✓ Unknown intrinsic test passed")

def main():
    """Run all tests."""
    tests = [
        test_normalize_children,
        test_extract_event_handlers,
        test_validate_event_props,
        test_jsx_basic,
        test_jsx_with_children,
        test_fragment,
        test_component_function,
        test_invalid_jsx_type,
        test_unknown_intrinsic,
    ]

    for test in tests:
        try:
            test()
        except Exception as e:
            print(f"✗ {test.__name__} failed: {e}")
            import traceback
            traceback.print_exc()
            return 1

    print("\n✅ All tests passed!")
    return 0

if __name__ == "__main__":
    sys.exit(main())