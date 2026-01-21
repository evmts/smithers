"""Executor implementations for running agent nodes."""

from .base import ExecutorProtocol, AgentResult, TaskStatus, ToolCallRecord
from .retry import RateLimitCoordinator, ErrorClassifier, ErrorClass

# ClaudeExecutor has pydantic_ai dependency - import with fallback
try:
    from .claude import ClaudeExecutor
except ImportError:
    ClaudeExecutor = None  # type: ignore

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