"""MCP Streaming Notifications for Smithers.

Per PRD section 10.5: Event types for SSE streaming to clients.
Covers frame lifecycle, node/task updates, agent streaming, and approvals.
"""

from dataclasses import dataclass, asdict
from typing import Literal, Optional, Dict, Any, TYPE_CHECKING

if TYPE_CHECKING:
    from .server import McpCore


@dataclass
class FrameCreatedEvent:
    """smithers.frame.created notification - new execution frame."""
    execution_id: str
    frame_index: int
    reason: str
    state_keys_changed: list[str]


@dataclass
class NodeUpdatedEvent:
    """smithers.node.updated notification - node status change."""
    execution_id: str
    node_id: str
    status: str  # NodeStatus enum value
    run_id: Optional[str] = None


@dataclass
class TaskUpdatedEvent:
    """smithers.task.updated notification - task status change."""
    execution_id: str
    task_id: str
    status: str  # TaskStatus enum value


@dataclass
class AgentStreamEvent:
    """smithers.agent.stream notification - streaming tokens/tool calls."""
    execution_id: str
    run_id: str
    chunk_type: Literal["token", "tool_start", "tool_end", "thinking"]
    payload: Dict[str, Any]


@dataclass
class ApprovalRequestedEvent:
    """smithers.approval.requested notification - human approval needed."""
    execution_id: str
    approval_id: str
    kind: str
    node_id: str


@dataclass
class ExecutionStatusEvent:
    """smithers.execution.status notification - execution lifecycle."""
    execution_id: str
    status: str  # ExecutionStatus enum value
    reason: Optional[str] = None


class NotificationEmitter:
    """Emitter for MCP notifications to SSE clients.
    
    Wraps McpCore.emit_event with typed event helpers.
    """
    
    def __init__(self, core: 'McpCore'):
        self.core = core
    
    async def frame_created(self, event: FrameCreatedEvent) -> int:
        """Emit smithers.frame.created notification."""
        return await self.core.emit_event("smithers.frame.created", asdict(event))
    
    async def node_updated(self, event: NodeUpdatedEvent) -> int:
        """Emit smithers.node.updated notification."""
        return await self.core.emit_event("smithers.node.updated", asdict(event))
    
    async def task_updated(self, event: TaskUpdatedEvent) -> int:
        """Emit smithers.task.updated notification."""
        return await self.core.emit_event("smithers.task.updated", asdict(event))
    
    async def agent_stream(self, event: AgentStreamEvent) -> int:
        """Emit smithers.agent.stream notification."""
        return await self.core.emit_event("smithers.agent.stream", asdict(event))
    
    async def approval_requested(self, event: ApprovalRequestedEvent) -> int:
        """Emit smithers.approval.requested notification."""
        return await self.core.emit_event("smithers.approval.requested", asdict(event))
    
    async def execution_status(self, event: ExecutionStatusEvent) -> int:
        """Emit smithers.execution.status notification."""
        return await self.core.emit_event("smithers.execution.status", asdict(event))
