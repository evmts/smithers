"""Base classes for Smithers node models."""

from __future__ import annotations

from typing import Any, Callable, Union, Optional, List
from pydantic import BaseModel, Field, field_validator


class NodeBase(BaseModel):
    """Base class for all Smithers nodes.

    Provides common fields and serialization behavior for the node tree.
    All nodes have a key for identity and can contain children.
    """

    key: Optional[str] = None
    children: list["Node"] = Field(default_factory=list)

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

__all__ = ["NodeBase", "Node"]