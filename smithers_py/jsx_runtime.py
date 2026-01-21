"""JSX Runtime for SmithersPy.

This module provides the JSX transformation runtime for Python components,
allowing JSX syntax to be transpiled into proper SmithersPy node trees.
"""

from typing import Any, Callable, Dict, List, Union, Optional

from smithers_py.errors import EventValidationError
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


def Fragment(children: List[Node], **props: Any) -> List[Node]:
    """Fragment component for grouping children without a wrapper node.

    Args:
        children: List of child nodes to group
        **props: Additional props (typically unused for fragments)

    Returns:
        Flattened list of children
    """
    return _normalize_children(children)


# Registry mapping JSX tag names to their corresponding node constructors
INTRINSICS: Dict[str, Callable[..., Node]] = {
    "if": IfNode,
    "phase": PhaseNode,
    "step": StepNode,
    "ralph": RalphNode,
    "claude": ClaudeNode,
}

# Observable nodes that support event callbacks
OBSERVABLE_NODES = {ClaudeNode}

# Valid event prop names for observable nodes
EVENT_PROPS = {"on_finished", "on_error", "on_progress"}


def _normalize_children(children: Any) -> List[Node]:
    """Normalize children into a flat list of Node instances.

    Args:
        children: Raw children - can be strings, Node instances, lists, or other values

    Returns:
        Flattened list of Node instances
    """
    if children is None:
        return []

    if isinstance(children, str):
        return [TextNode(text=children)]

    if isinstance(children, NodeBase):
        return [children]

    if isinstance(children, list):
        result = []
        for child in children:
            result.extend(_normalize_children(child))
        return result

    # Convert other types to text nodes
    return [TextNode(text=str(children))]


def _validate_event_props(node_class: type, props: Dict[str, Any]) -> None:
    """Validate that event props are only used on observable nodes.

    Args:
        node_class: The node class being instantiated
        props: The props dictionary to validate

    Raises:
        ValueError: If event props are used on non-observable nodes
    """
    if node_class in OBSERVABLE_NODES:
        return  # Event props are allowed on observable nodes

    # Check for any event props on non-observable nodes
    for prop_name in props.keys():
        if prop_name in EVENT_PROPS:
            raise EventValidationError(node_class.__name__, prop_name)


def jsx(type_: Union[str, Callable], props: Dict[str, Any] = None, *children: Any) -> Union[Node, List[Node]]:
    """JSX transformation function called by the transpiler.

    This function handles the conversion of JSX elements into SmithersPy nodes.

    Args:
        type_: Either a string (intrinsic element) or callable (component function)
        props: Element props dictionary
        *children: Variable arguments representing child elements

    Returns:
        A Node instance or list of Nodes (for fragments)

    Raises:
        ValueError: If intrinsic type is unknown or event props are misused
        TypeError: If component function fails
    """
    if props is None:
        props = {}

    # Normalize children from varargs
    normalized_children = _normalize_children(list(children))

    # Handle string types (intrinsic elements)
    if isinstance(type_, str):
        if type_ not in INTRINSICS:
            raise ValueError(f"Unknown intrinsic element: '{type_}'. Available: {list(INTRINSICS.keys())}")

        node_class = INTRINSICS[type_]

        # Validate event props before creating the node
        _validate_event_props(node_class, props)

        # Create the node with normalized children
        return node_class(children=normalized_children, **props)

    # Handle callable types (component functions)
    if callable(type_):
        try:
            # Call the component function with props and children
            result = type_(children=normalized_children, **props)

            # If component returns a list (like Fragment), return as-is
            if isinstance(result, list):
                return result

            # Otherwise ensure we return a Node
            if isinstance(result, NodeBase):
                return result

            # Convert other return values to text nodes
            return TextNode(text=str(result))

        except Exception as e:
            raise TypeError(f"Component function {type_.__name__} failed: {e}") from e

    raise TypeError(f"Invalid JSX type: {type_}. Expected string or callable, got {type(type_).__name__}")


# Export the main JSX function and Fragment for use by transpiled code
__all__ = ["jsx", "Fragment"]