"""
Artifacts System API.

Per PRD section 8.15 (Prefect-style artifacts):
- Store markdown, table, progress indicators for UI display
- Key vs keyless semantics (keyed = upsert, keyless = append)
- Available via ctx.artifact in agent execution
"""

import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Literal, Optional, Union
from enum import Enum


class ArtifactType(str, Enum):
    """Supported artifact types."""
    MARKDOWN = "markdown"
    TABLE = "table"
    PROGRESS = "progress"
    LINK = "link"
    IMAGE = "image"


@dataclass
class Artifact:
    """Artifact record."""
    id: str
    execution_id: str
    name: str
    type: ArtifactType
    content: Dict[str, Any]
    node_id: Optional[str] = None
    frame_id: Optional[int] = None
    key: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class ArtifactSystem:
    """
    Artifact management for Smithers executions.
    
    Artifacts are stored in SQLite and accessible via MCP resources.
    Keyed artifacts update in place, keyless append new entries.
    """
    
    def __init__(self, db_connection, execution_id: str):
        """
        Initialize artifact system.
        
        Args:
            db_connection: SQLite connection
            execution_id: Current execution ID
        """
        self.db = db_connection
        self.execution_id = execution_id
        self._current_node_id: Optional[str] = None
        self._current_frame_id: Optional[int] = None
    
    def set_context(self, node_id: Optional[str] = None, frame_id: Optional[int] = None) -> None:
        """Set current execution context for artifacts."""
        self._current_node_id = node_id
        self._current_frame_id = frame_id
    
    def markdown(self, name: str, content: str, key: Optional[str] = None) -> str:
        """
        Store markdown artifact for UI display.
        
        Args:
            name: Display name for the artifact
            content: Markdown content
            key: Optional key for upsert behavior
            
        Returns:
            Artifact ID
        """
        return self._store_artifact(
            name=name,
            type_=ArtifactType.MARKDOWN,
            content={"markdown": content},
            key=key
        )
    
    def table(self, name: str, rows: List[Dict[str, Any]], key: Optional[str] = None) -> str:
        """
        Store tabular artifact.
        
        Args:
            name: Display name for the artifact
            rows: List of row dictionaries
            key: Optional key for upsert behavior
            
        Returns:
            Artifact ID
        """
        # Extract columns from first row if available
        columns = list(rows[0].keys()) if rows else []
        
        return self._store_artifact(
            name=name,
            type_=ArtifactType.TABLE,
            content={"columns": columns, "rows": rows},
            key=key
        )
    
    def progress(
        self, 
        name: str, 
        current: int, 
        total: int, 
        key: Optional[str] = None,
        message: Optional[str] = None
    ) -> str:
        """
        Store progress indicator.
        
        Args:
            name: Display name for the artifact
            current: Current progress value
            total: Total value for completion
            key: Optional key for upsert behavior
            message: Optional status message
            
        Returns:
            Artifact ID
        """
        percent = (current / total * 100) if total > 0 else 0
        
        return self._store_artifact(
            name=name,
            type_=ArtifactType.PROGRESS,
            content={
                "current": current,
                "total": total,
                "percent": round(percent, 1),
                "message": message
            },
            key=key
        )
    
    def link(
        self, 
        name: str, 
        url: str, 
        description: Optional[str] = None,
        key: Optional[str] = None
    ) -> str:
        """
        Store link artifact.
        
        Args:
            name: Display name for the artifact
            url: URL to link to
            description: Optional description
            key: Optional key for upsert behavior
            
        Returns:
            Artifact ID
        """
        return self._store_artifact(
            name=name,
            type_=ArtifactType.LINK,
            content={"url": url, "description": description},
            key=key
        )
    
    def image(
        self, 
        name: str, 
        path: Optional[str] = None,
        url: Optional[str] = None,
        alt_text: Optional[str] = None,
        key: Optional[str] = None
    ) -> str:
        """
        Store image artifact.
        
        Args:
            name: Display name for the artifact
            path: Local file path to image
            url: Remote URL for image
            alt_text: Accessibility text
            key: Optional key for upsert behavior
            
        Returns:
            Artifact ID
        """
        if not path and not url:
            raise ValueError("Either path or url must be provided")
        
        return self._store_artifact(
            name=name,
            type_=ArtifactType.IMAGE,
            content={"path": path, "url": url, "alt_text": alt_text},
            key=key
        )
    
    def _store_artifact(
        self,
        name: str,
        type_: ArtifactType,
        content: Dict[str, Any],
        key: Optional[str] = None
    ) -> str:
        """
        Internal method to store artifact.
        
        Uses upsert for keyed artifacts, insert for keyless.
        """
        now = datetime.now().isoformat()
        content_json = json.dumps(content)
        
        if key is not None:
            # Keyed: upsert (update if exists, insert if not)
            existing = self.db.execute(
                "SELECT id FROM artifacts WHERE execution_id = ? AND key = ?",
                (self.execution_id, key)
            ).fetchone()
            
            if existing:
                artifact_id = existing[0]
                self.db.execute(
                    """UPDATE artifacts 
                       SET name = ?, type = ?, content_json = ?, 
                           node_id = ?, frame_id = ?, updated_at = ?
                       WHERE id = ?""",
                    (name, type_.value, content_json, 
                     self._current_node_id, self._current_frame_id, now,
                     artifact_id)
                )
            else:
                artifact_id = str(uuid.uuid4())
                self.db.execute(
                    """INSERT INTO artifacts 
                       (id, execution_id, node_id, frame_id, key, name, type, content_json, created_at, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (artifact_id, self.execution_id, self._current_node_id, 
                     self._current_frame_id, key, name, type_.value, 
                     content_json, now, now)
                )
        else:
            # Keyless: always insert new
            artifact_id = str(uuid.uuid4())
            self.db.execute(
                """INSERT INTO artifacts 
                   (id, execution_id, node_id, frame_id, key, name, type, content_json, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (artifact_id, self.execution_id, self._current_node_id,
                 self._current_frame_id, None, name, type_.value,
                 content_json, now, now)
            )
        
        self.db.commit()
        return artifact_id
    
    def get(self, artifact_id: str) -> Optional[Artifact]:
        """Get artifact by ID."""
        row = self.db.execute(
            """SELECT id, execution_id, node_id, frame_id, key, name, type, 
                      content_json, created_at, updated_at
               FROM artifacts WHERE id = ?""",
            (artifact_id,)
        ).fetchone()
        
        if not row:
            return None
        
        return Artifact(
            id=row[0],
            execution_id=row[1],
            node_id=row[2],
            frame_id=row[3],
            key=row[4],
            name=row[5],
            type=ArtifactType(row[6]),
            content=json.loads(row[7]),
            created_at=datetime.fromisoformat(row[8]) if row[8] else None,
            updated_at=datetime.fromisoformat(row[9]) if row[9] else None
        )
    
    def list_for_execution(self, limit: int = 100) -> List[Artifact]:
        """List all artifacts for current execution."""
        rows = self.db.execute(
            """SELECT id, execution_id, node_id, frame_id, key, name, type,
                      content_json, created_at, updated_at
               FROM artifacts 
               WHERE execution_id = ?
               ORDER BY updated_at DESC
               LIMIT ?""",
            (self.execution_id, limit)
        ).fetchall()
        
        return [
            Artifact(
                id=row[0],
                execution_id=row[1],
                node_id=row[2],
                frame_id=row[3],
                key=row[4],
                name=row[5],
                type=ArtifactType(row[6]),
                content=json.loads(row[7]),
                created_at=datetime.fromisoformat(row[8]) if row[8] else None,
                updated_at=datetime.fromisoformat(row[9]) if row[9] else None
            )
            for row in rows
        ]


__all__ = ["ArtifactSystem", "ArtifactType", "Artifact"]
