"""Smithers node models with discriminated union support."""

from typing import Annotated, Union
from pydantic import Field

# Import base classes and utilities
from .base import NodeBase, NodeHandlers, NodeMeta

# Import all node types
from .text import TextNode
from .structural import IfNode, PhaseNode, StepNode, RalphNode
from .control import WhileNode, FragmentNode, EachNode, StopNode, EndNode
from .runnable import ClaudeNode, ToolPolicy
from .effects import EffectNode

# Define the discriminated union using Pydantic v2 patterns
Node = Annotated[
    Union[
        # Text nodes
        TextNode,
        # Structural nodes
        IfNode,
        PhaseNode,
        StepNode,
        RalphNode,
        # Control flow nodes
        WhileNode,
        FragmentNode,
        EachNode,
        StopNode,
        EndNode,
        # Runnable nodes
        ClaudeNode,
        # Effect nodes
        EffectNode,
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
WhileNode.model_rebuild()
FragmentNode.model_rebuild()
EachNode.model_rebuild()
StopNode.model_rebuild()
EndNode.model_rebuild()
ClaudeNode.model_rebuild()
EffectNode.model_rebuild()

# Export all node types and the union
__all__ = [
    # Base classes
    "NodeBase",
    "NodeHandlers",
    "NodeMeta",
    # Union type
    "Node",
    # Text nodes
    "TextNode",
    # Structural nodes
    "IfNode",
    "PhaseNode",
    "StepNode",
    "RalphNode",
    # Control flow nodes
    "WhileNode",
    "FragmentNode",
    "EachNode",
    "StopNode",
    "EndNode",
    # Runnable nodes
    "ClaudeNode",
    "ToolPolicy",
    # Effect nodes
    "EffectNode",
]