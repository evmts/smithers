"""Text node implementation for Smithers."""

from typing import Literal
from pydantic import Field

from .base import NodeBase


class TextNode(NodeBase):
    """Simple text content node.

    Used for string literals or text content within the plan tree.
    """

    type: Literal["text"] = "text"
    text: str = Field(..., description="The text content of this node")

    model_config = {
        "extra": "forbid",
    }


__all__ = ["TextNode"]