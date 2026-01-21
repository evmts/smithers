"""Base executor protocol and result types for smithers-py.

Defines the executor interface that all agent executors must implement,
along with common result and status types.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Any, AsyncIterator, Dict, List, Optional, Protocol, Type, Union
from pydantic import BaseModel


class TaskStatus(str, Enum):
    """Status of a task/agent execution."""

    PENDING = "pending"
    RUNNING = "running"
    DONE = "done"
    ERROR = "error"
    CANCELLED = "cancelled"
    ORPHANED = "orphaned"
    BLOCKED = "blocked"  # Rate limited, awaiting approval, etc.


@dataclass
class ToolCallRecord:
    """Record of a single tool call made during agent execution."""

    tool_name: str
    input_data: Dict[str, Any]
    output_data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    duration_ms: Optional[int] = None


@dataclass
class TokenUsage:
    """Token usage statistics for model calls."""

    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0

    def __add__(self, other: "TokenUsage") -> "TokenUsage":
        return TokenUsage(
            prompt_tokens=self.prompt_tokens + other.prompt_tokens,
            completion_tokens=self.completion_tokens + other.completion_tokens,
            total_tokens=self.total_tokens + other.total_tokens,
        )


@dataclass
class AgentResult:
    """Result of an agent execution."""

    # Core fields
    run_id: str
    node_id: str
    status: TaskStatus
    model: str

    # Timing
    started_at: datetime
    ended_at: Optional[datetime] = None

    # Execution details
    turns_used: int = 0
    max_turns: int = 50
    usage: TokenUsage = None

    # Output
    output_text: Optional[str] = None
    output_structured: Optional[Dict[str, Any]] = None

    # Tool usage
    tool_calls: List[ToolCallRecord] = None

    # Error info (if status=ERROR)
    error: Optional[Exception] = None
    error_message: Optional[str] = None
    error_type: Optional[str] = None

    def __post_init__(self):
        if self.usage is None:
            self.usage = TokenUsage()
        if self.tool_calls is None:
            self.tool_calls = []


class StreamEvent(BaseModel):
    """Event emitted during streaming agent execution."""

    kind: str  # "token", "tool_start", "tool_end", "thinking"
    payload: Dict[str, Any]
    timestamp: datetime = None

    def __init__(self, **data):
        if "timestamp" not in data:
            data["timestamp"] = datetime.now()
        super().__init__(**data)


class ExecutorProtocol(Protocol):
    """Protocol that all executor implementations must follow.

    Executors are responsible for running agent nodes (Claude, etc.) and
    managing their lifecycle including streaming, tool calls, and persistence.
    """

    async def execute(
        self,
        node_id: str,
        prompt: str,
        model: str,
        max_turns: int = 50,
        tools: Optional[Dict[str, Any]] = None,
        schema: Optional[Type[BaseModel]] = None,
        resume_from: Optional[str] = None,
    ) -> AsyncIterator[Union[StreamEvent, AgentResult]]:
        """Execute an agent node.

        Args:
            node_id: Unique identifier for the node being executed
            prompt: The prompt to send to the agent
            model: Model name to use (e.g., "claude-3-sonnet-20240229")
            max_turns: Maximum conversation turns before stopping
            tools: Available tools as {name: function} mapping
            schema: Optional Pydantic model for structured output
            resume_from: Optional run_id to resume from previous execution

        Yields:
            StreamEvent for real-time updates (tokens, tool calls, etc.)
            AgentResult as the final event with complete execution info
        """
        ...

    async def cancel(self, run_id: str) -> bool:
        """Cancel a running execution.

        Args:
            run_id: The execution to cancel

        Returns:
            True if cancelled, False if not found or already complete
        """
        ...