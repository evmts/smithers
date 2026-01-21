"""Comprehensive tests for Smithers node models."""

import json
import pytest
from typing import Any, Dict
from pydantic import ValidationError

from smithers_py.nodes import (
    Node,
    NodeBase,
    NodeHandlers,
    NodeMeta,
    TextNode,
    IfNode,
    PhaseNode,
    StepNode,
    RalphNode,
    ClaudeNode,
    ToolPolicy,
    WhileNode,
    FragmentNode,
    EachNode,
    StopNode,
    EndNode,
    EffectNode,
)


class TestNodeBase:
    """Test the base NodeBase class."""

    def test_node_base_defaults(self):
        """Test NodeBase with default values."""
        node = NodeBase()
        assert node.key is None
        assert node.children == []
        assert node.props == {}
        assert isinstance(node.handlers, NodeHandlers)
        assert isinstance(node.meta, NodeMeta)

    def test_node_base_with_values(self):
        """Test NodeBase with explicit values."""
        node = NodeBase(
            key="test-key",
            children=[],
            props={"custom": "value"}
        )
        assert node.key == "test-key"
        assert node.children == []
        assert node.props == {"custom": "value"}

    def test_node_base_serialization(self):
        """Test NodeBase serializes to dict/JSON cleanly."""
        node = NodeBase(key="test", props={"test": "prop"})
        data = node.model_dump()
        expected = {
            "key": "test",
            "children": [],
            "props": {"test": "prop"},
            "meta": {
                "source_file": None,
                "source_line": None,
                "created_at_frame": None,
                "last_seen_frame": None
            }
        }
        assert data == expected
        # Verify handlers are excluded
        assert "handlers" not in data

        # Test JSON serialization
        json_str = node.model_dump_json()
        assert json.loads(json_str) == data

    def test_node_base_key_conversion(self):
        """Test NodeBase converts numeric keys to strings."""
        node = NodeBase(key=123)
        assert node.key == "123"

        node2 = NodeBase(key=0)
        assert node2.key == "0"


class TestTextNode:
    """Test TextNode implementation."""

    def test_text_node_creation(self):
        """Test creating a TextNode."""
        node = TextNode(text="Hello, World!")
        assert node.type == "text"
        assert node.text == "Hello, World!"
        assert node.key is None
        assert node.children == []

    def test_text_node_with_key(self):
        """Test TextNode with explicit key."""
        node = TextNode(text="Content", key="greeting")
        assert node.key == "greeting"
        assert node.text == "Content"

    def test_text_node_serialization(self):
        """Test TextNode serializes correctly."""
        node = TextNode(text="Test content", key="test-key")
        data = node.model_dump()
        expected = {
            "type": "text",
            "text": "Test content",
            "key": "test-key",
            "children": []
        }
        assert data == expected

    def test_text_node_missing_text(self):
        """Test TextNode requires text field."""
        with pytest.raises(ValidationError) as exc_info:
            TextNode()
        assert "text" in str(exc_info.value)

    def test_text_node_json_round_trip(self):
        """Test TextNode can be serialized and deserialized."""
        original = TextNode(text="Round trip test")
        json_str = original.model_dump_json()
        data = json.loads(json_str)
        recreated = TextNode.model_validate(data)
        assert recreated.text == original.text
        assert recreated.type == original.type


class TestIfNode:
    """Test IfNode implementation."""

    def test_if_node_creation(self):
        """Test creating an IfNode."""
        node = IfNode(condition=True)
        assert node.type == "if"
        assert node.condition is True
        assert node.children == []

    def test_if_node_false_condition(self):
        """Test IfNode with false condition."""
        node = IfNode(condition=False)
        assert node.condition is False

    def test_if_node_with_children(self):
        """Test IfNode with child nodes."""
        text_child = TextNode(text="Child content")
        node = IfNode(condition=True, children=[text_child])
        assert len(node.children) == 1
        assert node.children[0] == text_child

    def test_if_node_serialization(self):
        """Test IfNode serialization."""
        node = IfNode(condition=True, key="main-if")
        data = node.model_dump()
        expected = {
            "type": "if",
            "condition": True,
            "key": "main-if",
            "children": []
        }
        assert data == expected

    def test_if_node_missing_condition(self):
        """Test IfNode requires condition field."""
        with pytest.raises(ValidationError) as exc_info:
            IfNode()
        assert "condition" in str(exc_info.value)


class TestPhaseNode:
    """Test PhaseNode implementation."""

    def test_phase_node_creation(self):
        """Test creating a PhaseNode."""
        node = PhaseNode(name="implement")
        assert node.type == "phase"
        assert node.name == "implement"

    def test_phase_node_serialization(self):
        """Test PhaseNode serialization."""
        node = PhaseNode(name="test-phase", key="p1")
        data = node.model_dump()
        expected = {
            "type": "phase",
            "name": "test-phase",
            "key": "p1",
            "children": []
        }
        assert data == expected

    def test_phase_node_missing_name(self):
        """Test PhaseNode requires name field."""
        with pytest.raises(ValidationError):
            PhaseNode()


class TestStepNode:
    """Test StepNode implementation."""

    def test_step_node_creation(self):
        """Test creating a StepNode."""
        node = StepNode(name="analyze")
        assert node.type == "step"
        assert node.name == "analyze"

    def test_step_node_serialization(self):
        """Test StepNode serialization."""
        node = StepNode(name="test-step", key="s1")
        data = node.model_dump()
        expected = {
            "type": "step",
            "name": "test-step",
            "key": "s1",
            "children": []
        }
        assert data == expected


class TestRalphNode:
    """Test RalphNode implementation."""

    def test_ralph_node_creation(self):
        """Test creating a RalphNode."""
        node = RalphNode(id="fix-loop")
        assert node.type == "ralph"
        assert node.id == "fix-loop"
        assert node.max_iterations == 10  # default

    def test_ralph_node_custom_iterations(self):
        """Test RalphNode with custom max_iterations."""
        node = RalphNode(id="custom-loop", max_iterations=5)
        assert node.max_iterations == 5

    def test_ralph_node_serialization(self):
        """Test RalphNode serialization."""
        node = RalphNode(id="test-ralph", max_iterations=3, key="r1")
        data = node.model_dump()
        expected = {
            "type": "ralph",
            "id": "test-ralph",
            "max_iterations": 3,
            "key": "r1",
            "children": []
        }
        assert data == expected

    def test_ralph_node_missing_id(self):
        """Test RalphNode requires id field."""
        with pytest.raises(ValidationError):
            RalphNode()


class TestClaudeNode:
    """Test ClaudeNode implementation."""

    def test_claude_node_creation(self):
        """Test creating a ClaudeNode."""
        node = ClaudeNode(model="sonnet", prompt="Fix the tests")
        assert node.type == "claude"
        assert node.model == "sonnet"
        assert node.prompt == "Fix the tests"
        assert node.max_turns == 50  # default

    def test_claude_node_custom_turns(self):
        """Test ClaudeNode with custom max_turns."""
        node = ClaudeNode(model="haiku", prompt="Quick task", max_turns=5)
        assert node.max_turns == 5

    def test_claude_node_serialization(self):
        """Test ClaudeNode serialization excludes callbacks."""
        def dummy_callback(*args):
            pass

        node = ClaudeNode(
            model="opus",
            prompt="Complex task",
            max_turns=10,
            on_finished=dummy_callback,
            on_error=dummy_callback,
            on_progress=dummy_callback,
        )

        data = node.model_dump()
        expected = {
            "type": "claude",
            "model": "opus",
            "prompt": "Complex task",
            "max_turns": 10,
            "key": None,
            "children": []
        }
        assert data == expected
        # Verify callbacks are excluded
        assert "on_finished" not in data
        assert "on_error" not in data
        assert "on_progress" not in data

    def test_claude_node_callbacks_accessible(self):
        """Test ClaudeNode callbacks are accessible at runtime."""
        def on_finished_callback(result):
            return f"Finished: {result}"

        def on_error_callback(error):
            return f"Error: {error}"

        node = ClaudeNode(
            model="sonnet",
            prompt="Test",
            on_finished=on_finished_callback,
            on_error=on_error_callback,
        )

        # Callbacks should be accessible even though excluded from serialization
        assert node.on_finished is on_finished_callback
        assert node.on_error is on_error_callback
        assert node.on_progress is None

    def test_claude_node_missing_required_fields(self):
        """Test ClaudeNode requires model and prompt."""
        with pytest.raises(ValidationError):
            ClaudeNode()

        with pytest.raises(ValidationError):
            ClaudeNode(model="sonnet")  # missing prompt

        with pytest.raises(ValidationError):
            ClaudeNode(prompt="test")  # missing model


class TestDiscriminatedUnion:
    """Test the discriminated union Node type."""

    def test_union_text_node(self):
        """Test Node union with TextNode."""
        node_dict = {"type": "text", "text": "Hello"}

        # This should work with the union
        from pydantic import TypeAdapter
        adapter = TypeAdapter(Node)
        node = adapter.validate_python(node_dict)

        assert isinstance(node, TextNode)
        assert node.text == "Hello"

    def test_union_if_node(self):
        """Test Node union with IfNode."""
        node_dict = {"type": "if", "condition": True}

        from pydantic import TypeAdapter
        adapter = TypeAdapter(Node)
        node = adapter.validate_python(node_dict)

        assert isinstance(node, IfNode)
        assert node.condition is True

    def test_union_claude_node(self):
        """Test Node union with ClaudeNode."""
        node_dict = {
            "type": "claude",
            "model": "sonnet",
            "prompt": "Test prompt"
        }

        from pydantic import TypeAdapter
        adapter = TypeAdapter(Node)
        node = adapter.validate_python(node_dict)

        assert isinstance(node, ClaudeNode)
        assert node.model == "sonnet"
        assert node.prompt == "Test prompt"

    def test_union_invalid_type(self):
        """Test Node union with invalid type."""
        node_dict = {"type": "invalid", "data": "test"}

        from pydantic import TypeAdapter
        adapter = TypeAdapter(Node)

        with pytest.raises(ValidationError):
            adapter.validate_python(node_dict)

    def test_union_missing_type(self):
        """Test Node union with missing type field."""
        node_dict = {"text": "Hello"}  # missing type

        from pydantic import TypeAdapter
        adapter = TypeAdapter(Node)

        with pytest.raises(ValidationError):
            adapter.validate_python(node_dict)


class TestComplexScenarios:
    """Test complex node scenarios and edge cases."""

    def test_nested_node_structure(self):
        """Test creating nested node structures."""
        text_node = TextNode(text="Inner content")
        step_node = StepNode(name="inner-step", children=[text_node])
        phase_node = PhaseNode(name="main-phase", children=[step_node])

        # Verify structure
        assert len(phase_node.children) == 1
        assert isinstance(phase_node.children[0], StepNode)
        assert len(phase_node.children[0].children) == 1
        assert isinstance(phase_node.children[0].children[0], TextNode)

    def test_node_json_round_trip_complex(self):
        """Test complex node structure JSON round trip."""
        # Create complex structure
        claude_node = ClaudeNode(model="sonnet", prompt="Analyze code")
        step_node = StepNode(name="analyze", children=[claude_node])
        phase_node = PhaseNode(name="implementation", children=[step_node])

        # Serialize
        json_str = phase_node.model_dump_json()
        data = json.loads(json_str)

        # Recreate
        recreated = PhaseNode.model_validate(data)

        # Verify structure preserved
        assert recreated.name == phase_node.name
        assert len(recreated.children) == 1
        assert isinstance(recreated.children[0], StepNode)
        assert recreated.children[0].name == "analyze"

    def test_all_node_types_serialization(self):
        """Test that all node types serialize cleanly to JSON."""
        nodes = [
            TextNode(text="Test text"),
            IfNode(condition=True),
            PhaseNode(name="test-phase"),
            StepNode(name="test-step"),
            RalphNode(id="test-ralph"),
            ClaudeNode(model="sonnet", prompt="Test prompt"),
        ]

        for node in nodes:
            # Should not raise exception
            json_str = node.model_dump_json()
            data = json.loads(json_str)

            # Should have type field
            assert "type" in data
            assert data["type"] == node.type

            # Should be able to recreate from dict
            recreated = type(node).model_validate(data)
            assert recreated.type == node.type

    def test_extra_fields_forbidden(self):
        """Test that extra fields are not allowed."""
        with pytest.raises(ValidationError):
            TextNode(text="test", extra_field="not allowed")

        with pytest.raises(ValidationError):
            ClaudeNode(model="sonnet", prompt="test", unknown="field")


class TestWhileNode:
    """Test WhileNode implementation."""

    def test_while_node_creation(self):
        """Test creating a WhileNode."""
        node = WhileNode(id="test-while", condition=True)
        assert node.type == "while"
        assert node.id == "test-while"
        assert node.condition is True
        assert node.max_iterations == 100  # default

    def test_while_node_false_condition(self):
        """Test WhileNode with false condition."""
        node = WhileNode(id="test", condition=False)
        assert node.condition is False

    def test_while_node_custom_iterations(self):
        """Test WhileNode with custom max_iterations."""
        node = WhileNode(id="test", condition=True, max_iterations=5)
        assert node.max_iterations == 5

    def test_while_node_serialization(self):
        """Test WhileNode serialization."""
        node = WhileNode(id="loop", condition=True, max_iterations=10, key="w1")
        data = node.model_dump()
        expected = {
            "type": "while",
            "id": "loop",
            "condition": True,
            "max_iterations": 10,
            "key": "w1",
            "children": []
        }
        assert data == expected

    def test_while_node_missing_id(self):
        """Test WhileNode requires id field."""
        with pytest.raises(ValidationError) as exc_info:
            WhileNode(condition=True)  # missing id
        assert "id" in str(exc_info.value)

    def test_while_node_missing_condition(self):
        """Test WhileNode requires condition field."""
        with pytest.raises(ValidationError) as exc_info:
            WhileNode(id="test")  # missing condition
        assert "condition" in str(exc_info.value)

    def test_while_node_min_iterations(self):
        """Test WhileNode max_iterations minimum value."""
        with pytest.raises(ValidationError) as exc_info:
            WhileNode(id="test", condition=True, max_iterations=0)
        assert "greater than or equal to 1" in str(exc_info.value)

    def test_while_node_edge_cases(self):
        """Test WhileNode edge cases."""
        # Test with very high max_iterations
        node = WhileNode(id="high", condition=True, max_iterations=10000)
        assert node.max_iterations == 10000

        # Test with None values that should fail
        with pytest.raises(ValidationError):
            WhileNode(id=None, condition=True)

        with pytest.raises(ValidationError):
            WhileNode(id="test", condition=None)


class TestFragmentNode:
    """Test FragmentNode implementation."""

    def test_fragment_node_creation(self):
        """Test creating a FragmentNode."""
        node = FragmentNode()
        assert node.type == "fragment"
        assert node.children == []

    def test_fragment_node_with_children(self):
        """Test FragmentNode with child nodes."""
        text1 = TextNode(text="First")
        text2 = TextNode(text="Second")
        node = FragmentNode(children=[text1, text2])
        assert len(node.children) == 2
        assert node.children[0].text == "First"
        assert node.children[1].text == "Second"

    def test_fragment_node_serialization(self):
        """Test FragmentNode serialization."""
        node = FragmentNode(key="frag1")
        data = node.model_dump()
        expected = {
            "type": "fragment",
            "key": "frag1",
            "children": []
        }
        assert data == expected

    def test_fragment_node_json_round_trip(self):
        """Test FragmentNode JSON round trip."""
        original = FragmentNode(key="test")
        json_str = original.model_dump_json()
        data = json.loads(json_str)
        recreated = FragmentNode.model_validate(data)
        assert recreated.type == original.type
        assert recreated.key == original.key


class TestEachNode:
    """Test EachNode implementation."""

    def test_each_node_creation(self):
        """Test creating an EachNode."""
        node = EachNode()
        assert node.type == "each"
        assert node.children == []

    def test_each_node_with_children(self):
        """Test EachNode with child nodes."""
        text_node = TextNode(text="Item", key="item-1")
        node = EachNode(children=[text_node])
        assert len(node.children) == 1
        assert node.children[0].key == "item-1"

    def test_each_node_serialization(self):
        """Test EachNode serialization."""
        node = EachNode(key="each1")
        data = node.model_dump()
        expected = {
            "type": "each",
            "key": "each1",
            "children": []
        }
        assert data == expected

    def test_each_node_requires_child_keys(self):
        """Test EachNode children should have keys for stable identity."""
        # This is more of a runtime requirement, but we can test the structure
        text_with_key = TextNode(text="Good", key="item-1")
        text_without_key = TextNode(text="Warning")

        node = EachNode(children=[text_with_key, text_without_key])

        # First child has key
        assert node.children[0].key == "item-1"
        # Second child has no key (should generate warning in runtime)
        assert node.children[1].key is None


class TestStopNode:
    """Test StopNode implementation."""

    def test_stop_node_creation(self):
        """Test creating a StopNode."""
        node = StopNode()
        assert node.type == "stop"
        assert node.reason is None

    def test_stop_node_with_reason(self):
        """Test StopNode with reason."""
        node = StopNode(reason="User requested stop")
        assert node.reason == "User requested stop"

    def test_stop_node_serialization(self):
        """Test StopNode serialization."""
        node = StopNode(reason="Complete", key="stop1")
        data = node.model_dump()
        expected = {
            "type": "stop",
            "reason": "Complete",
            "key": "stop1",
            "children": []
        }
        assert data == expected

    def test_stop_node_edge_cases(self):
        """Test StopNode edge cases."""
        # Empty string reason
        node = StopNode(reason="")
        assert node.reason == ""

        # Very long reason
        long_reason = "x" * 1000
        node = StopNode(reason=long_reason)
        assert len(node.reason) == 1000


class TestEndNode:
    """Test EndNode implementation."""

    def test_end_node_creation(self):
        """Test creating an EndNode."""
        node = EndNode()
        assert node.type == "end"
        assert node.message is None

    def test_end_node_with_message(self):
        """Test EndNode with message."""
        node = EndNode(message="Task completed successfully")
        assert node.message == "Task completed successfully"

    def test_end_node_serialization(self):
        """Test EndNode serialization."""
        node = EndNode(message="Done", key="end1")
        data = node.model_dump()
        expected = {
            "type": "end",
            "message": "Done",
            "key": "end1",
            "children": []
        }
        assert data == expected

    def test_end_node_json_round_trip(self):
        """Test EndNode JSON round trip."""
        original = EndNode(message="Finished")
        json_str = original.model_dump_json()
        data = json.loads(json_str)
        recreated = EndNode.model_validate(data)
        assert recreated.type == original.type
        assert recreated.message == original.message


class TestEffectNode:
    """Test EffectNode implementation."""

    def test_effect_node_creation(self):
        """Test creating an EffectNode."""
        node = EffectNode(id="effect-1")
        assert node.type == "effect"
        assert node.id == "effect-1"
        assert node.deps == []
        assert node.phase == "post_commit"

    def test_effect_node_with_deps(self):
        """Test EffectNode with dependencies."""
        node = EffectNode(id="test", deps=["value1", 42, True])
        assert node.deps == ["value1", 42, True]

    def test_effect_node_with_functions(self):
        """Test EffectNode with run and cleanup functions."""
        def run_func():
            return "running"

        def cleanup_func():
            return "cleaning"

        node = EffectNode(
            id="test",
            run=run_func,
            cleanup=cleanup_func
        )

        # Functions should be accessible
        assert node.run is run_func
        assert node.cleanup is cleanup_func

    def test_effect_node_serialization(self):
        """Test EffectNode serialization excludes functions."""
        def dummy_run():
            pass

        node = EffectNode(
            id="effect-1",
            deps=[1, 2, 3],
            run=dummy_run,
            key="e1"
        )

        data = node.model_dump()
        expected = {
            "type": "effect",
            "id": "effect-1",
            "deps": [1, 2, 3],
            "phase": "post_commit",
            "key": "e1",
            "children": []
        }
        assert data == expected
        # Verify functions are excluded
        assert "run" not in data
        assert "cleanup" not in data

    def test_effect_node_missing_id(self):
        """Test EffectNode requires id field."""
        with pytest.raises(ValidationError) as exc_info:
            EffectNode()
        assert "id" in str(exc_info.value)

    def test_effect_node_edge_cases(self):
        """Test EffectNode edge cases."""
        # Complex deps
        complex_deps = [
            {"key": "value"},
            [1, 2, 3],
            None,
            ""
        ]
        node = EffectNode(id="complex", deps=complex_deps)
        assert node.deps == complex_deps

        # Test with None id should fail
        with pytest.raises(ValidationError):
            EffectNode(id=None)


class TestToolPolicy:
    """Test ToolPolicy implementation."""

    def test_tool_policy_default(self):
        """Test ToolPolicy with defaults."""
        policy = ToolPolicy()
        assert policy.allowed is None  # All tools allowed
        assert policy.denied == []

    def test_tool_policy_allowed_list(self):
        """Test ToolPolicy with allowed list."""
        policy = ToolPolicy(allowed=["read", "write", "execute"])
        assert policy.allowed == ["read", "write", "execute"]
        assert policy.denied == []

    def test_tool_policy_denied_list(self):
        """Test ToolPolicy with denied list."""
        policy = ToolPolicy(denied=["delete", "admin"])
        assert policy.allowed is None
        assert policy.denied == ["delete", "admin"]

    def test_tool_policy_both_lists(self):
        """Test ToolPolicy with both allowed and denied."""
        policy = ToolPolicy(
            allowed=["read", "write"],
            denied=["write"]  # Deny takes precedence
        )
        assert policy.allowed == ["read", "write"]
        assert policy.denied == ["write"]

    def test_tool_policy_serialization(self):
        """Test ToolPolicy serialization."""
        policy = ToolPolicy(allowed=["test"], denied=["admin"])
        data = policy.model_dump()
        expected = {
            "allowed": ["test"],
            "denied": ["admin"]
        }
        assert data == expected

    def test_tool_policy_edge_cases(self):
        """Test ToolPolicy edge cases."""
        # Empty lists
        policy = ToolPolicy(allowed=[], denied=[])
        assert policy.allowed == []  # No tools allowed
        assert policy.denied == []

        # Duplicate entries
        policy = ToolPolicy(
            allowed=["read", "read", "write"],
            denied=["delete", "delete"]
        )
        assert policy.allowed == ["read", "read", "write"]
        assert policy.denied == ["delete", "delete"]


class TestNodeHandlers:
    """Test NodeHandlers implementation."""

    def test_node_handlers_default(self):
        """Test NodeHandlers with defaults."""
        handlers = NodeHandlers()
        assert handlers.on_finished is None
        assert handlers.on_error is None
        assert handlers.on_progress is None

    def test_node_handlers_with_callbacks(self):
        """Test NodeHandlers with callback functions."""
        def on_finish(result):
            return f"Finished: {result}"

        def on_err(error):
            return f"Error: {error}"

        def on_prog(msg):
            return f"Progress: {msg}"

        handlers = NodeHandlers(
            on_finished=on_finish,
            on_error=on_err,
            on_progress=on_prog
        )

        assert handlers.on_finished is on_finish
        assert handlers.on_error is on_err
        assert handlers.on_progress is on_prog

    def test_node_handlers_serialization(self):
        """Test NodeHandlers excluded from serialization."""
        def dummy_callback():
            pass

        handlers = NodeHandlers(
            on_finished=dummy_callback,
            on_error=dummy_callback
        )

        # When used in a node, handlers should be excluded
        node = TextNode(text="Test")
        node.handlers = handlers

        data = node.model_dump()
        assert "handlers" not in data


class TestNodeMeta:
    """Test NodeMeta implementation."""

    def test_node_meta_default(self):
        """Test NodeMeta with defaults."""
        meta = NodeMeta()
        assert meta.source_file is None
        assert meta.source_line is None
        assert meta.created_at_frame is None
        assert meta.last_seen_frame is None

    def test_node_meta_with_values(self):
        """Test NodeMeta with explicit values."""
        meta = NodeMeta(
            source_file="test.py",
            source_line=42,
            created_at_frame=1,
            last_seen_frame=5
        )
        assert meta.source_file == "test.py"
        assert meta.source_line == 42
        assert meta.created_at_frame == 1
        assert meta.last_seen_frame == 5

    def test_node_meta_extra_fields(self):
        """Test NodeMeta allows extra fields."""
        # NodeMeta allows extra fields for extensibility
        meta = NodeMeta(
            source_file="test.py",
            custom_field="custom_value",
            debug_info={"key": "value"}
        )
        assert meta.source_file == "test.py"
        # Extra fields are stored via extra="allow"
        data = meta.model_dump()
        assert data["source_file"] == "test.py"
        assert "custom_field" in data
        assert data["custom_field"] == "custom_value"

    def test_node_meta_in_node(self):
        """Test NodeMeta usage in nodes."""
        node = TextNode(text="Test")
        assert hasattr(node, 'meta')
        assert isinstance(node.meta, NodeMeta)

        # Set meta values
        node.meta.source_file = "example.py"
        node.meta.source_line = 100
        assert node.meta.source_file == "example.py"
        assert node.meta.source_line == 100


class TestErrorHandling:
    """Test error handling across all node types."""

    def test_invalid_type_fields(self):
        """Test nodes with incorrect type field values."""
        from pydantic import TypeAdapter
        adapter = TypeAdapter(Node)

        # TextNode with wrong type
        with pytest.raises(ValidationError):
            adapter.validate_python({"type": "wrong", "text": "hello"})

        # IfNode with wrong type
        with pytest.raises(ValidationError):
            adapter.validate_python({"type": "text", "condition": True})

    def test_none_values_validation(self):
        """Test validation of None values in required fields."""
        # TextNode with None text
        with pytest.raises(ValidationError):
            TextNode(text=None)

        # IfNode with None condition
        with pytest.raises(ValidationError):
            IfNode(condition=None)

        # PhaseNode with None name
        with pytest.raises(ValidationError):
            PhaseNode(name=None)

        # ClaudeNode with None required fields
        with pytest.raises(ValidationError):
            ClaudeNode(model=None, prompt="test")

        with pytest.raises(ValidationError):
            ClaudeNode(model="sonnet", prompt=None)

    def test_empty_string_validation(self):
        """Test validation of empty strings where they might not be valid."""
        # Empty text is technically valid
        node = TextNode(text="")
        assert node.text == ""

        # Empty names are valid
        phase = PhaseNode(name="")
        assert phase.name == ""

        # Empty model/prompt should be valid strings
        claude = ClaudeNode(model="", prompt="")
        assert claude.model == ""
        assert claude.prompt == ""

    def test_type_coercion(self):
        """Test type coercion behavior."""
        # Boolean condition should not coerce from strings
        with pytest.raises(ValidationError):
            IfNode(condition="true")  # String, not bool

        with pytest.raises(ValidationError):
            WhileNode(id="test", condition=1)  # Int, not bool

        # Max iterations should coerce from string if valid
        ralph = RalphNode(id="test", max_iterations="5")
        assert ralph.max_iterations == 5

    def test_extra_fields_all_nodes(self):
        """Test that all nodes reject extra fields."""
        nodes_to_test = [
            (TextNode, {"text": "test", "extra": "field"}),
            (IfNode, {"condition": True, "unknown": "value"}),
            (PhaseNode, {"name": "test", "additional": "data"}),
            (StepNode, {"name": "test", "bonus": "field"}),
            (RalphNode, {"id": "test", "unexpected": "param"}),
            (WhileNode, {"id": "test", "condition": True, "mystery": "value"}),
            (FragmentNode, {"random": "field"}),
            (EachNode, {"iterate": "value"}),
            (StopNode, {"halt": "now"}),
            (EndNode, {"finish": "yes"}),
            (EffectNode, {"id": "test", "sideeffect": "data"}),
        ]

        for node_class, data in nodes_to_test:
            with pytest.raises(ValidationError) as exc_info:
                node_class(**data)
            assert "Extra inputs are not permitted" in str(exc_info.value)

    def test_deeply_nested_validation(self):
        """Test validation in deeply nested structures."""
        # Create invalid nested structure
        try:
            phase = PhaseNode(
                name="outer",
                children=[
                    StepNode(
                        name="middle",
                        children=[
                            # Invalid TextNode
                            {"type": "text"}  # Missing required 'text' field
                        ]
                    )
                ]
            )
        except ValidationError as e:
            assert "text" in str(e)

    def test_circular_reference_handling(self):
        """Test handling of potential circular references."""
        # Create nodes
        node1 = TextNode(text="Node 1")
        node2 = TextNode(text="Node 2")

        # Pydantic models are immutable by default, so we can't create true circular refs
        # But we can test that the same node can appear multiple times
        parent = FragmentNode(children=[node1, node2, node1])
        assert len(parent.children) == 3
        assert parent.children[0] is parent.children[2]

    def test_malformed_json_parsing(self):
        """Test parsing malformed JSON data."""
        from pydantic import TypeAdapter
        adapter = TypeAdapter(Node)

        test_cases = [
            {},  # Empty object
            {"type": ""},  # Empty type
            {"type": None},  # None type
            {"type": 123},  # Numeric type
            {"type": ["text"]},  # Array type
            {"type": "text", "text": 123},  # Wrong field type
            {"type": "if", "condition": "not-a-bool"},  # Wrong condition type
            {"type": "claude", "model": "sonnet"},  # Missing prompt
        ]

        for data in test_cases:
            with pytest.raises(ValidationError):
                adapter.validate_python(data)


class TestIntegrationScenarios:
    """Test integration scenarios combining multiple features."""

    def test_complex_workflow_serialization(self):
        """Test serialization of a complex workflow structure."""
        # Build a complex workflow
        workflow = PhaseNode(
            name="deployment",
            key="main-phase",
            children=[
                StepNode(
                    name="prepare",
                    key="prep-step",
                    children=[
                        ClaudeNode(
                            model="haiku",
                            prompt="Check dependencies",
                            max_turns=5,
                            key="dep-check"
                        ),
                        IfNode(
                            condition=True,
                            key="dep-check-if",
                            children=[
                                TextNode(text="Dependencies OK", key="ok-msg")
                            ]
                        )
                    ]
                ),
                StepNode(
                    name="deploy",
                    key="deploy-step",
                    children=[
                        RalphNode(
                            id="deploy-loop",
                            max_iterations=3,
                            children=[
                                ClaudeNode(
                                    model="sonnet",
                                    prompt="Deploy service",
                                    tools=ToolPolicy(
                                        allowed=["kubectl", "docker"],
                                        denied=["rm", "delete"]
                                    ),
                                    key="deploy-claude"
                                ),
                                EffectNode(
                                    id="notify",
                                    deps=["deploy_status"],
                                    key="notify-effect"
                                )
                            ]
                        )
                    ]
                ),
                EndNode(message="Deployment complete", key="end")
            ]
        )

        # Serialize to JSON
        json_str = workflow.model_dump_json(indent=2)
        data = json.loads(json_str)

        # Verify structure
        assert data["type"] == "phase"
        assert data["name"] == "deployment"
        assert len(data["children"]) == 3

        # Verify it can be deserialized
        from pydantic import TypeAdapter
        adapter = TypeAdapter(Node)
        recreated = adapter.validate_python(data)
        assert isinstance(recreated, PhaseNode)
        assert recreated.name == "deployment"

    def test_node_id_stability(self):
        """Test that node IDs remain stable across serialization."""
        nodes_with_ids = [
            WhileNode(id="while-1", condition=True),
            RalphNode(id="ralph-1"),
            EffectNode(id="effect-1"),
        ]

        for node in nodes_with_ids:
            json_str = node.model_dump_json()
            data = json.loads(json_str)

            # Recreate from data
            recreated = type(node).model_validate(data)

            # ID should be preserved
            assert recreated.id == node.id

    def test_event_handler_preservation(self):
        """Test that event handlers are preserved in memory but excluded from serialization."""
        call_log = []

        def on_finished_handler(result):
            call_log.append(f"finished: {result}")

        def on_error_handler(error):
            call_log.append(f"error: {error}")

        # Create node with handlers
        claude = ClaudeNode(
            model="sonnet",
            prompt="Test task",
            on_finished=on_finished_handler,
            on_error=on_error_handler
        )

        # Handlers should be accessible
        assert claude.on_finished is on_finished_handler
        assert claude.on_error is on_error_handler

        # Handlers can be called
        claude.on_finished("success")
        claude.on_error("failure")
        assert call_log == ["finished: success", "error: failure"]

        # But excluded from serialization
        data = claude.model_dump()
        assert "on_finished" not in data
        assert "on_error" not in data

    def test_mixed_node_children(self):
        """Test nodes with mixed types of children."""
        fragment = FragmentNode(
            children=[
                TextNode(text="Start"),
                IfNode(condition=True, children=[TextNode(text="True branch")]),
                WhileNode(
                    id="loop",
                    condition=True,
                    children=[TextNode(text="Loop body")]
                ),
                ClaudeNode(model="haiku", prompt="Quick task"),
                EffectNode(id="cleanup", deps=[]),
                StopNode(reason="Complete")
            ]
        )

        assert len(fragment.children) == 6

        # Verify each child type
        assert isinstance(fragment.children[0], TextNode)
        assert isinstance(fragment.children[1], IfNode)
        assert isinstance(fragment.children[2], WhileNode)
        assert isinstance(fragment.children[3], ClaudeNode)
        assert isinstance(fragment.children[4], EffectNode)
        assert isinstance(fragment.children[5], StopNode)

        # Should serialize successfully
        json_str = fragment.model_dump_json()
        assert json_str is not None