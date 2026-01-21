#!/usr/bin/env python3
"""Basic test to verify XML serializer is working."""

import sys
sys.path.insert(0, '.')

from smithers_py.nodes import PhaseNode, StepNode, TextNode, ClaudeNode
from smithers_py.serialize.xml import serialize_to_xml


def test_basic():
    """Test basic XML serialization."""
    # Test 1: Simple self-closing tag
    node = PhaseNode(name="test")
    xml = serialize_to_xml(node)
    print(f"Test 1 - Simple phase: {xml}")
    assert xml == '<phase name="test" />', f"Expected '<phase name=\"test\" />', got: {xml}"

    # Test 2: Element with text content
    node = StepNode(name="work", children=[TextNode(text="Do something")])
    xml = serialize_to_xml(node)
    print(f"\nTest 2 - Step with text: {xml}")
    assert xml == '<step name="work">Do something</step>', f"Expected step with text, got: {xml}"

    # Test 3: Nested structure
    claude = ClaudeNode(model="sonnet", prompt="Analyze")
    step = StepNode(name="analyze", children=[claude])
    phase = PhaseNode(name="Research", children=[step])
    xml = serialize_to_xml(phase)
    print(f"\nTest 3 - Nested structure:\n{xml}")
    assert '<phase name="Research">' in xml
    assert '<step name="analyze">' in xml
    assert 'model="sonnet"' in xml

    # Test 4: Special characters
    node = TextNode(text='Use <tag> & "quotes"')
    xml = serialize_to_xml(node)
    print(f"\nTest 4 - Special chars: {xml}")
    assert '&lt;tag&gt;' in xml
    assert '&amp;' in xml
    assert '&quot;' in xml

    print("\nAll basic tests passed!")


if __name__ == "__main__":
    test_basic()