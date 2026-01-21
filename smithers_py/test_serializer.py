#!/usr/bin/env python3
"""Simple test script for XML serializer."""

from smithers_py.nodes import TextNode, PhaseNode, StepNode, ClaudeNode
from smithers_py.serialize.xml import serialize_to_xml


def test_basic_functionality():
    """Test basic serialization functionality."""
    print("Testing XML Serializer...")

    # Test 1: Simple text node
    text = TextNode(text="Hello world")
    xml = serialize_to_xml(text)
    print(f"TextNode: {xml}")
    assert xml == "Hello world"

    # Test 2: Simple phase node
    phase = PhaseNode(name="test")
    xml = serialize_to_xml(phase)
    print(f"PhaseNode: {xml}")
    assert xml == '<phase name="test" />'

    # Test 3: Phase with step
    step = StepNode(name="analyze", children=[TextNode(text="Do work")])
    phase = PhaseNode(name="Research", children=[step])
    xml = serialize_to_xml(phase)
    print(f"Nested structure:\n{xml}")

    expected = '''<phase name="Research">
  <step name="analyze">Do work</step>
</phase>'''
    assert xml == expected

    # Test 4: Claude node with callback (should show events)
    def dummy_callback(x): pass
    claude = ClaudeNode(
        model="sonnet",
        prompt="Analyze the codebase",
        on_finished=dummy_callback
    )
    xml = serialize_to_xml(claude)
    print(f"Claude with callback: {xml}")
    assert 'events="onFinished"' in xml

    # Test 5: Complex example from requirements
    claude = ClaudeNode(
        model="sonnet",
        prompt="Analyze thoroughly",
        on_finished=dummy_callback
    )
    step = StepNode(name="analyze", children=[claude])
    phase = PhaseNode(name="Research", children=[step])
    xml = serialize_to_xml(phase)
    print(f"\nComplex example:\n{xml}")

    print("\n✅ All tests passed!")


if __name__ == "__main__":
    test_basic_functionality()