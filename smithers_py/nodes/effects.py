"""Effect node implementation for Smithers."""

from typing import Any, Callable, List, Literal, Optional
from pydantic import Field

from .base import NodeBase


class EffectNode(NodeBase):
    """Effect node for running side effects after commit phase.

    Effects are first-class observable nodes that run after state commits.
    They can track dependencies and run cleanup functions.
    """

    type: Literal["effect"] = "effect"
    id: str = Field(..., description="Required unique identifier for the effect")
    deps: List[Any] = Field(
        default_factory=list,
        description="Dependency values that trigger re-execution when changed"
    )
    run: Optional[Callable[[], None]] = Field(
        default=None,
        exclude=True,  # Excluded from serialization
        description="Effect function to execute"
    )
    cleanup: Optional[Callable[[], None]] = Field(
        default=None,
        exclude=True,  # Excluded from serialization
        description="Optional cleanup function to run before re-execution or unmount"
    )
    phase: Literal["post_commit"] = Field(
        default="post_commit",
        description="When the effect runs in the frame lifecycle"
    )

    model_config = {
        "arbitrary_types_allowed": True,
        "extra": "forbid",
    }


__all__ = ["EffectNode"]