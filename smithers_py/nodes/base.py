"""Base classes for Smithers node models."""

from __future__ import annotations

from typing import Any, Callable, Union, Optional, List, Dict
from pydantic import BaseModel, Field, field_validator


class NodeHandlers(BaseModel):
    """Event handlers for node lifecycle events."""

    on_finished: Optional[Callable[[Any], None]] = Field(
        default=None,
        description="Callback fired when node execution completes successfully"
    )
    on_error: Optional[Callable[[Exception], None]] = Field(
        default=None,
        description="Callback fired when node execution fails with an error"
    )
    on_progress: Optional[Callable[[str], None]] = Field(
        default=None,
        description="Callback fired during streaming output for progress updates"
    )

    model_config = {
        "arbitrary_types_allowed": True,
    }


class NodeMeta(BaseModel):
    """Metadata for node tracking and debugging."""

    source_file: Optional[str] = None
    source_line: Optional[int] = None
    created_at_frame: Optional[int] = None
    last_seen_frame: Optional[int] = None

    model_config = {
        "extra": "allow",  # Allow additional metadata fields
    }


class NodeBase(BaseModel):
    """Base class for all Smithers nodes.

    Provides common fields and serialization behavior for the node tree.
    All nodes must have a type field for discrimination and can optionally
    have a key for identity, props for configuration, and children.
    """

    type: str
    key: Optional[str] = None
    children: list["Node"] = Field(default_factory=list)
    props: Dict[str, Any] = Field(default_factory=dict)
    handlers: NodeHandlers = Field(default_factory=NodeHandlers, exclude=True)
    meta: NodeMeta = Field(default_factory=NodeMeta)

    @field_validator('key', mode='before')
    @classmethod
    def convert_key_to_string(cls, v):
        """Convert numeric keys to strings for consistent identity."""
        if v is None:
            return v
        return str(v)

    model_config = {
        "arbitrary_types_allowed": True,
        "extra": "forbid",
    }


# The discriminated union will be properly defined in __init__.py after imports
# This is a placeholder for forward references
Node = Any  # Will be updated in __init__.py

__all__ = ["NodeBase", "NodeHandlers", "NodeMeta", "Node"]