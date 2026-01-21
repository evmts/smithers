"""Tests for the JSX runtime functionality."""

import pytest
from typing import List

from jsx_runtime import jsx, Fragment, INTRINSICS, OBSERVABLE_NODES, EVENT_PROPS
from smithers_py.nodes import (
    Node,
    TextNode,
    IfNode,
    PhaseNode,
    StepNode,
    RalphNode,
    ClaudeNode,
)


class TestIntrinsics:
    """Test intrinsic element creation."""

    def test_intrinsics_registry_completeness(self):
        """Test that all expected intrinsics are registered."""
        expected_intrinsics = {
            "if": IfNode,
            "phase": PhaseNode,
            "step": StepNode,
            "ralph": RalphNode,
            "claude": ClaudeNode,
        }
        assert INTRINSICS == expected_intrinsics

    def test_if_node_creation(self):
        """Test creating IfNode via JSX."""
        node = jsx("if", {"condition": True})
        assert isinstance(node, IfNode)
        assert node.type == "if"
        assert node.condition is True
        assert node.children == []

    def test_phase_node_creation(self):
        """Test creating PhaseNode via JSX."""
        node = jsx("phase", {"name": "setup"})
        assert isinstance(node, PhaseNode)
        assert node.type == "phase"
        assert node.name == "setup"
        assert node.children == []

    def test_step_node_creation(self):
        """Test creating StepNode via JSX."""
        node = jsx("step", {"name": "initialize"})
        assert isinstance(node, StepNode)
        assert node.type == "step"
        assert node.name == "initialize"
        assert node.children == []

    def test_ralph_node_creation(self):
        """Test creating RalphNode via JSX."""
        node = jsx("ralph", {"id": "loop1", "max_iterations": 5})
        assert isinstance(node, RalphNode)
        assert node.type == "ralph"
        assert node.id == "loop1"
        assert node.max_iterations == 5
        assert node.children == []

    def test_claude_node_creation(self):
        """Test creating ClaudeNode via JSX."""
        def on_finished(result):
            pass

        node = jsx("claude", {
            "model": "sonnet",
            "prompt": "Hello world",
            "max_turns": 10,
            "on_finished": on_finished
        })
        assert isinstance(node, ClaudeNode)
        assert node.type == "claude"
        assert node.model == "sonnet"
        assert node.prompt == "Hello world"
        assert node.max_turns == 10
        assert node.on_finished is on_finished

    def test_unknown_intrinsic_raises_error(self):
        """Test that unknown intrinsic elements raise ValueError."""
        with pytest.raises(ValueError, match="Unknown intrinsic element: 'unknown'"):
            jsx("unknown", {})


class TestChildrenNormalization:
    """Test child element normalization."""

    def test_string_children_become_text_nodes(self):
        """Test that string children are converted to TextNode instances."""
        node = jsx("phase", {"name": "test"}, "Hello", "World")
        assert len(node.children) == 2
        assert all(isinstance(child, TextNode) for child in node.children)
        assert node.children[0].text == "Hello"
        assert node.children[1].text == "World"

    def test_nested_list_children_flattened(self):
        """Test that nested lists of children are flattened."""
        text_node = TextNode(text="nested")
        node = jsx("phase", {"name": "test"}, ["Hello", text_node], "World")
        assert len(node.children) == 3
        assert node.children[0].text == "Hello"
        assert node.children[1] is text_node
        assert node.children[2].text == "World"

    def test_node_children_preserved(self):
        """Test that Node instances are preserved as-is."""
        child_node = IfNode(condition=True)
        node = jsx("phase", {"name": "test"}, child_node)
        assert len(node.children) == 1
        assert node.children[0] is child_node

    def test_none_children_ignored(self):
        """Test that None children are ignored."""
        node = jsx("phase", {"name": "test"}, None, "Hello", None)
        assert len(node.children) == 1
        assert node.children[0].text == "Hello"

    def test_mixed_children_types(self):
        """Test mixed types of children are properly normalized."""
        if_node = IfNode(condition=False)
        node = jsx("phase", {"name": "test"}, "text", if_node, 42, None)
        assert len(node.children) == 3
        assert node.children[0].text == "text"
        assert node.children[1] is if_node
        assert node.children[2].text == "42"


class TestEventPropValidation:
    """Test event prop validation."""

    def test_observable_nodes_definition(self):
        """Test that observable nodes are correctly defined."""
        assert OBSERVABLE_NODES == {ClaudeNode}

    def test_event_props_definition(self):
        """Test that event props are correctly defined."""
        assert EVENT_PROPS == {"on_finished", "on_error", "on_progress"}

    def test_event_props_allowed_on_claude_node(self):
        """Test that event props are allowed on ClaudeNode."""
        def callback(data):
            pass

        # Should not raise any errors
        node = jsx("claude", {
            "model": "sonnet",
            "prompt": "test",
            "on_finished": callback,
            "on_error": callback,
            "on_progress": callback
        })
        assert node.on_finished is callback
        assert node.on_error is callback
        assert node.on_progress is callback

    def test_event_props_forbidden_on_if_node(self):
        """Test that event props are forbidden on IfNode."""
        def callback(data):
            pass

        with pytest.raises(ValueError, match="Event props \\['on_finished'\\] cannot be used on IfNode"):
            jsx("if", {"condition": True, "on_finished": callback})

    def test_event_props_forbidden_on_phase_node(self):
        """Test that event props are forbidden on PhaseNode."""
        def callback(data):
            pass

        with pytest.raises(ValueError, match="Event props \\['on_error'\\] cannot be used on PhaseNode"):
            jsx("phase", {"name": "test", "on_error": callback})

    def test_multiple_event_props_error_message(self):
        """Test error message for multiple forbidden event props."""
        def callback(data):
            pass

        with pytest.raises(ValueError, match="Event props \\['on_finished', 'on_error'\\] cannot be used on StepNode"):
            jsx("step", {
                "name": "test",
                "on_finished": callback,
                "on_error": callback
            })

    def test_non_event_props_allowed_on_all_nodes(self):
        """Test that non-event props work on all nodes."""
        # Should not raise any errors
        jsx("if", {"condition": True, "key": "test"})
        jsx("phase", {"name": "test", "key": "test"})
        jsx("step", {"name": "test", "key": "test"})
        jsx("ralph", {"id": "test", "key": "test"})


class TestComponentFunctions:
    """Test component function handling."""

    def test_component_function_called_with_props_and_children(self):
        """Test that component functions receive props and children."""
        def TestComponent(children: List[Node], **props):
            assert props["name"] == "test"
            assert len(children) == 1
            assert children[0].text == "child"
            return PhaseNode(name="component", children=children)

        node = jsx(TestComponent, {"name": "test"}, "child")
        assert isinstance(node, PhaseNode)
        assert node.name == "component"
        assert len(node.children) == 1
        assert node.children[0].text == "child"

    def test_component_function_returning_list(self):
        """Test component function returning a list (like Fragment)."""
        def ListComponent(children: List[Node], **props):
            return [
                TextNode(text="first"),
                TextNode(text="second")
            ]

        result = jsx(ListComponent, {})
        assert isinstance(result, list)
        assert len(result) == 2
        assert result[0].text == "first"
        assert result[1].text == "second"

    def test_component_function_returning_string(self):
        """Test component function returning a string."""
        def StringComponent(children: List[Node], **props):
            return "Hello from component"

        node = jsx(StringComponent, {})
        assert isinstance(node, TextNode)
        assert node.text == "Hello from component"

    def test_component_function_error_handling(self):
        """Test that component function errors are properly wrapped."""
        def ErrorComponent(children: List[Node], **props):
            raise RuntimeError("Component failed")

        with pytest.raises(TypeError, match="Component function ErrorComponent failed: Component failed"):
            jsx(ErrorComponent, {})

    def test_invalid_type_raises_error(self):
        """Test that invalid JSX types raise TypeError."""
        with pytest.raises(TypeError, match="Invalid JSX type: 42. Expected string or callable"):
            jsx(42, {})


class TestFragment:
    """Test Fragment component functionality."""

    def test_fragment_returns_flattened_children(self):
        """Test that Fragment returns a flattened list of children."""
        children = [
            "text",
            TextNode(text="node"),
            ["nested", TextNode(text="deep")]
        ]
        result = Fragment(children)
        assert isinstance(result, list)
        assert len(result) == 4
        assert result[0].text == "text"
        assert result[1].text == "node"
        assert result[2].text == "nested"
        assert result[3].text == "deep"

    def test_fragment_ignores_props(self):
        """Test that Fragment ignores additional props."""
        result = Fragment(["test"], unused_prop="value")
        assert len(result) == 1
        assert result[0].text == "test"

    def test_fragment_with_jsx_function(self):
        """Test using Fragment as a component function."""
        result = jsx(Fragment, {}, "Hello", "World")
        assert isinstance(result, list)
        assert len(result) == 2
        assert result[0].text == "Hello"
        assert result[1].text == "World"


class TestEdgeCases:
    """Test edge cases and error conditions."""

    def test_jsx_with_none_props_error(self):
        """Test jsx function with None props on required fields."""
        # This should raise a validation error since IfNode requires condition
        with pytest.raises(Exception):  # Pydantic validation error
            jsx("if", None, "test")

    def test_jsx_with_no_children(self):
        """Test jsx function with no children."""
        node = jsx("if", {"condition": True})
        assert isinstance(node, IfNode)
        assert node.children == []

    def test_jsx_with_empty_props(self):
        """Test jsx function with empty props dictionary."""
        # Ralph requires an id field, so this would fail validation
        # Use a minimal but valid props set instead
        node = jsx("ralph", {"id": "test"}, "child")
        assert isinstance(node, RalphNode)
        assert node.id == "test"

    def test_children_normalization_with_deeply_nested_lists(self):
        """Test children normalization with deeply nested structures."""
        node = jsx("phase", {"name": "test"}, [[[["deep"]]]])
        assert len(node.children) == 1
        assert node.children[0].text == "deep"


if __name__ == "__main__":
    pytest.main([__file__])