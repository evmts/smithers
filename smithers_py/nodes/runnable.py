"""Runnable node implementations for Smithers."""

from typing import Any, Callable, List, Literal, Optional, Type
from pydantic import BaseModel, Field, model_validator

from .base import NodeBase, Node


class ToolPolicy(BaseModel):
    """Tool policy configuration for agent nodes."""

    allowed: Optional[List[str]] = Field(
        default=None,
        description="List of allowed tool names. None means all tools allowed."
    )
    denied: Optional[List[str]] = Field(
        default_factory=list,
        description="List of explicitly denied tool names."
    )

    model_config = {
        "extra": "forbid",
    }


class ClaudeNode(NodeBase):
    """Claude agent node for LLM-powered execution.

    Executes a prompt using the specified model and manages conversation flow.
    Implements the LLMNode interface from the spec with tool policies and
    structured output support.
    """

    type: Literal["claude"] = "claude"
    model: str = Field(..., description="Model name (e.g., 'sonnet', 'opus', 'haiku')")
    prompt: str = Field(
        ...,
        description="Prompt to send to Claude"
    )
    tools: ToolPolicy = Field(
        default_factory=ToolPolicy,
        description="Tool access policy for this agent"
    )
    output_schema: Optional[Type[BaseModel]] = Field(
        default=None,
        exclude=True,  # Type objects can't be serialized
        description="Optional Pydantic model for structured output validation",
        alias="schema"  # Allow 'schema' as input alias for backwards compatibility
    )
    max_turns: int = Field(default=50, description="Maximum conversation turns")

    # For backward compatibility, accept on_* parameters at initialization
    # and move them to handlers
    def __init__(self, **data):
        # Extract handler callbacks if provided directly
        on_finished = data.pop('on_finished', None)
        on_error = data.pop('on_error', None)
        on_progress = data.pop('on_progress', None)

        # Initialize with base data
        super().__init__(**data)

        # Set handlers if provided
        if on_finished is not None:
            self.handlers.on_finished = on_finished
        if on_error is not None:
            self.handlers.on_error = on_error
        if on_progress is not None:
            self.handlers.on_progress = on_progress

    @property
    def on_finished(self) -> Optional[Callable[[Any], None]]:
        """Access on_finished handler for backward compatibility."""
        return self.handlers.on_finished

    @on_finished.setter
    def on_finished(self, value: Optional[Callable[[Any], None]]):
        """Set on_finished handler for backward compatibility."""
        self.handlers.on_finished = value

    @property
    def on_error(self) -> Optional[Callable[[Exception], None]]:
        """Access on_error handler for backward compatibility."""
        return self.handlers.on_error

    @on_error.setter
    def on_error(self, value: Optional[Callable[[Exception], None]]):
        """Set on_error handler for backward compatibility."""
        self.handlers.on_error = value

    @property
    def on_progress(self) -> Optional[Callable[[str], None]]:
        """Access on_progress handler for backward compatibility."""
        return self.handlers.on_progress

    @on_progress.setter
    def on_progress(self, value: Optional[Callable[[str], None]]):
        """Set on_progress handler for backward compatibility."""
        self.handlers.on_progress = value

    model_config = {
        "arbitrary_types_allowed": True,
        "extra": "forbid",
    }


__all__ = ["ClaudeNode", "ToolPolicy"]