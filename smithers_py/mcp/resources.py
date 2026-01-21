"""MCP Resources implementation for Smithers.

Provides access to execution state, frames, events, and artifacts via
standard MCP resource URIs.
"""

import json
import re
from dataclasses import dataclass, asdict, field
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple, Union, Literal
from urllib.parse import urlparse, parse_qs
import sqlite3

from pydantic import BaseModel, Field, validator, ConfigDict


class MCPResource(BaseModel):
    """Base resource model for MCP responses."""
    model_config = ConfigDict(extra='allow')

    uri: str
    mime_type: str = "application/json"
    data: Optional[Union[str, Dict[str, Any]]] = None
    metadata: Optional[Dict[str, Any]] = None

    def to_response(self) -> Dict[str, Any]:
        """Convert to MCP response format."""
        response = {
            "uri": self.uri,
            "mimeType": self.mime_type,
        }
        if self.data is not None:
            if isinstance(self.data, str):
                response["contents"] = self.data
            else:
                response["contents"] = json.dumps(self.data, indent=2, default=str)
        if self.metadata:
            response["metadata"] = self.metadata
        return response


class ExecutionSummary(BaseModel):
    """Summary of an execution."""
    id: str
    name: str
    source_file: str
    status: str
    created_at: str
    updated_at: str
    current_frame: int
    total_frames: int
    phase_path: Optional[str] = None
    step_index: Optional[int] = None
    error: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    correlation_id: Optional[str] = None


class FrameSummary(BaseModel):
    """Summary of a frame."""
    sequence: int
    created_at: str
    status: str
    node_count: int
    active_nodes: int
    phase_path: Optional[str] = None
    step_index: Optional[int] = None
    error: Optional[str] = None


class NodeInstanceSummary(BaseModel):
    """Summary of a node instance."""
    node_id: str
    node_type: str
    path: str
    status: str
    created_at: str
    updated_at: Optional[str] = None
    error: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class EventSummary(BaseModel):
    """Summary of an event."""
    id: int
    type: str
    created_at: str
    frame_seq: Optional[int] = None
    node_id: Optional[str] = None
    data: Optional[Dict[str, Any]] = None


class ArtifactSummary(BaseModel):
    """Summary of an artifact."""
    id: str
    type: str
    name: str
    created_at: str
    updated_at: str
    size: int
    metadata: Optional[Dict[str, Any]] = None


class ApprovalSummary(BaseModel):
    """Summary of a pending approval."""
    id: str
    node_id: str
    type: str
    prompt: str
    created_at: str
    options: List[Dict[str, Any]] = Field(default_factory=list)
    metadata: Optional[Dict[str, Any]] = None


class PaginatedResponse(BaseModel):
    """Paginated response wrapper."""
    items: List[Any]
    total: int
    page: int
    per_page: int
    has_next: bool
    has_prev: bool
    next_cursor: Optional[str] = None
    prev_cursor: Optional[str] = None


class MCPResourceProvider:
    """Provider for MCP resources from Smithers state."""

    RESOURCE_PATTERNS = [
        # Execution resources
        (r"^smithers://executions$", "list_executions"),
        (r"^smithers://executions/([^/]+)$", "get_execution"),
        (r"^smithers://executions/([^/]+)/frames$", "list_frames"),
        (r"^smithers://executions/([^/]+)/frames/(\d+)$", "get_frame"),
        (r"^smithers://executions/([^/]+)/events$", "list_events"),
        (r"^smithers://executions/([^/]+)/nodes/([^/]+)$", "get_node"),
        (r"^smithers://executions/([^/]+)/nodes/([^/]+)/runs$", "list_node_runs"),
        (r"^smithers://executions/([^/]+)/artifacts$", "list_artifacts"),
        (r"^smithers://executions/([^/]+)/approvals$", "list_approvals"),
        # Global resources
        (r"^smithers://scripts$", "list_scripts"),
        (r"^smithers://health$", "get_health"),
    ]

    def __init__(self, db_path: str):
        """Initialize with path to SQLite database."""
        self.db_path = db_path

    def get_connection(self) -> sqlite3.Connection:
        """Get database connection with row factory."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def resolve(self, uri: str) -> Optional[MCPResource]:
        """Resolve a URI to a resource."""
        parsed = urlparse(uri)
        if parsed.scheme != "smithers":
            return None

        # Extract query parameters for pagination
        query_params = parse_qs(parsed.query)
        page = int(query_params.get("page", ["1"])[0])
        per_page = int(query_params.get("per_page", ["20"])[0])
        cursor = query_params.get("cursor", [None])[0]

        # Find matching pattern
        path = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
        for pattern, handler_name in self.RESOURCE_PATTERNS:
            match = re.match(pattern, path)
            if match:
                handler = getattr(self, handler_name, None)
                if handler:
                    try:
                        return handler(*match.groups(), page=page, per_page=per_page, cursor=cursor)
                    except Exception as e:
                        return MCPResource(
                            uri=uri,
                            data={"error": str(e), "type": "error"},
                            mime_type="application/json"
                        )

        return MCPResource(
            uri=uri,
            data={"error": f"Unknown resource: {uri}", "type": "not_found"},
            mime_type="application/json"
        )

    def list_executions(self, page: int = 1, per_page: int = 20, cursor: Optional[str] = None) -> MCPResource:
        """List all executions (paginated)."""
        offset = (page - 1) * per_page

        with self.get_connection() as conn:
            # Count total
            total = conn.execute("SELECT COUNT(*) FROM executions").fetchone()[0]

            # Get page of results
            rows = conn.execute("""
                SELECT
                    e.id, e.name, e.source_file, e.status,
                    e.created_at, e.updated_at,
                    e.correlation_id,
                    (SELECT COUNT(*) FROM frames WHERE execution_id = e.id) as total_frames,
                    (SELECT MAX(sequence) FROM frames WHERE execution_id = e.id) as current_frame,
                    (SELECT phase_path FROM frames WHERE execution_id = e.id ORDER BY sequence DESC LIMIT 1) as phase_path,
                    (SELECT step_index FROM frames WHERE execution_id = e.id ORDER BY sequence DESC LIMIT 1) as step_index,
                    (SELECT error FROM frames WHERE execution_id = e.id AND error IS NOT NULL ORDER BY sequence DESC LIMIT 1) as error
                FROM executions e
                ORDER BY e.created_at DESC
                LIMIT ? OFFSET ?
            """, (per_page, offset)).fetchall()

            executions = []
            for row in rows:
                exec_dict = dict(row)
                # Parse tags from JSON if stored
                tags = []
                tag_rows = conn.execute("SELECT tag FROM execution_tags WHERE execution_id = ?", (row['id'],)).fetchall()
                tags = [t['tag'] for t in tag_rows]

                executions.append(ExecutionSummary(
                    id=exec_dict['id'],
                    name=exec_dict['name'] or f"Execution {exec_dict['id'][:8]}",
                    source_file=exec_dict['source_file'],
                    status=exec_dict['status'],
                    created_at=exec_dict['created_at'],
                    updated_at=exec_dict['updated_at'] or exec_dict['created_at'],
                    current_frame=exec_dict['current_frame'] or 0,
                    total_frames=exec_dict['total_frames'] or 0,
                    phase_path=exec_dict.get('phase_path'),
                    step_index=exec_dict.get('step_index'),
                    error=exec_dict.get('error'),
                    tags=tags,
                    correlation_id=exec_dict.get('correlation_id')
                ))

        has_next = (page * per_page) < total
        has_prev = page > 1

        response = PaginatedResponse(
            items=[e.model_dump() for e in executions],
            total=total,
            page=page,
            per_page=per_page,
            has_next=has_next,
            has_prev=has_prev,
            next_cursor=str(page + 1) if has_next else None,
            prev_cursor=str(page - 1) if has_prev else None
        )

        return MCPResource(
            uri="smithers://executions",
            data=response.model_dump(),
            metadata={"resource_type": "execution_list"}
        )

    def get_execution(self, execution_id: str, **kwargs) -> MCPResource:
        """Get execution detail."""
        with self.get_connection() as conn:
            row = conn.execute("""
                SELECT
                    e.id, e.name, e.source_file, e.status,
                    e.created_at, e.updated_at,
                    e.correlation_id, e.config,
                    (SELECT COUNT(*) FROM frames WHERE execution_id = e.id) as total_frames,
                    (SELECT MAX(sequence) FROM frames WHERE execution_id = e.id) as current_frame
                FROM executions e
                WHERE e.id = ?
            """, (execution_id,)).fetchone()

            if not row:
                return MCPResource(
                    uri=f"smithers://executions/{execution_id}",
                    data={"error": f"Execution {execution_id} not found", "type": "not_found"},
                )

            exec_dict = dict(row)

            # Get latest frame info
            latest_frame = conn.execute("""
                SELECT phase_path, step_index, error
                FROM frames
                WHERE execution_id = ?
                ORDER BY sequence DESC
                LIMIT 1
            """, (execution_id,)).fetchone()

            if latest_frame:
                exec_dict.update(dict(latest_frame))

            # Get tags
            tags = [t['tag'] for t in conn.execute(
                "SELECT tag FROM execution_tags WHERE execution_id = ?",
                (execution_id,)
            ).fetchall()]

            # Get node statistics
            node_stats = conn.execute("""
                SELECT
                    COUNT(*) as total_nodes,
                    COUNT(CASE WHEN status = 'active' THEN 1 END) as active_nodes,
                    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_nodes,
                    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_nodes
                FROM node_instances
                WHERE execution_id = ?
            """, (execution_id,)).fetchone()

            exec_data = {
                **exec_dict,
                "tags": tags,
                "node_stats": dict(node_stats) if node_stats else {},
                "config": json.loads(exec_dict["config"]) if exec_dict.get("config") else None
            }

            return MCPResource(
                uri=f"smithers://executions/{execution_id}",
                data=exec_data,
                metadata={"resource_type": "execution_detail"}
            )

    def list_frames(self, execution_id: str, page: int = 1, per_page: int = 20, cursor: Optional[str] = None) -> MCPResource:
        """List frames for an execution (cursored)."""
        offset = (page - 1) * per_page

        with self.get_connection() as conn:
            # Verify execution exists
            exec_exists = conn.execute("SELECT 1 FROM executions WHERE id = ?", (execution_id,)).fetchone()
            if not exec_exists:
                return MCPResource(
                    uri=f"smithers://executions/{execution_id}/frames",
                    data={"error": f"Execution {execution_id} not found", "type": "not_found"},
                )

            # Count total frames
            total = conn.execute("SELECT COUNT(*) FROM frames WHERE execution_id = ?", (execution_id,)).fetchone()[0]

            # Get frames
            rows = conn.execute("""
                SELECT
                    f.sequence, f.created_at, f.status,
                    f.phase_path, f.step_index, f.error,
                    (SELECT COUNT(*) FROM frame_nodes WHERE frame_id = f.id) as node_count,
                    (SELECT COUNT(*) FROM frame_nodes WHERE frame_id = f.id AND status = 'active') as active_nodes
                FROM frames f
                WHERE f.execution_id = ?
                ORDER BY f.sequence DESC
                LIMIT ? OFFSET ?
            """, (execution_id, per_page, offset)).fetchall()

            frames = []
            for row in rows:
                frames.append(FrameSummary(
                    sequence=row['sequence'],
                    created_at=row['created_at'],
                    status=row['status'] or 'completed',
                    node_count=row['node_count'],
                    active_nodes=row['active_nodes'],
                    phase_path=row['phase_path'],
                    step_index=row['step_index'],
                    error=row['error']
                ))

        has_next = (page * per_page) < total
        has_prev = page > 1

        response = PaginatedResponse(
            items=[f.model_dump() for f in frames],
            total=total,
            page=page,
            per_page=per_page,
            has_next=has_next,
            has_prev=has_prev,
            next_cursor=str(page + 1) if has_next else None,
            prev_cursor=str(page - 1) if has_prev else None
        )

        return MCPResource(
            uri=f"smithers://executions/{execution_id}/frames",
            data=response.model_dump(),
            metadata={"resource_type": "frame_list", "execution_id": execution_id}
        )

    def get_frame(self, execution_id: str, frame_seq: str, **kwargs) -> MCPResource:
        """Get frame detail."""
        frame_seq = int(frame_seq)

        with self.get_connection() as conn:
            # Get frame
            frame_row = conn.execute("""
                SELECT
                    f.id, f.sequence, f.created_at, f.status,
                    f.phase_path, f.step_index, f.error,
                    f.plan_tree, f.metrics
                FROM frames f
                WHERE f.execution_id = ? AND f.sequence = ?
            """, (execution_id, frame_seq)).fetchone()

            if not frame_row:
                return MCPResource(
                    uri=f"smithers://executions/{execution_id}/frames/{frame_seq}",
                    data={"error": f"Frame {frame_seq} not found in execution {execution_id}", "type": "not_found"},
                )

            frame_dict = dict(frame_row)

            # Get nodes for this frame
            node_rows = conn.execute("""
                SELECT
                    node_id, node_type, path, status,
                    metadata
                FROM frame_nodes
                WHERE frame_id = ?
                ORDER BY path
            """, (frame_dict['id'],)).fetchall()

            nodes = []
            for node in node_rows:
                nodes.append({
                    "node_id": node['node_id'],
                    "node_type": node['node_type'],
                    "path": node['path'],
                    "status": node['status'],
                    "metadata": json.loads(node['metadata']) if node['metadata'] else None
                })

            # Get events for this frame
            event_rows = conn.execute("""
                SELECT id, type, created_at, node_id, data
                FROM events
                WHERE execution_id = ? AND frame_seq = ?
                ORDER BY created_at
                LIMIT 100
            """, (execution_id, frame_seq)).fetchall()

            events = []
            for event in event_rows:
                events.append({
                    "id": event['id'],
                    "type": event['type'],
                    "created_at": event['created_at'],
                    "node_id": event['node_id'],
                    "data": json.loads(event['data']) if event['data'] else None
                })

            frame_data = {
                "sequence": frame_dict['sequence'],
                "created_at": frame_dict['created_at'],
                "status": frame_dict['status'] or 'completed',
                "phase_path": frame_dict['phase_path'],
                "step_index": frame_dict['step_index'],
                "error": frame_dict['error'],
                "plan_tree": json.loads(frame_dict['plan_tree']) if frame_dict['plan_tree'] else None,
                "metrics": json.loads(frame_dict['metrics']) if frame_dict['metrics'] else None,
                "nodes": nodes,
                "events": events
            }

            return MCPResource(
                uri=f"smithers://executions/{execution_id}/frames/{frame_seq}",
                data=frame_data,
                metadata={"resource_type": "frame_detail", "execution_id": execution_id, "frame_seq": frame_seq}
            )

    def list_events(self, execution_id: str, page: int = 1, per_page: int = 50, cursor: Optional[str] = None) -> MCPResource:
        """List events for an execution (cursored)."""
        offset = (page - 1) * per_page

        with self.get_connection() as conn:
            # Verify execution exists
            exec_exists = conn.execute("SELECT 1 FROM executions WHERE id = ?", (execution_id,)).fetchone()
            if not exec_exists:
                return MCPResource(
                    uri=f"smithers://executions/{execution_id}/events",
                    data={"error": f"Execution {execution_id} not found", "type": "not_found"},
                )

            # Count total
            total = conn.execute("SELECT COUNT(*) FROM events WHERE execution_id = ?", (execution_id,)).fetchone()[0]

            # Get events
            rows = conn.execute("""
                SELECT
                    id, type, created_at, frame_seq, node_id, data
                FROM events
                WHERE execution_id = ?
                ORDER BY created_at DESC
                LIMIT ? OFFSET ?
            """, (execution_id, per_page, offset)).fetchall()

            events = []
            for row in rows:
                events.append(EventSummary(
                    id=row['id'],
                    type=row['type'],
                    created_at=row['created_at'],
                    frame_seq=row['frame_seq'],
                    node_id=row['node_id'],
                    data=json.loads(row['data']) if row['data'] else None
                ))

        has_next = (page * per_page) < total
        has_prev = page > 1

        response = PaginatedResponse(
            items=[e.model_dump() for e in events],
            total=total,
            page=page,
            per_page=per_page,
            has_next=has_next,
            has_prev=has_prev,
            next_cursor=str(page + 1) if has_next else None,
            prev_cursor=str(page - 1) if has_prev else None
        )

        return MCPResource(
            uri=f"smithers://executions/{execution_id}/events",
            data=response.model_dump(),
            metadata={"resource_type": "event_list", "execution_id": execution_id}
        )

    def get_node(self, execution_id: str, node_id: str, **kwargs) -> MCPResource:
        """Get node instance detail."""
        with self.get_connection() as conn:
            # Get node instance
            node_row = conn.execute("""
                SELECT
                    ni.node_id, ni.node_type, ni.path, ni.status,
                    ni.created_at, ni.updated_at, ni.error,
                    ni.metadata
                FROM node_instances ni
                WHERE ni.execution_id = ? AND ni.node_id = ?
            """, (execution_id, node_id)).fetchone()

            if not node_row:
                return MCPResource(
                    uri=f"smithers://executions/{execution_id}/nodes/{node_id}",
                    data={"error": f"Node {node_id} not found in execution {execution_id}", "type": "not_found"},
                )

            node_dict = dict(node_row)

            # Get agent runs for this node
            run_rows = conn.execute("""
                SELECT
                    id, status, started_at, completed_at,
                    error, result, metadata
                FROM agent_runs
                WHERE execution_id = ? AND node_id = ?
                ORDER BY started_at DESC
            """, (execution_id, node_id)).fetchall()

            runs = []
            for run in run_rows:
                runs.append({
                    "id": run['id'],
                    "status": run['status'],
                    "started_at": run['started_at'],
                    "completed_at": run['completed_at'],
                    "error": run['error'],
                    "result": json.loads(run['result']) if run['result'] else None,
                    "metadata": json.loads(run['metadata']) if run['metadata'] else None
                })

            # Get frames where this node appeared
            frame_rows = conn.execute("""
                SELECT DISTINCT f.sequence, f.created_at, fn.status
                FROM frames f
                JOIN frame_nodes fn ON f.id = fn.frame_id
                WHERE f.execution_id = ? AND fn.node_id = ?
                ORDER BY f.sequence DESC
                LIMIT 10
            """, (execution_id, node_id)).fetchall()

            frames = []
            for frame in frame_rows:
                frames.append({
                    "sequence": frame['sequence'],
                    "created_at": frame['created_at'],
                    "node_status": frame['status']
                })

            node_data = {
                "node_id": node_dict['node_id'],
                "node_type": node_dict['node_type'],
                "path": node_dict['path'],
                "status": node_dict['status'],
                "created_at": node_dict['created_at'],
                "updated_at": node_dict['updated_at'],
                "error": node_dict['error'],
                "metadata": json.loads(node_dict['metadata']) if node_dict['metadata'] else None,
                "runs": runs,
                "recent_frames": frames
            }

            return MCPResource(
                uri=f"smithers://executions/{execution_id}/nodes/{node_id}",
                data=node_data,
                metadata={"resource_type": "node_detail", "execution_id": execution_id, "node_id": node_id}
            )

    def list_node_runs(self, execution_id: str, node_id: str, page: int = 1, per_page: int = 20, cursor: Optional[str] = None) -> MCPResource:
        """List agent runs for a node."""
        offset = (page - 1) * per_page

        with self.get_connection() as conn:
            # Verify node exists
            node_exists = conn.execute(
                "SELECT 1 FROM node_instances WHERE execution_id = ? AND node_id = ?",
                (execution_id, node_id)
            ).fetchone()

            if not node_exists:
                return MCPResource(
                    uri=f"smithers://executions/{execution_id}/nodes/{node_id}/runs",
                    data={"error": f"Node {node_id} not found in execution {execution_id}", "type": "not_found"},
                )

            # Count total runs
            total = conn.execute(
                "SELECT COUNT(*) FROM agent_runs WHERE execution_id = ? AND node_id = ?",
                (execution_id, node_id)
            ).fetchone()[0]

            # Get runs
            rows = conn.execute("""
                SELECT
                    id, run_number, status, started_at, completed_at,
                    error, result, metadata, tool_calls_count
                FROM agent_runs
                WHERE execution_id = ? AND node_id = ?
                ORDER BY started_at DESC
                LIMIT ? OFFSET ?
            """, (execution_id, node_id, per_page, offset)).fetchall()

            runs = []
            for row in rows:
                run_dict = dict(row)
                runs.append({
                    "id": run_dict['id'],
                    "run_number": run_dict.get('run_number', 1),
                    "status": run_dict['status'],
                    "started_at": run_dict['started_at'],
                    "completed_at": run_dict['completed_at'],
                    "duration_ms": None,  # Could calculate if needed
                    "error": run_dict['error'],
                    "result": json.loads(run_dict['result']) if run_dict['result'] else None,
                    "tool_calls_count": run_dict.get('tool_calls_count', 0),
                    "metadata": json.loads(run_dict['metadata']) if run_dict['metadata'] else None
                })

        has_next = (page * per_page) < total
        has_prev = page > 1

        response = PaginatedResponse(
            items=runs,
            total=total,
            page=page,
            per_page=per_page,
            has_next=has_next,
            has_prev=has_prev,
            next_cursor=str(page + 1) if has_next else None,
            prev_cursor=str(page - 1) if has_prev else None
        )

        return MCPResource(
            uri=f"smithers://executions/{execution_id}/nodes/{node_id}/runs",
            data=response.model_dump(),
            metadata={"resource_type": "node_runs", "execution_id": execution_id, "node_id": node_id}
        )

    def list_artifacts(self, execution_id: str, page: int = 1, per_page: int = 20, cursor: Optional[str] = None) -> MCPResource:
        """List artifacts for an execution."""
        offset = (page - 1) * per_page

        with self.get_connection() as conn:
            # Verify execution exists
            exec_exists = conn.execute("SELECT 1 FROM executions WHERE id = ?", (execution_id,)).fetchone()
            if not exec_exists:
                return MCPResource(
                    uri=f"smithers://executions/{execution_id}/artifacts",
                    data={"error": f"Execution {execution_id} not found", "type": "not_found"},
                )

            # Count total artifacts
            total = conn.execute("SELECT COUNT(*) FROM artifacts WHERE execution_id = ?", (execution_id,)).fetchone()[0]

            # Get artifacts
            rows = conn.execute("""
                SELECT
                    id, type, name, created_at, updated_at,
                    size, metadata
                FROM artifacts
                WHERE execution_id = ?
                ORDER BY updated_at DESC
                LIMIT ? OFFSET ?
            """, (execution_id, per_page, offset)).fetchall()

            artifacts = []
            for row in rows:
                artifacts.append(ArtifactSummary(
                    id=row['id'],
                    type=row['type'],
                    name=row['name'],
                    created_at=row['created_at'],
                    updated_at=row['updated_at'],
                    size=row['size'] or 0,
                    metadata=json.loads(row['metadata']) if row['metadata'] else None
                ))

        has_next = (page * per_page) < total
        has_prev = page > 1

        response = PaginatedResponse(
            items=[a.model_dump() for a in artifacts],
            total=total,
            page=page,
            per_page=per_page,
            has_next=has_next,
            has_prev=has_prev,
            next_cursor=str(page + 1) if has_next else None,
            prev_cursor=str(page - 1) if has_prev else None
        )

        return MCPResource(
            uri=f"smithers://executions/{execution_id}/artifacts",
            data=response.model_dump(),
            metadata={"resource_type": "artifact_list", "execution_id": execution_id}
        )

    def list_approvals(self, execution_id: str, page: int = 1, per_page: int = 20, cursor: Optional[str] = None) -> MCPResource:
        """List pending approvals for an execution."""
        offset = (page - 1) * per_page

        with self.get_connection() as conn:
            # Verify execution exists
            exec_exists = conn.execute("SELECT 1 FROM executions WHERE id = ?", (execution_id,)).fetchone()
            if not exec_exists:
                return MCPResource(
                    uri=f"smithers://executions/{execution_id}/approvals",
                    data={"error": f"Execution {execution_id} not found", "type": "not_found"},
                )

            # Count pending approvals
            total = conn.execute("""
                SELECT COUNT(*) FROM approvals
                WHERE execution_id = ? AND status = 'pending'
            """, (execution_id,)).fetchone()[0]

            # Get approvals
            rows = conn.execute("""
                SELECT
                    id, node_id, type, prompt, created_at,
                    options, metadata
                FROM approvals
                WHERE execution_id = ? AND status = 'pending'
                ORDER BY created_at DESC
                LIMIT ? OFFSET ?
            """, (execution_id, per_page, offset)).fetchall()

            approvals = []
            for row in rows:
                approvals.append(ApprovalSummary(
                    id=row['id'],
                    node_id=row['node_id'],
                    type=row['type'] or 'user_approval',
                    prompt=row['prompt'],
                    created_at=row['created_at'],
                    options=json.loads(row['options']) if row['options'] else [],
                    metadata=json.loads(row['metadata']) if row['metadata'] else None
                ))

        has_next = (page * per_page) < total
        has_prev = page > 1

        response = PaginatedResponse(
            items=[a.model_dump() for a in approvals],
            total=total,
            page=page,
            per_page=per_page,
            has_next=has_next,
            has_prev=has_prev,
            next_cursor=str(page + 1) if has_next else None,
            prev_cursor=str(page - 1) if has_prev else None
        )

        return MCPResource(
            uri=f"smithers://executions/{execution_id}/approvals",
            data=response.model_dump(),
            metadata={"resource_type": "approval_list", "execution_id": execution_id}
        )

    def list_scripts(self, page: int = 1, per_page: int = 20, cursor: Optional[str] = None) -> MCPResource:
        """List available scripts/definitions."""
        # For now, return empty list - this would be populated from script registry
        response = PaginatedResponse(
            items=[],
            total=0,
            page=page,
            per_page=per_page,
            has_next=False,
            has_prev=False
        )

        return MCPResource(
            uri="smithers://scripts",
            data=response.model_dump(),
            metadata={"resource_type": "script_list", "note": "Script registry not yet implemented"}
        )

    def get_health(self, **kwargs) -> MCPResource:
        """Get provider health and rate limit status."""
        health_data = {
            "status": "healthy",
            "version": "0.1.0",
            "uptime_seconds": 0,  # Would track in real implementation
            "database": {
                "status": "connected",
                "path": self.db_path
            },
            "rate_limits": {
                "anthropic": {
                    "remaining": 1000,
                    "reset_at": None,
                    "limit": 1000
                }
            },
            "system": {
                "memory_usage_mb": 0,  # Would get from system
                "cpu_usage_percent": 0
            }
        }

        # Try to verify database is accessible
        try:
            with self.get_connection() as conn:
                conn.execute("SELECT 1").fetchone()
        except Exception as e:
            health_data["database"]["status"] = "error"
            health_data["database"]["error"] = str(e)
            health_data["status"] = "degraded"

        return MCPResource(
            uri="smithers://health",
            data=health_data,
            metadata={"resource_type": "health_status", "timestamp": datetime.now().isoformat()}
        )