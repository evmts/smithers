"""Structural node implementations for Smithers."""

from typing import Literal
from pydantic import Field

from .base import NodeBase


class IfNode(NodeBase):
    """Conditional node for branching logic.

    Renders children only if condition is True.
    """

    type: Literal["if"] = "if"
    condition: bool = Field(..., description="Whether to render children")

    model_config = {
        "extra": "allow",
    }


class PhaseNode(NodeBase):
    """Phase node for organizing execution into named phases.

    Phases represent major stages of execution and can contain steps.
    """

    type: Literal["phase"] = "phase"
    name: str = Field(..., description="Name of the phase")

    model_config = {
        "extra": "allow",
    }


class StepNode(NodeBase):
    """Step node for organizing execution into named steps.

    Steps represent smaller units of work within phases.
    """

    type: Literal["step"] = "step"
    name: str = Field(..., description="Name of the step")

    model_config = {
        "extra": "allow",
    }


class RalphNode(NodeBase):
    """Ralph loop node for iterative execution.

    Executes children repeatedly until a condition is met or max_iterations reached.
    """

    type: Literal["ralph"] = "ralph"
    id: str = Field(..., description="Unique identifier for the Ralph loop")
    max_iterations: int = Field(default=10, description="Maximum number of iterations")

    model_config = {
        "extra": "forbid",
    }


__all__ = ["IfNode", "PhaseNode", "StepNode", "RalphNode"]