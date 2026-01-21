"""Comprehensive tests for Smithers node models."""

import json
import pytest
from typing import Any, Dict
from pydantic import ValidationError

from smithers_py.nodes import (
    Node,
    NodeBase,
    TextNode,
    IfNode,
    PhaseNode,
    StepNode,
    RalphNode,
    ClaudeNode,
)


class TestNodeBase:
    """Test the base NodeBase class."""

    def test_node_base_defaults(self):
        """Test NodeBase with default values."""
        node = NodeBase()
        assert node.key is None
        assert node.children == []

    def test_node_base_with_values(self):
        """Test NodeBase with explicit values."""
        node = NodeBase(key="test-key", children=[])
        assert node.key == "test-key"
        assert node.children == []

    def test_node_base_serialization(self):
        """Test NodeBase serializes to dict/JSON cleanly."""
        node = NodeBase(key="test")
        data = node.model_dump()
        assert data == {"key": "test", "children": []}

        # Test JSON serialization
        json_str = node.model_dump_json()
        assert json.loads(json_str) == data


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