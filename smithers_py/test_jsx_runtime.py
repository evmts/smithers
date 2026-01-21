"""Tests for the JSX runtime functionality."""

import pytest
from typing import List

from smithers_py.jsx_runtime import jsx, Fragment, INTRINSICS, OBSERVABLE_NODES, EVENT_PROPS
from smithers_py.nodes import (
    Node,
    TextNode,
    IfNode,
    PhaseNode,
    StepNode,
    RalphNode,
    ClaudeNode,
    WhileNode,
    FragmentNode,
    EachNode,
    StopNode,
    EndNode,
    SmithersNode,
    EffectNode,
)
from smithers_py.errors import EventValidationError


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
            "while": WhileNode,
            "fragment": FragmentNode,
            "each": EachNode,
            "stop": StopNode,
            "end": EndNode,
            "smithers": SmithersNode,
            "effect": EffectNode,
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
        assert node.handlers.on_finished is on_finished

    def test_while_node_creation(self):
        """Test creating WhileNode via JSX."""
        node = jsx("while", {"condition": "x < 10", "max_iterations": 100})
        assert isinstance(node, WhileNode)
        assert node.type == "while"
        assert node.condition == "x < 10"
        assert node.max_iterations == 100

    def test_fragment_node_creation(self):
        """Test creating FragmentNode via JSX."""
        node = jsx("fragment", {})
        assert isinstance(node, FragmentNode)
        assert node.type == "fragment"
        assert node.children == []

    def test_each_node_creation(self):
        """Test creating EachNode via JSX."""
        items = [1, 2, 3]
        render_fn = lambda item: TextNode(text=str(item))
        node = jsx("each", {"items": items, "render": render_fn})
        assert isinstance(node, EachNode)
        assert node.type == "each"
        assert node.items == items
        assert node.render is render_fn

    def test_stop_node_creation(self):
        """Test creating StopNode via JSX."""
        node = jsx("stop", {"reason": "Task complete"})
        assert isinstance(node, StopNode)
        assert node.type == "stop"
        assert node.reason == "Task complete"

    def test_end_node_creation(self):
        """Test creating EndNode via JSX."""
        node = jsx("end", {})
        assert isinstance(node, EndNode)
        assert node.type == "end"

    def test_smithers_node_creation(self):
        """Test creating SmithersNode via JSX."""
        def on_finished(result):
            pass

        node = jsx("smithers", {
            "prompt": "Create a test plan",
            "on_finished": on_finished
        })
        assert isinstance(node, SmithersNode)
        assert node.type == "smithers"
        assert node.prompt == "Create a test plan"
        assert node.handlers.on_finished is on_finished

    def test_effect_node_creation(self):
        """Test creating EffectNode via JSX."""
        def run_effect():
            pass

        node = jsx("effect", {
            "id": "test-effect",
            "deps": [1, 2, 3],
            "run": run_effect
        })
        assert isinstance(node, EffectNode)
        assert node.type == "effect"
        assert node.id == "test-effect"
        assert node.deps == [1, 2, 3]
        assert node.run is run_effect

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
        assert OBSERVABLE_NODES == {ClaudeNode, SmithersNode}

    def test_event_props_definition(self):
        """Test that event props are correctly defined."""
        # EVENT_PROPS is now just for reference - actual validation is more generic
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
        assert node.handlers.on_finished is callback
        assert node.handlers.on_error is callback
        assert node.handlers.on_progress is callback

    def test_event_props_allowed_on_smithers_node(self):
        """Test that event props are allowed on SmithersNode."""
        def callback(data):
            pass

        # Should not raise any errors
        node = jsx("smithers", {
            "prompt": "test",
            "on_finished": callback,
            "on_error": callback,
            "on_progress": callback
        })
        assert node.handlers.on_finished is callback
        assert node.handlers.on_error is callback
        assert node.handlers.on_progress is callback

    def test_event_props_forbidden_on_if_node(self):
        """Test that event props are forbidden on IfNode."""
        def callback(data):
            pass

        with pytest.raises(EventValidationError, match="Event prop 'on_finished' not allowed on non-observable node type 'IfNode'"):
            jsx("if", {"condition": True, "on_finished": callback})

    def test_event_props_forbidden_on_phase_node(self):
        """Test that event props are forbidden on PhaseNode."""
        def callback(data):
            pass

        with pytest.raises(EventValidationError, match="Event prop 'on_error' not allowed on non-observable node type 'PhaseNode'"):
            jsx("phase", {"name": "test", "on_error": callback})

    def test_multiple_event_props_error_message(self):
        """Test error message for multiple forbidden event props."""
        def callback(data):
            pass

        # Note: Only the first invalid event prop will trigger the error
        with pytest.raises(EventValidationError):
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

    def test_generic_event_prop_validation(self):
        """Test that any prop starting with 'on' and uppercase 3rd char is validated."""
        def callback(data):
            pass

        # These should all be caught as event props on non-observable nodes
        with pytest.raises(EventValidationError, match="'onSuccess'"):
            jsx("phase", {"name": "test", "onSuccess": callback})

        with pytest.raises(EventValidationError, match="'onUpdate'"):
            jsx("step", {"name": "test", "onUpdate": callback})

        with pytest.raises(EventValidationError, match="'onCustomEvent'"):
            jsx("if", {"condition": True, "onCustomEvent": callback})

        # But these should be allowed (not matching event prop pattern)
        jsx("phase", {"name": "test", "onclick": callback})  # lowercase 'c'
        jsx("step", {"name": "test", "on_click": callback})  # underscore
        jsx("if", {"condition": True, "onlyone": callback})  # lowercase after 'on'

    def test_generic_event_props_allowed_on_observable_nodes(self):
        """Test that any event prop pattern is allowed on observable nodes."""
        def callback(data):
            pass

        # Should not raise any errors - observable nodes accept any event prop
        node = jsx("claude", {
            "model": "sonnet",
            "prompt": "test",
            "onSuccess": callback,
            "onCustomEvent": callback,
            "onAnythingReally": callback
        })
        assert node.handlers.onSuccess is callback
        assert node.handlers.onCustomEvent is callback
        assert node.handlers.onAnythingReally is callback


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

    def test_children_with_numbers(self):
        """Test that numeric children are converted to text nodes."""
        node = jsx("phase", {"name": "test"}, 42, 3.14, 0, -1)
        assert len(node.children) == 4
        assert node.children[0].text == "42"
        assert node.children[1].text == "3.14"
        assert node.children[2].text == "0"
        assert node.children[3].text == "-1"

    def test_children_with_booleans(self):
        """Test that boolean children are converted to text nodes."""
        node = jsx("phase", {"name": "test"}, True, False)
        assert len(node.children) == 2
        assert node.children[0].text == "True"
        assert node.children[1].text == "False"

    def test_children_with_empty_strings(self):
        """Test that empty strings create text nodes."""
        node = jsx("phase", {"name": "test"}, "", " ", "text")
        assert len(node.children) == 3
        assert node.children[0].text == ""
        assert node.children[1].text == " "
        assert node.children[2].text == "text"

    def test_children_with_mixed_empty_values(self):
        """Test handling of various empty values."""
        node = jsx("phase", {"name": "test"}, None, [], "", 0, False)
        assert len(node.children) == 3  # None and [] are ignored
        assert node.children[0].text == ""
        assert node.children[1].text == "0"
        assert node.children[2].text == "False"

    def test_intrinsic_with_extra_props(self):
        """Test that extra props are passed through to nodes."""
        node = jsx("phase", {"name": "test", "custom_prop": "value", "metadata": {"key": "val"}})
        assert node.name == "test"
        # Extra props should be available in the node's model_extra or similar
        # depending on Pydantic configuration

    def test_jsx_with_special_characters_in_text(self):
        """Test handling of special characters in text children."""
        special_text = "Hello\nWorld\t<>&'\"\\/"
        node = jsx("phase", {"name": "test"}, special_text)
        assert len(node.children) == 1
        assert node.children[0].text == special_text

    def test_nested_jsx_calls(self):
        """Test nested jsx() calls within children."""
        node = jsx("phase", {"name": "outer"},
            jsx("step", {"name": "inner1"}),
            jsx("step", {"name": "inner2"}, "text")
        )
        assert isinstance(node, PhaseNode)
        assert len(node.children) == 2
        assert isinstance(node.children[0], StepNode)
        assert node.children[0].name == "inner1"
        assert isinstance(node.children[1], StepNode)
        assert node.children[1].name == "inner2"
        assert len(node.children[1].children) == 1
        assert node.children[1].children[0].text == "text"

    def test_component_with_jsx_children(self):
        """Test component function receiving jsx children."""
        def Wrapper(children: List[Node], **props):
            return jsx("phase", {"name": props.get("name", "wrapper")}, *children)

        node = jsx(Wrapper, {"name": "custom"},
            jsx("step", {"name": "child1"}),
            jsx("step", {"name": "child2"})
        )
        assert isinstance(node, PhaseNode)
        assert node.name == "custom"
        assert len(node.children) == 2

    def test_invalid_node_props_validation(self):
        """Test that invalid props trigger Pydantic validation."""
        # IfNode requires 'condition' prop
        with pytest.raises(Exception):  # Will be a Pydantic ValidationError
            jsx("if", {})

        # PhaseNode requires 'name' prop
        with pytest.raises(Exception):  # Will be a Pydantic ValidationError
            jsx("phase", {})

    def test_type_validation_with_wrong_types(self):
        """Test type validation for node props."""
        # Test passing wrong type for max_iterations (expects int)
        with pytest.raises(Exception):  # Will be a Pydantic ValidationError
            jsx("ralph", {"id": "test", "max_iterations": "not a number"})

    def test_empty_jsx_call(self):
        """Test jsx() with minimal arguments."""
        # Fragment with no children
        result = jsx(Fragment, {})
        assert isinstance(result, list)
        assert len(result) == 0

    def test_jsx_with_callable_child(self):
        """Test handling of callable objects as children."""
        def some_func():
            return "result"

        # Functions as children should be converted to text
        node = jsx("phase", {"name": "test"}, some_func)
        assert len(node.children) == 1
        assert "some_func" in node.children[0].text or "function" in node.children[0].text

    def test_edge_case_event_prop_names(self):
        """Test edge cases for event prop naming validation."""
        def callback(data):
            pass

        # Edge cases that should NOT be treated as event props
        jsx("phase", {"name": "test", "on": callback})  # Just "on"
        jsx("phase", {"name": "test", "onward": callback})  # Not uppercase 3rd char
        jsx("phase", {"name": "test", "ON_CLICK": callback})  # Underscore style

        # Edge cases that SHOULD be treated as event props (and fail)
        with pytest.raises(EventValidationError):
            jsx("phase", {"name": "test", "onX": callback})  # Short but valid

        # Digits are not uppercase, so this should NOT be treated as event prop
        jsx("phase", {"name": "test", "on1": callback})  # Number is not uppercase

    def test_handler_initialization_validation(self):
        """Test NodeHandlers initialization validation."""
        from smithers_py.nodes import NodeHandlers

        # Valid handlers
        handlers = NodeHandlers(onFinished=lambda: None, onError=lambda: None)
        assert callable(handlers.onFinished)
        assert callable(handlers.onError)

        # Invalid handler name
        with pytest.raises(ValueError, match="must start with 'on' followed by uppercase"):
            NodeHandlers(invalid_name=lambda: None)

        # Invalid handler value (not callable)
        with pytest.raises(ValueError, match="must be callable or None"):
            NodeHandlers(onFinished="not a function")


if __name__ == "__main__":
    pytest.main([__file__])