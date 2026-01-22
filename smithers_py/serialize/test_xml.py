"""Tests for XML serialization of Smithers nodes."""

import pytest
from unittest.mock import Mock

from smithers_py.nodes import (
    TextNode, PhaseNode, StepNode, ClaudeNode, RalphNode, IfNode,
    WhileNode, FragmentNode, EachNode, StopNode, EndNode, SmithersNode,
    EffectNode
)
from .xml import serialize_to_xml, _serialize_prop_value


class TestXMLSerialization:
    """Test suite for XML serialization."""

    def test_serialize_text_node(self):
        """TextNode becomes plain text content."""
        node = TextNode(text="Hello world")
        xml = serialize_to_xml(node)
        assert xml == "Hello world"

    def test_serialize_simple_element_self_closing(self):
        """Element with no children becomes self-closing tag."""
        node = PhaseNode(name="test")
        xml = serialize_to_xml(node)
        assert xml == '<phase name="test" />'

    def test_serialize_element_with_text_content(self):
        """Element with text child shows text content."""
        node = StepNode(name="work", children=[TextNode(text="Do something")])
        xml = serialize_to_xml(node)
        assert xml == '<step name="work">Do something</step>'

    def test_serialize_nested_elements(self):
        """Nested elements with proper indentation."""
        step = StepNode(name="analyze", children=[TextNode(text="Do work")])
        phase = PhaseNode(name="Research", children=[step])
        xml = serialize_to_xml(phase)

        expected = '''<phase name="Research">
  <step name="analyze">Do work</step>
</phase>'''
        assert xml == expected

    def test_serialize_multiple_children(self):
        """Multiple children are properly indented."""
        step1 = StepNode(name="step1", children=[TextNode(text="First")])
        step2 = StepNode(name="step2", children=[TextNode(text="Second")])
        phase = PhaseNode(name="main", children=[step1, step2])
        xml = serialize_to_xml(phase)

        expected = '''<phase name="main">
  <step name="step1">First</step>
  <step name="step2">Second</step>
</phase>'''
        assert xml == expected

    def test_serialize_claude_node(self):
        """Claude node with model and prompt."""
        node = ClaudeNode(
            model="sonnet",
            prompt="Analyze the codebase",
            max_turns=10
        )
        xml = serialize_to_xml(node)
        assert 'model="sonnet"' in xml
        assert 'prompt="Analyze the codebase"' in xml
        assert 'max_turns="10"' in xml
        assert xml.startswith('<claude')
        assert xml.endswith(' />')

    def test_serialize_claude_with_callbacks_excluded(self):
        """Callback fields are excluded from serialization."""
        callback = Mock()
        node = ClaudeNode(
            model="sonnet",
            prompt="Test",
            on_finished=callback,
            on_error=callback,
            on_progress=callback
        )
        xml = serialize_to_xml(node)

        # Should contain basic props
        assert 'model="sonnet"' in xml
        assert 'prompt="Test"' in xml

        # Should NOT contain callback props
        assert 'on_finished' not in xml
        assert 'on_error' not in xml
        assert 'on_progress' not in xml

    def test_serialize_events_attribute(self):
        """Events attribute shows which callbacks are present."""
        callback = Mock()
        node = ClaudeNode(
            model="sonnet",
            prompt="Test",
            on_finished=callback,
            on_error=callback
        )
        xml = serialize_to_xml(node)

        # Should include events attribute
        assert 'events="onFinished,onError"' in xml

    def test_serialize_key_attribute_first(self):
        """Key attribute appears first when present."""
        node = PhaseNode(name="test", key="my-key")
        xml = serialize_to_xml(node)

        # key should come before name
        assert xml.startswith('<phase key="my-key" name="test"')

    def test_serialize_boolean_props(self):
        """Boolean properties are serialized as strings."""
        node = IfNode(condition=True)
        xml = serialize_to_xml(node)
        assert 'condition="True"' in xml

    def test_serialize_number_props(self):
        """Number properties are serialized as strings."""
        node = RalphNode(id="loop1", max_iterations=5)
        xml = serialize_to_xml(node)
        assert 'max_iterations="5"' in xml

    def test_serialize_ralph_node(self):
        """Ralph node with id and max_iterations."""
        step = StepNode(name="work")
        ralph = RalphNode(id="loop1", max_iterations=3, children=[step])
        xml = serialize_to_xml(ralph)

        expected = '''<ralph id="loop1" max_iterations="3">
  <step name="work" />
</ralph>'''
        assert xml == expected

    def test_serialize_if_node(self):
        """If node with condition."""
        step = StepNode(name="conditional_work")
        if_node = IfNode(condition=True, children=[step])
        xml = serialize_to_xml(if_node)

        expected = '''<if condition="True">
  <step name="conditional_work" />
</if>'''
        assert xml == expected

    def test_escape_special_characters_in_text(self):
        """Special XML characters are escaped in text content."""
        node = StepNode(name="test", children=[TextNode(text='Use <tag> & "quotes"')])
        xml = serialize_to_xml(node)

        assert '&lt;tag&gt;' in xml
        assert '&amp;' in xml
        assert '&quot;' in xml

    def test_escape_special_characters_in_attributes(self):
        """Special XML characters are escaped in attribute values."""
        node = PhaseNode(name='expert "coder"')
        xml = serialize_to_xml(node)

        assert 'name="expert &quot;coder&quot;"' in xml

    def test_omit_none_values(self):
        """None values are omitted from attributes."""
        node = PhaseNode(name="test", key=None)
        xml = serialize_to_xml(node)

        assert 'name="test"' in xml
        assert 'key=' not in xml

    def test_complex_nested_structure(self):
        """Test a complex nested structure like the example."""
        claude = ClaudeNode(
            model="sonnet",
            prompt="Analyze the data",
            on_finished=Mock()  # This should create events attribute
        )
        step = StepNode(name="analyze", children=[claude])
        phase = PhaseNode(name="Research", children=[step])
        xml = serialize_to_xml(phase)

        # Verify structure - tools field has default ToolPolicy which serializes
        assert '<phase name="Research">' in xml
        assert '<step name="analyze">' in xml
        assert 'model="sonnet"' in xml
        assert 'prompt="Analyze the data"' in xml
        assert 'max_turns="50"' in xml
        assert 'events="onFinished"' in xml
        assert '</step>' in xml
        assert '</phase>' in xml

    def test_empty_node_returns_empty_string(self):
        """None/empty nodes return empty string."""
        xml = serialize_to_xml(None)
        assert xml == ""

    def test_text_node_with_special_characters(self):
        """TextNode properly escapes special characters."""
        node = TextNode(text="<script>alert('xss')</script>")
        xml = serialize_to_xml(node)
        assert xml == "&lt;script&gt;alert(&apos;xss&apos;)&lt;/script&gt;"

    def test_ampersand_escaped_first(self):
        """Critical test: & must be escaped before other entities."""
        node = TextNode(text="&lt; already escaped")
        xml = serialize_to_xml(node)
        # & should be escaped first, so &lt; becomes &amp;lt;
        assert xml == "&amp;lt; already escaped"

    def test_numeric_key(self):
        """Numeric keys are properly serialized."""
        node = PhaseNode(name="test", key=42)
        xml = serialize_to_xml(node)
        assert xml.startswith('<phase key="42"')

    def test_empty_string_key(self):
        """Empty string keys are properly serialized."""
        node = PhaseNode(name="test", key="")
        xml = serialize_to_xml(node)
        assert 'key=""' in xml

    def test_mixed_content_text_and_elements(self):
        """Mixed text and element children."""
        # This is a bit tricky in our current model since we don't have
        # mixed content support, but let's test what we do have
        text_child = TextNode(text="Some text")
        elem_child = StepNode(name="work")
        parent = PhaseNode(name="mixed", children=[text_child, elem_child])
        xml = serialize_to_xml(parent)

        # Should contain both text and element
        assert "Some text" in xml
        assert "<step" in xml

    def test_deeply_nested_structure(self):
        """Test deep nesting maintains proper indentation."""
        level3 = StepNode(name="level3")
        level2 = PhaseNode(name="level2", children=[level3])
        level1 = RalphNode(id="level1", children=[level2])
        xml = serialize_to_xml(level1)

        lines = xml.split('\n')

        # Check indentation levels
        assert lines[0] == '<ralph id="level1" max_iterations="10">'
        assert lines[1] == '  <phase name="level2">'
        assert lines[2] == '    <step name="level3" />'
        assert lines[3] == '  </phase>'
        assert lines[4] == '</ralph>'

    def test_example_from_requirements(self):
        """Test the exact example from requirements."""
        # Create: <phase name="Research"><step name="analyze"><claude model="sonnet" prompt="..." events="onFinished"/></step></phase>
        claude = ClaudeNode(
            model="sonnet",
            prompt="Analyze the codebase thoroughly",
            on_finished=Mock()
        )
        step = StepNode(name="analyze", children=[claude])
        phase = PhaseNode(name="Research", children=[step])

        xml = serialize_to_xml(phase)

        # Verify structure matches expected format
        assert xml.startswith('<phase name="Research">')
        assert '<step name="analyze">' in xml
        assert 'model="sonnet"' in xml
        assert 'events="onFinished"' in xml
        assert xml.endswith('</phase>')


    def test_while_node(self):
        """While node with condition and max_iterations."""
        step = StepNode(name="work")
        # WhileNode.condition is str, not bool; no id field
        while_node = WhileNode(condition="status == 'running'", max_iterations=50, children=[step])
        xml = serialize_to_xml(while_node)

        expected = '''<while condition="status == &apos;running&apos;" max_iterations="50">
  <step name="work" />
</while>'''
        assert xml == expected

    def test_fragment_node(self):
        """Fragment node acts as a wrapper without attributes."""
        step1 = StepNode(name="step1")
        step2 = StepNode(name="step2")
        fragment = FragmentNode(children=[step1, step2])
        xml = serialize_to_xml(fragment)

        expected = '''<fragment>
  <step name="step1" />
  <step name="step2" />
</fragment>'''
        assert xml == expected

    def test_each_node(self):
        """Each node for list rendering."""
        step = StepNode(name="item", key="item-1")
        # EachNode requires items and render fields
        each_node = EachNode(items=["a", "b"], render=lambda x: x, children=[step])
        xml = serialize_to_xml(each_node)

        # items serializes as JSON, render is excluded (callable)
        assert '<each' in xml
        assert 'items=' in xml
        assert '<step key="item-1" name="item" />' in xml
        assert '</each>' in xml

    def test_stop_node(self):
        """Stop node with optional reason."""
        stop_node = StopNode(reason="Task completed")
        xml = serialize_to_xml(stop_node)
        assert xml == '<stop reason="Task completed" />'

    def test_stop_node_without_reason(self):
        """Stop node without reason."""
        stop_node = StopNode()
        xml = serialize_to_xml(stop_node)
        assert xml == '<stop />'

    def test_end_node(self):
        """End node with optional message."""
        end_node = EndNode(message="Process complete")
        xml = serialize_to_xml(end_node)
        assert xml == '<end message="Process complete" />'

    def test_end_node_without_message(self):
        """End node without message."""
        end_node = EndNode()
        xml = serialize_to_xml(end_node)
        assert xml == '<end />'

    def test_dict_prop_serialization(self):
        """Dict properties are serialized as JSON."""
        # Create a node with dict props using the ToolPolicy from ClaudeNode
        from smithers_py.nodes import ToolPolicy
        policy = ToolPolicy(
            allowed=["bash", "read"],
            denied=["write"]
        )
        node = ClaudeNode(
            model="sonnet",
            prompt="Test with tools",
            tools=policy
        )
        xml = serialize_to_xml(node)

        # Should serialize tools as JSON
        assert 'tools=' in xml
        assert 'allowed' in xml
        assert 'denied' in xml

    def test_list_prop_serialization(self):
        """List properties are serialized as JSON."""
        # Use EachNode which has a list field (items)
        each_node = EachNode(items=["tag1", "tag2"], render=lambda x: x)
        xml = serialize_to_xml(each_node)

        # Should contain serialized list (items field)
        assert 'items=' in xml
        assert '&quot;tag1&quot;' in xml
        assert '&quot;tag2&quot;' in xml

    def test_circular_reference_handling(self):
        """Circular references are handled gracefully."""
        # Create a complex object that might cause circular references
        class ComplexObject:
            def __init__(self):
                self.circular = self

        # This should not crash - _serialize_prop_value uses str() for non-dict/list
        obj = ComplexObject()
        value = _serialize_prop_value(obj)
        # str() representation of the object
        assert "ComplexObject" in value

    def test_empty_children_list(self):
        """Empty children list results in self-closing tag."""
        node = PhaseNode(name="empty", children=[])
        xml = serialize_to_xml(node)
        assert xml == '<phase name="empty" />'

    def test_whitespace_only_text_node(self):
        """Text nodes with only whitespace are included."""
        node = StepNode(name="test", children=[TextNode(text="   ")])
        xml = serialize_to_xml(node)
        # Whitespace-only text should be preserved
        assert xml == '<step name="test">   </step>'

    def test_mixed_whitespace_text_node(self):
        """Text nodes with mixed content and whitespace."""
        node = StepNode(name="test", children=[
            TextNode(text="\n  Hello\n  World\n")
        ])
        xml = serialize_to_xml(node)
        assert "\n  Hello\n  World\n" in xml

    def test_all_special_chars_together(self):
        """All special XML characters in one string."""
        node = TextNode(text='& < > " \' &amp; &lt;')
        xml = serialize_to_xml(node)
        assert xml == '&amp; &lt; &gt; &quot; &apos; &amp;amp; &amp;lt;'

    def test_unicode_characters(self):
        """Unicode characters are preserved."""
        node = PhaseNode(name="测试 🚀")
        xml = serialize_to_xml(node)
        assert '测试 🚀' in xml

    def test_very_deep_nesting(self):
        """Very deep nesting maintains structure."""
        # Create 5 levels deep
        current = TextNode(text="Deep content")
        for i in range(5, 0, -1):
            current = StepNode(name=f"level{i}", children=[current])

        xml = serialize_to_xml(current)
        assert "Deep content" in xml
        assert xml.count("<step") == 5
        assert xml.count("</step>") == 5

    def test_smithers_node(self):
        """SmithersNode with component and args."""
        # SmithersNode requires prompt field
        node = SmithersNode(
            prompt="Analyze the codebase",
            name="sub-orchestration",
            component="AnalyzeCode",
            args={"path": "/src", "depth": 2}
        )
        xml = serialize_to_xml(node)

        assert '<smithers' in xml
        assert 'prompt="Analyze the codebase"' in xml
        assert 'name="sub-orchestration"' in xml
        assert 'component="AnalyzeCode"' in xml
        assert 'args=' in xml
        # Args should be serialized as JSON
        assert '&quot;path&quot;' in xml and '&quot;/src&quot;' in xml

    def test_smithers_node_with_tools(self):
        """SmithersNode with tool policy."""
        from smithers_py.nodes import ToolPolicy
        tools = ToolPolicy(allowed=["bash"], denied=["write"])
        # SmithersNode requires prompt field
        node = SmithersNode(
            prompt="Deploy the app",
            name="restricted-sub",
            component="Deploy",
            tools=tools
        )
        xml = serialize_to_xml(node)

        assert 'tools=' in xml
        # Should contain serialized tool policy
        assert 'allowed' in xml and 'bash' in xml

    def test_effect_node(self):
        """EffectNode with deps and excluded callbacks."""
        def my_effect():
            pass

        node = EffectNode(
            id="sync-state",
            deps=["phase", "step"],
            run=my_effect,
            cleanup=lambda: None
        )
        xml = serialize_to_xml(node)

        assert '<effect' in xml
        assert 'id="sync-state"' in xml
        assert 'deps=' in xml
        assert '&quot;phase&quot;' in xml and '&quot;step&quot;' in xml
        assert 'phase="post_commit"' in xml
        # run and cleanup should be excluded
        assert 'run=' not in xml
        assert 'cleanup=' not in xml


if __name__ == "__main__":
    pytest.main([__file__])