"""Smithers node models with discriminated union support."""

from typing import Annotated, Union
from pydantic import Field

# Import all node classes
from .base import NodeBase
from .text import TextNode
from .structural import IfNode, PhaseNode, StepNode, RalphNode
from .runnable import ClaudeNode

# Define the discriminated union using Pydantic v2 patterns
Node = Annotated[
    Union[
        TextNode,
        IfNode,
        PhaseNode,
        StepNode,
        RalphNode,
        ClaudeNode,
    ],
    Field(discriminator="type"),
]

# Update the forward references in all node classes
NodeBase.model_rebuild()
TextNode.model_rebuild()
IfNode.model_rebuild()
PhaseNode.model_rebuild()
StepNode.model_rebuild()
RalphNode.model_rebuild()
ClaudeNode.model_rebuild()

# Export all node types and the union
__all__ = [
    # Base class
    "NodeBase",
    # Union type
    "Node",
    # Text nodes
    "TextNode",
    # Structural nodes
    "IfNode",
    "PhaseNode",
    "StepNode",
    "RalphNode",
    # Runnable nodes
    "ClaudeNode",
]