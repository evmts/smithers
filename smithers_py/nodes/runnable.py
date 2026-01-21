"""Runnable node implementations for Smithers."""

from typing import Any, Callable, Literal, Optional
from pydantic import Field

from .base import NodeBase


class ClaudeNode(NodeBase):
    """Claude agent node for LLM-powered execution.

    Executes a prompt using the specified model and manages conversation flow.
    Event callbacks are excluded from serialization but available for runtime use.
    """

    type: Literal["claude"] = "claude"
    model: str = Field(..., description="Model name (e.g., 'sonnet', 'opus', 'haiku')")
    prompt: str = Field(..., description="Prompt to send to Claude")
    max_turns: int = Field(default=50, description="Maximum conversation turns")

    # Event callbacks - excluded from serialization but available at runtime
    on_finished: Optional[Callable[[Any], None]] = Field(
        default=None,
        exclude=True,
        description="Callback fired when agent execution completes successfully"
    )
    on_error: Optional[Callable[[Exception], None]] = Field(
        default=None,
        exclude=True,
        description="Callback fired when agent execution fails with an error"
    )
    on_progress: Optional[Callable[[str], None]] = Field(
        default=None,
        exclude=True,
        description="Callback fired during streaming output for progress updates"
    )

    model_config = {
        "arbitrary_types_allowed": True,
        "extra": "forbid",
    }


__all__ = ["ClaudeNode"]