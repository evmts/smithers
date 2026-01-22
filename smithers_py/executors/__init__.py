"""Executor implementations for running agent nodes."""

from .base import ExecutorProtocol, AgentResult, TaskStatus, ToolCallRecord
from .retry import RateLimitCoordinator, ErrorClassifier, ErrorClass

# ClaudeExecutor has pydantic_ai dependency - import with clear error
try:
    from .claude import ClaudeExecutor
except ImportError as e:
    _import_error = e
    class ClaudeExecutor:  # type: ignore
        """Placeholder that raises a helpful error when pydantic_ai is missing."""
        def __init__(self, *args, **kwargs):
            raise ImportError(
                "ClaudeExecutor requires pydantic-ai. Install with: pip install pydantic-ai>=0.1.0\n"
                f"Original error: {_import_error}"
            )

__all__ = [
    "ExecutorProtocol",
    "AgentResult",
    "TaskStatus",
    "ToolCallRecord",
    "ClaudeExecutor",
    "RateLimitCoordinator",
    "ErrorClassifier",
    "ErrorClass",
]