"""XML serialization for Smithers nodes.

Converts node tree to readable XML format compatible with Smithers TS format.
Tags are node types: <claude>, <phase>, <step>, etc.
Props become attributes (exclude=True fields omitted).
Children become nested elements.
TextNode becomes text content.
"""

from __future__ import annotations

import json
from typing import Any, Dict, List, Set

from smithers_py.nodes import Node, NodeBase, TextNode


def serialize_to_xml(node: Node) -> str:
    """Convert node tree to readable XML.

    Args:
        node: The root node to serialize

    Returns:
        XML string representation of the node tree
    """
    if not node:
        return ""

    return _serialize_node(node)


def _serialize_node(node: Node, indent_level: int = 0) -> str:
    """Internal recursive serialization."""
    if not node:
        return ""

    # Handle TextNode - just return escaped content
    if isinstance(node, TextNode):
        return _escape_xml(node.text)

    # Get tag name from node type
    tag = node.type.lower()

    # Build attributes from node properties
    attrs = _serialize_props(node)

    # Get key attribute first if present
    key_attr = ""
    if node.key is not None:
        key_attr = f' key="{_escape_xml(str(node.key))}"'

    # Serialize children
    child_content = []
    has_text_child = False

    for child in node.children:
        if isinstance(child, TextNode):
            has_text_child = True
        child_xml = _serialize_node(child, indent_level + 1)
        if child_xml:
            child_content.append(child_xml)

    # Join children
    if not child_content:
        # Self-closing tag
        return f"<{tag}{key_attr}{attrs} />"

    children_str = ""
    if has_text_child:
        # Text content - no extra indentation
        children_str = "".join(child_content)
        return f"<{tag}{key_attr}{attrs}>{children_str}</{tag}>"
    else:
        # Element children - use indentation
        indent = "  " * (indent_level + 1)
        children_str = f"\n{indent}" + f"\n{indent}".join(child_content) + f"\n{'  ' * indent_level}"
        return f"<{tag}{key_attr}{attrs}>{children_str}</{tag}>"


def _serialize_props(node: NodeBase) -> str:
    """Serialize node properties to XML attributes.

    Excludes fields marked with exclude=True and known non-serializable props.
    """
    # Get all model fields to check exclude status (use class, not instance)
    model_fields = node.__class__.model_fields

    # Non-serializable props (callbacks, internal fields)
    non_serializable = {
        'children', 'type', 'key',  # Handled separately
        'on_finished', 'on_error', 'on_progress',  # Callbacks
        'onFinished', 'onError', 'onProgress',  # Alternative naming
        'run', 'cleanup',  # EffectNode callbacks
        'handlers', 'meta', 'props',  # Base node fields that are handled specially
    }

    attrs = []

    # Get all field values using model_dump to respect exclude settings
    data = node.model_dump(exclude={'children', 'type', 'key'})

    for field_name, value in data.items():
        # Skip non-serializable fields
        if field_name in non_serializable:
            continue

        # Skip None/undefined values
        if value is None:
            continue

        # Check if field is excluded in the model definition
        field_info = model_fields.get(field_name)
        if field_info and field_info.exclude:
            # For excluded fields, check if they exist and add to events attribute
            continue

        # Serialize the value
        attr_value = _serialize_prop_value(value)
        attrs.append(f' {field_name}="{_escape_xml(attr_value)}"')

    # Handle events attribute for excluded callback fields
    events = _get_events_attribute(node)
    if events:
        attrs.append(f' events="{events}"')

    return "".join(attrs)


def _serialize_prop_value(value: Any) -> str:
    """Serialize a property value to string."""
    if isinstance(value, (dict, list)):
        try:
            return json.dumps(value)
        except (TypeError, ValueError):
            return "[Object (circular or non-serializable)]"
    return str(value)


def _get_events_attribute(node: Node) -> str:
    """Build events attribute from excluded callback fields that are present."""
    events = []

    # Check for callback fields that exist on the node
    # First check direct attributes (for backward compatibility)
    callback_fields = ['on_finished', 'on_error', 'on_progress']

    for field in callback_fields:
        if hasattr(node, field) and getattr(node, field) is not None:
            # Convert snake_case to camelCase for events attribute
            event_name = _snake_to_camel(field)
            events.append(event_name)

    # Also check handlers object if it exists
    if hasattr(node, 'handlers'):
        handlers = node.handlers
        for field in callback_fields:
            # Skip if already found on direct attribute
            event_name = _snake_to_camel(field)
            if event_name not in events and hasattr(handlers, field) and getattr(handlers, field) is not None:
                events.append(event_name)

    return ",".join(events)


def _snake_to_camel(snake_str: str) -> str:
    """Convert snake_case to camelCase (e.g., on_finished -> onFinished)."""
    components = snake_str.split('_')
    return components[0] + ''.join(word.capitalize() for word in components[1:])


def _escape_xml(text: str) -> str:
    """Escape XML entities.

    CRITICAL: & MUST be replaced FIRST to avoid double-escaping.
    """
    return (text
            .replace("&", "&amp;")   # MUST be first!
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
            .replace("'", "&apos;"))