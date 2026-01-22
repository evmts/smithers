"""Base classes for Smithers node models."""

from __future__ import annotations

from typing import Any, Callable, Union, Optional, List, Dict
from pydantic import BaseModel, Field, field_validator


class NodeHandlers(BaseModel):
    """Event handlers for node lifecycle events.

    Supports both naming conventions:
    - snake_case: on_finished, on_error, on_progress
    - camelCase: onFinished, onError, onProgress
    """

    model_config = {
        "arbitrary_types_allowed": True,
        "extra": "allow",  # Allow arbitrary event handlers
    }

    # Pre-defined handlers for type safety
    on_finished: Optional[Callable] = None
    on_error: Optional[Callable] = None
    on_progress: Optional[Callable] = None

    def __init__(self, **data):
        """Initialize handlers, validating that all fields follow event naming pattern."""
        # Validate all provided handlers follow the pattern
        for key, value in data.items():
            # Accept both 'on_xxx' (snake_case) and 'onXxx' (camelCase)
            is_snake_case = key.startswith('on_')
            is_camel_case = len(key) > 2 and key.startswith('on') and key[2].isupper()
            if not (is_snake_case or is_camel_case):
                raise ValueError(f"Handler name '{key}' must start with 'on_' (snake_case) or 'on' followed by uppercase (camelCase)")
            if value is not None and not callable(value):
                raise ValueError(f"Handler '{key}' must be callable or None")
        super().__init__(**data)

    def __getattr__(self, name: str) -> Optional[Callable]:
        """Access handler by name, returning None if not set."""
        if name.startswith('_'):
            raise AttributeError(name)
        # Check model_extra for dynamically added handlers
        if hasattr(self, '__pydantic_extra__') and self.__pydantic_extra__:
            if name in self.__pydantic_extra__:
                return self.__pydantic_extra__[name]
        return None


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