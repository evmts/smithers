"""
Approval System.

Per PRD section 8.13 (Claude Code-style approvals):
- Block nodes until user approves/denies
- Support file_edit, command_exec, external_api approval kinds
- Integrate with MCP for UI notifications
"""

import asyncio
import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Literal, Optional, Callable


class ApprovalKind(str, Enum):
    """Types of approval requests."""
    FILE_EDIT = "file_edit"
    COMMAND_EXEC = "command_exec"
    EXTERNAL_API = "external_api"
    HUMAN_REVIEW = "human_review"


class ApprovalStatus(str, Enum):
    """Status of approval request."""
    PENDING = "pending"
    APPROVED = "approved"
    DENIED = "denied"
    EXPIRED = "expired"


@dataclass
class ApprovalRequest:
    """Approval request record."""
    id: str
    execution_id: str
    node_id: str
    kind: ApprovalKind
    payload: Dict[str, Any]
    status: ApprovalStatus = ApprovalStatus.PENDING
    prompt: str = ""
    options: List[Dict[str, Any]] = field(default_factory=list)
    metadata: Optional[Dict[str, Any]] = None
    requested_at: Optional[datetime] = None
    responded_at: Optional[datetime] = None
    responder: Optional[str] = None
    response: Optional[Dict[str, Any]] = None
    comment: Optional[str] = None


@dataclass
class ApprovalResult:
    """Result of an approval request."""
    approved: bool
    responder: Optional[str] = None
    comment: Optional[str] = None
    response_data: Optional[Dict[str, Any]] = None


class ApprovalSystem:
    """
    Manages approval requests and responses.
    
    Blocks node execution until user approves/denies via UI/MCP.
    All requests are persisted to SQLite for auditability.
    """
    
    def __init__(self, db_connection, execution_id: str):
        """
        Initialize approval system.
        
        Args:
            db_connection: SQLite connection
            execution_id: Current execution ID
        """
        self.db = db_connection
        self.execution_id = execution_id
        self._pending_requests: Dict[str, asyncio.Event] = {}
        self._results: Dict[str, ApprovalResult] = {}
        self._event_handlers: List[Callable[[ApprovalRequest], None]] = []
    
    def on_approval_requested(self, handler: Callable[[ApprovalRequest], None]) -> None:
        """Register handler for approval request events."""
        self._event_handlers.append(handler)
    
    async def request(
        self,
        node_id: str,
        kind: ApprovalKind,
        payload: Dict[str, Any],
        prompt: Optional[str] = None,
        options: Optional[List[Dict[str, Any]]] = None,
        metadata: Optional[Dict[str, Any]] = None,
        timeout: Optional[float] = None
    ) -> ApprovalResult:
        """
        Request approval and block until response received.
        
        Args:
            node_id: Node requesting approval
            kind: Type of approval (file_edit, command_exec, etc.)
            payload: Data for approval (diff, command, etc.)
            prompt: Human-readable prompt
            options: Available options for user
            metadata: Additional context
            timeout: Timeout in seconds (None = wait forever)
            
        Returns:
            ApprovalResult with decision
        """
        request_id = str(uuid.uuid4())
        now = datetime.now()
        
        # Generate default prompt if not provided
        if prompt is None:
            prompt = self._generate_prompt(kind, payload)
        
        # Create request record
        request = ApprovalRequest(
            id=request_id,
            execution_id=self.execution_id,
            node_id=node_id,
            kind=kind,
            payload=payload,
            prompt=prompt,
            options=options or [
                {"label": "Approve", "value": "approve"},
                {"label": "Deny", "value": "deny"}
            ],
            metadata=metadata,
            requested_at=now
        )
        
        # Persist to database
        self._save_request(request)
        
        # Create wait event
        wait_event = asyncio.Event()
        self._pending_requests[request_id] = wait_event
        
        # Notify handlers
        for handler in self._event_handlers:
            try:
                handler(request)
            except Exception:
                pass  # Don't fail on handler errors
        
        try:
            # Wait for response
            if timeout:
                await asyncio.wait_for(wait_event.wait(), timeout)
            else:
                await wait_event.wait()
            
            return self._results.get(request_id, ApprovalResult(approved=False))
            
        except asyncio.TimeoutError:
            # Mark as expired
            self._update_status(request_id, ApprovalStatus.EXPIRED)
            return ApprovalResult(approved=False, comment="Approval request expired")
        
        finally:
            self._pending_requests.pop(request_id, None)
    
    def respond(
        self,
        request_id: str,
        approved: bool,
        responder: Optional[str] = None,
        comment: Optional[str] = None,
        response_data: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        Respond to an approval request.
        
        Called by MCP tools or UI.
        
        Args:
            request_id: ID of the approval request
            approved: Whether approved or denied
            responder: Who responded (user ID, "auto", etc.)
            comment: Optional comment
            response_data: Additional response data
            
        Returns:
            True if response was recorded, False if request not found/pending
        """
        # Check if request exists and is pending
        row = self.db.execute(
            "SELECT status FROM approvals WHERE id = ?",
            (request_id,)
        ).fetchone()
        
        if not row or row[0] != ApprovalStatus.PENDING.value:
            return False
        
        now = datetime.now()
        status = ApprovalStatus.APPROVED if approved else ApprovalStatus.DENIED
        
        # Update database
        self.db.execute(
            """UPDATE approvals 
               SET status = ?, response = ?, responded_at = ?, responder = ?
               WHERE id = ?""",
            (
                status.value,
                json.dumps({"approved": approved, "comment": comment, "data": response_data}),
                now.isoformat(),
                responder,
                request_id
            )
        )
        self.db.commit()
        
        # Store result and signal waiting coroutine
        result = ApprovalResult(
            approved=approved,
            responder=responder,
            comment=comment,
            response_data=response_data
        )
        self._results[request_id] = result
        
        wait_event = self._pending_requests.get(request_id)
        if wait_event:
            wait_event.set()
        
        return True
    
    def list_pending(self) -> List[ApprovalRequest]:
        """List all pending approval requests for this execution."""
        rows = self.db.execute(
            """SELECT id, execution_id, node_id, type, prompt, options,
                      metadata, created_at
               FROM approvals 
               WHERE execution_id = ? AND status = 'pending'
               ORDER BY created_at ASC""",
            (self.execution_id,)
        ).fetchall()
        
        return [
            ApprovalRequest(
                id=row[0],
                execution_id=row[1],
                node_id=row[2],
                kind=ApprovalKind(row[3]) if row[3] else ApprovalKind.HUMAN_REVIEW,
                payload={},
                prompt=row[4] or "",
                options=json.loads(row[5]) if row[5] else [],
                metadata=json.loads(row[6]) if row[6] else None,
                requested_at=datetime.fromisoformat(row[7]) if row[7] else None
            )
            for row in rows
        ]
    
    def _save_request(self, request: ApprovalRequest) -> None:
        """Persist approval request to database."""
        self.db.execute(
            """INSERT INTO approvals 
               (id, execution_id, node_id, type, prompt, options, metadata, status, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                request.id,
                request.execution_id,
                request.node_id,
                request.kind.value,
                request.prompt,
                json.dumps(request.options),
                json.dumps(request.metadata) if request.metadata else None,
                request.status.value,
                request.requested_at.isoformat() if request.requested_at else None
            )
        )
        self.db.commit()
    
    def _update_status(self, request_id: str, status: ApprovalStatus) -> None:
        """Update approval request status."""
        self.db.execute(
            "UPDATE approvals SET status = ? WHERE id = ?",
            (status.value, request_id)
        )
        self.db.commit()
    
    def _generate_prompt(self, kind: ApprovalKind, payload: Dict[str, Any]) -> str:
        """Generate default prompt based on kind and payload."""
        if kind == ApprovalKind.FILE_EDIT:
            path = payload.get("path", "unknown file")
            return f"Approve file edit to {path}?"
        elif kind == ApprovalKind.COMMAND_EXEC:
            cmd = payload.get("command", "unknown command")
            return f"Approve execution of: {cmd}?"
        elif kind == ApprovalKind.EXTERNAL_API:
            api = payload.get("api", "external API")
            return f"Approve call to {api}?"
        else:
            return "Approval required"


# Convenience function for file edit approvals with diff
def create_file_edit_approval(
    path: str,
    old_content: str,
    new_content: str,
    operation: Literal["create", "modify", "delete"] = "modify"
) -> Dict[str, Any]:
    """
    Create file edit approval payload.
    
    Args:
        path: File path
        old_content: Original content (empty for create)
        new_content: New content (empty for delete)
        operation: Type of file operation
        
    Returns:
        Payload dict for approval request
    """
    return {
        "path": path,
        "old_content": old_content,
        "new_content": new_content,
        "operation": operation,
        # Could add unified diff here
    }


# Convenience function for command execution approvals
def create_command_exec_approval(
    command: str,
    working_dir: Optional[str] = None,
    env: Optional[Dict[str, str]] = None,
    estimated_duration: Optional[str] = None
) -> Dict[str, Any]:
    """
    Create command execution approval payload.
    
    Args:
        command: Command to execute
        working_dir: Working directory
        env: Environment variables
        estimated_duration: Estimated runtime
        
    Returns:
        Payload dict for approval request
    """
    return {
        "command": command,
        "working_dir": working_dir,
        "env": env,
        "estimated_duration": estimated_duration
    }


__all__ = [
    "ApprovalSystem", 
    "ApprovalKind", 
    "ApprovalStatus",
    "ApprovalRequest", 
    "ApprovalResult",
    "create_file_edit_approval",
    "create_command_exec_approval"
]
