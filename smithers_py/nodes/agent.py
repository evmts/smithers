"""Agent node implementations for Smithers."""

from typing import Dict, Any, Literal, Optional
from pydantic import Field

from .base import NodeBase
from .runnable import ToolPolicy


class SmithersNode(NodeBase):
    """Smithers subagent node for nested orchestration.

    Executes a sub-orchestration plan within the current execution context.
    Allows for composable, modular orchestration patterns.
    """

    type: Literal["smithers"] = "smithers"
    name: str = Field(..., description="Name for this subagent execution")
    component: str = Field(
        ...,
        description="Component/function name to execute as subagent"
    )
    args: Dict[str, Any] = Field(
        default_factory=dict,
        description="Arguments to pass to the subagent component"
    )
    tools: ToolPolicy = Field(
        default_factory=ToolPolicy,
        description="Tool access policy for this subagent"
    )
    max_frames: int = Field(
        default=1000,
        ge=1,
        description="Maximum frames the subagent can execute"
    )
    inherit_context: bool = Field(
        default=True,
        description="Whether to inherit parent execution context"
    )

    model_config = {
        "extra": "forbid",
    }


__all__ = ["SmithersNode"]