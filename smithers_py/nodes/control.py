"""Control flow node implementations for Smithers."""

from typing import Literal, Optional
from pydantic import Field

from .base import NodeBase


class WhileNode(NodeBase):
    """While loop node for conditional iteration.

    Executes children repeatedly while condition evaluates to True.
    Requires explicit ID for stable identity across iterations.
    """

    type: Literal["while"] = "while"
    id: str = Field(..., description="Required unique identifier for the while loop")
    condition: bool = Field(..., description="Loop condition - continues while True")
    max_iterations: int = Field(
        default=100,
        ge=1,
        description="Maximum iterations to prevent infinite loops"
    )

    model_config = {
        "extra": "forbid",
    }


class FragmentNode(NodeBase):
    """Fragment node for grouping children without adding structure.

    Similar to React.Fragment, allows returning multiple children
    from a component without adding a wrapper element.
    """

    type: Literal["fragment"] = "fragment"

    model_config = {
        "extra": "forbid",
    }


class EachNode(NodeBase):
    """Each node for list rendering.

    Renders children for each item in a collection.
    Requires keys on children for stable identity.
    """

    type: Literal["each"] = "each"
    # Note: items would be passed via props at runtime
    # The actual iteration logic is handled by the runtime

    model_config = {
        "extra": "forbid",
    }


class StopNode(NodeBase):
    """Stop node for explicit execution termination.

    Signals that execution should stop when this node is reached.
    """

    type: Literal["stop"] = "stop"
    reason: Optional[str] = Field(
        default=None,
        description="Optional reason for stopping execution"
    )

    model_config = {
        "extra": "forbid",
    }


class EndNode(NodeBase):
    """End node for marking successful completion.

    Indicates that a phase or execution path has completed successfully.
    """

    type: Literal["end"] = "end"
    message: Optional[str] = Field(
        default=None,
        description="Optional completion message"
    )

    model_config = {
        "extra": "forbid",
    }


__all__ = ["WhileNode", "FragmentNode", "EachNode", "StopNode", "EndNode"]