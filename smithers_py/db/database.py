"""
Smithers Database Layer for Python

A comprehensive SQLite-based database layer matching the TypeScript schema
for state management, execution tracking, and orchestration.
"""

import sqlite3
try:
    import aiosqlite
except ImportError:
    aiosqlite = None  # For sync-only usage
import json
import uuid
import asyncio
from datetime import datetime
from typing import Any, Dict, List, Optional, Union, Tuple, AsyncGenerator
from pathlib import Path
import os


class GlobalStateStore:
    """Global state storage (not execution-scoped) compatible with TypeScript implementation.
    
    For execution-scoped state, use smithers_py.state.SqliteStore instead.
    """

    def __init__(self, db_connection: Union[sqlite3.Connection, aiosqlite.Connection]):
        self.db = db_connection
        self._is_async = isinstance(db_connection, aiosqlite.Connection)

    async def get(self, key: str) -> Any:
        if self._is_async:
            async with self.db.execute("SELECT value FROM state WHERE key = ?", (key,)) as cursor:
                row = await cursor.fetchone()
        else:
            cursor = self.db.execute("SELECT value FROM state WHERE key = ?", (key,))
            row = cursor.fetchone()

        if row:
            return json.loads(row[0])
        return None

    async def set(self, key: str, value: Any, trigger: Optional[str] = None) -> None:
        old_value = await self.get(key)
        value_json = json.dumps(value)

        if self._is_async:
            await self.db.execute(
                "INSERT OR REPLACE INTO state (key, value, updated_at) VALUES (?, ?, ?)",
                (key, value_json, datetime.now().isoformat())
            )
            await self.db.commit()
        else:
            self.db.execute(
                "INSERT OR REPLACE INTO state (key, value, updated_at) VALUES (?, ?, ?)",
                (key, value_json, datetime.now().isoformat())
            )
            self.db.commit()


# NOTE: For execution-scoped state storage (with execution_id), use:
#   from smithers_py.state.sqlite import SqliteStore
# 
# This module's GlobalStateStore is for global state only (no execution scope).


class ExecutionModule:
    """Execution tracking module"""

    def __init__(self, db_connection: Union[sqlite3.Connection, aiosqlite.Connection]):
        self.db = db_connection
        self._is_async = isinstance(db_connection, aiosqlite.Connection)
        self._current_execution_id: Optional[str] = None

    async def start(self, name: str, source_file: str, config: Optional[Dict[str, Any]] = None, execution_id: Optional[str] = None) -> str:
        """Start a new execution"""
        # Use provided execution_id, environment variable, or generate new UUID
        execution_id = execution_id or os.getenv('SMITHERS_EXECUTION_ID') or str(uuid.uuid4())

        # Check if execution already exists (resume case)
        if self._is_async:
            async with self.db.execute("SELECT id FROM executions WHERE id = ?", (execution_id,)) as cursor:
                existing = await cursor.fetchone()
        else:
            existing = self.db.execute("SELECT id FROM executions WHERE id = ?", (execution_id,)).fetchone()

        now = datetime.now().isoformat()

        if existing:
            # Resume: update status to running
            if self._is_async:
                await self.db.execute(
                    "UPDATE executions SET status = 'running', started_at = ?, error = NULL, completed_at = NULL WHERE id = ?",
                    (now, execution_id)
                )
                await self.db.commit()
            else:
                self.db.execute(
                    "UPDATE executions SET status = 'running', started_at = ?, error = NULL, completed_at = NULL WHERE id = ?",
                    (now, execution_id)
                )
                self.db.commit()
        else:
            # New execution: insert
            config_json = json.dumps(config or {})
            if self._is_async:
                await self.db.execute(
                    """INSERT INTO executions (id, name, source_file, status, config, started_at, created_at)
                       VALUES (?, ?, ?, 'running', ?, ?, ?)""",
                    (execution_id, name, source_file, config_json, now, now)
                )
                await self.db.commit()
            else:
                self.db.execute(
                    """INSERT INTO executions (id, name, source_file, status, config, started_at, created_at)
                       VALUES (?, ?, ?, 'running', ?, ?, ?)""",
                    (execution_id, name, source_file, config_json, now, now)
                )
                self.db.commit()

        self._current_execution_id = execution_id
        return execution_id

    async def complete(self, execution_id: str, result: Optional[Dict[str, Any]] = None) -> None:
        """Mark execution as completed"""
        result_json = json.dumps(result) if result else None
        now = datetime.now().isoformat()

        if self._is_async:
            await self.db.execute(
                "UPDATE executions SET status = 'completed', result = ?, completed_at = ? WHERE id = ?",
                (result_json, now, execution_id)
            )
            await self.db.commit()
        else:
            self.db.execute(
                "UPDATE executions SET status = 'completed', result = ?, completed_at = ? WHERE id = ?",
                (result_json, now, execution_id)
            )
            self.db.commit()

        if self._current_execution_id == execution_id:
            self._current_execution_id = None

    async def fail(self, execution_id: str, error: str) -> None:
        """Mark execution as failed"""
        now = datetime.now().isoformat()

        if self._is_async:
            await self.db.execute(
                "UPDATE executions SET status = 'failed', error = ?, completed_at = ? WHERE id = ?",
                (error, now, execution_id)
            )
            await self.db.commit()
        else:
            self.db.execute(
                "UPDATE executions SET status = 'failed', error = ?, completed_at = ? WHERE id = ?",
                (error, now, execution_id)
            )
            self.db.commit()

        if self._current_execution_id == execution_id:
            self._current_execution_id = None

    async def find_incomplete(self) -> Optional[Dict[str, Any]]:
        """Find most recent incomplete execution"""
        query = """
            SELECT id, name, source_file, correlation_id, status, config, result, error,
                   end_summary, end_reason, exit_code, started_at, completed_at,
                   created_at, updated_at, total_iterations, total_agents, 
                   total_tool_calls, total_tokens_used
            FROM executions 
            WHERE status IN ('pending', 'running') 
            ORDER BY created_at DESC LIMIT 1
        """
        if self._is_async:
            async with self.db.execute(query) as cursor:
                row = await cursor.fetchone()
        else:
            row = self.db.execute(query).fetchone()

        if row:
            # Convert row to dict using explicit column names to match schema
            columns = ['id', 'name', 'source_file', 'correlation_id', 'status', 'config', 
                      'result', 'error', 'end_summary', 'end_reason', 'exit_code', 
                      'started_at', 'completed_at', 'created_at', 'updated_at',
                      'total_iterations', 'total_agents', 'total_tool_calls', 'total_tokens_used']
            exec_dict = dict(zip(columns, row))
            self._current_execution_id = exec_dict['id']
            return exec_dict
        return None


class TasksModule:
    """Task management module"""

    def __init__(self, db_connection: Union[sqlite3.Connection, aiosqlite.Connection]):
        self.db = db_connection
        self._is_async = isinstance(db_connection, aiosqlite.Connection)

    async def start(self, task_id: str, name: str, execution_id: str, component_type: str, component_name: Optional[str] = None) -> None:
        """Start a task"""
        now = datetime.now().isoformat()

        if self._is_async:
            await self.db.execute(
                """INSERT INTO tasks (id, name, execution_id, status, started_at, component_type, component_name)
                   VALUES (?, ?, ?, 'running', ?, ?, ?)""",
                (task_id, name, execution_id, now, component_type, component_name)
            )
            await self.db.commit()
        else:
            self.db.execute(
                """INSERT INTO tasks (id, name, execution_id, status, started_at, component_type, component_name)
                   VALUES (?, ?, ?, 'running', ?, ?, ?)""",
                (task_id, name, execution_id, now, component_type, component_name)
            )
            self.db.commit()

    async def complete(self, task_id: str) -> None:
        """Mark task as completed"""
        now = datetime.now().isoformat()

        if self._is_async:
            await self.db.execute(
                "UPDATE tasks SET status = 'completed', completed_at = ? WHERE id = ?",
                (now, task_id)
            )
            await self.db.commit()
        else:
            self.db.execute(
                "UPDATE tasks SET status = 'completed', completed_at = ? WHERE id = ?",
                (now, task_id)
            )
            self.db.commit()

    async def heartbeat(self, task_id: str, lease_owner: str) -> None:
        """Update task heartbeat"""
        now = datetime.now().isoformat()

        if self._is_async:
            await self.db.execute(
                "UPDATE tasks SET heartbeat_at = ?, lease_owner = ? WHERE id = ?",
                (now, lease_owner, task_id)
            )
            await self.db.commit()
        else:
            self.db.execute(
                "UPDATE tasks SET heartbeat_at = ?, lease_owner = ? WHERE id = ?",
                (now, lease_owner, task_id)
            )
            self.db.commit()

    async def fail(self, task_id: str, error: str) -> None:
        """Mark task as failed"""
        now = datetime.now().isoformat()

        if self._is_async:
            await self.db.execute(
                "UPDATE tasks SET status = 'failed', completed_at = ?, error = ? WHERE id = ?",
                (now, error, task_id)
            )
            await self.db.commit()
        else:
            self.db.execute(
                "UPDATE tasks SET status = 'failed', completed_at = ?, error = ? WHERE id = ?",
                (now, error, task_id)
            )
            self.db.commit()


class ArtifactsModule:
    """Artifacts storage module for the spec-required artifacts system"""

    def __init__(self, db_connection: Union[sqlite3.Connection, aiosqlite.Connection]):
        self.db = db_connection
        self._is_async = isinstance(db_connection, aiosqlite.Connection)

    async def create(self, execution_id: str, node_id: Optional[str], frame_id: Optional[int],
                     key: Optional[str], name: str, artifact_type: str, content: Dict[str, Any]) -> str:
        """Create a new artifact"""
        artifact_id = str(uuid.uuid4())
        content_json = json.dumps(content)
        now = datetime.now().isoformat()

        if self._is_async:
            await self.db.execute(
                """INSERT INTO artifacts (id, execution_id, node_id, frame_id, key, name, type, content_json, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (artifact_id, execution_id, node_id, frame_id, key, name, artifact_type, content_json, now, now)
            )
            await self.db.commit()
        else:
            self.db.execute(
                """INSERT INTO artifacts (id, execution_id, node_id, frame_id, key, name, type, content_json, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (artifact_id, execution_id, node_id, frame_id, key, name, artifact_type, content_json, now, now)
            )
            self.db.commit()

        return artifact_id

    async def update(self, execution_id: str, key: str, content: Dict[str, Any]) -> bool:
        """Update an existing keyed artifact"""
        if not key:
            raise ValueError("Key is required for updating artifacts")

        content_json = json.dumps(content)
        now = datetime.now().isoformat()

        if self._is_async:
            cursor = await self.db.execute(
                "UPDATE artifacts SET content_json = ?, updated_at = ? WHERE execution_id = ? AND key = ?",
                (content_json, now, execution_id, key)
            )
            await self.db.commit()
            return cursor.rowcount > 0
        else:
            cursor = self.db.execute(
                "UPDATE artifacts SET content_json = ?, updated_at = ? WHERE execution_id = ? AND key = ?",
                (content_json, now, execution_id, key)
            )
            self.db.commit()
            return cursor.rowcount > 0

    async def get(self, execution_id: str, key: str) -> Optional[Dict[str, Any]]:
        """Get a keyed artifact"""
        if self._is_async:
            async with self.db.execute(
                "SELECT id, name, type, content_json, created_at, updated_at FROM artifacts WHERE execution_id = ? AND key = ?",
                (execution_id, key)
            ) as cursor:
                row = await cursor.fetchone()
        else:
            row = self.db.execute(
                "SELECT id, name, type, content_json, created_at, updated_at FROM artifacts WHERE execution_id = ? AND key = ?",
                (execution_id, key)
            ).fetchone()

        if row:
            return {
                'id': row[0],
                'name': row[1],
                'type': row[2],
                'content': json.loads(row[3]),
                'created_at': row[4],
                'updated_at': row[5]
            }
        return None

    async def list(self, execution_id: str, artifact_type: Optional[str] = None) -> List[Dict[str, Any]]:
        """List artifacts for an execution, optionally filtered by type"""
        query = "SELECT id, node_id, frame_id, key, name, type, content_json, created_at, updated_at FROM artifacts WHERE execution_id = ?"
        params = [execution_id]

        if artifact_type:
            query += " AND type = ?"
            params.append(artifact_type)

        query += " ORDER BY created_at DESC"

        if self._is_async:
            async with self.db.execute(query, params) as cursor:
                rows = await cursor.fetchall()
        else:
            rows = self.db.execute(query, params).fetchall()

        return [
            {
                'id': row[0],
                'node_id': row[1],
                'frame_id': row[2],
                'key': row[3],
                'name': row[4],
                'type': row[5],
                'content': json.loads(row[6]),
                'created_at': row[7],
                'updated_at': row[8]
            }
            for row in rows
        ]


class RenderFramesModule:
    """Render frame storage for time-travel debugging"""

    def __init__(self, db_connection: Union[sqlite3.Connection, aiosqlite.Connection]):
        self.db = db_connection
        self._is_async = isinstance(db_connection, aiosqlite.Connection)

    async def save(self, execution_id: str, xml_content: str, sequence_number: Optional[int] = None) -> str:
        """Save a render frame"""
        frame_id = str(uuid.uuid4())

        if sequence_number is None:
            # Auto-generate sequence number
            if self._is_async:
                async with self.db.execute(
                    "SELECT COALESCE(MAX(sequence_number), -1) + 1 FROM render_frames WHERE execution_id = ?",
                    (execution_id,)
                ) as cursor:
                    row = await cursor.fetchone()
                    sequence_number = row[0] if row else 0
            else:
                row = self.db.execute(
                    "SELECT COALESCE(MAX(sequence_number), -1) + 1 FROM render_frames WHERE execution_id = ?",
                    (execution_id,)
                ).fetchone()
                sequence_number = row[0] if row else 0

        timestamp = datetime.now().isoformat()

        if self._is_async:
            await self.db.execute(
                """INSERT INTO render_frames (id, execution_id, sequence_number, xml_content, timestamp)
                   VALUES (?, ?, ?, ?, ?)""",
                (frame_id, execution_id, sequence_number, xml_content, timestamp)
            )
            await self.db.commit()
        else:
            self.db.execute(
                """INSERT INTO render_frames (id, execution_id, sequence_number, xml_content, timestamp)
                   VALUES (?, ?, ?, ?, ?)""",
                (frame_id, execution_id, sequence_number, xml_content, timestamp)
            )
            self.db.commit()

        return frame_id

    async def list(self, execution_id: str) -> List[Dict[str, Any]]:
        """List all frames for an execution"""
        if self._is_async:
            async with self.db.execute(
                "SELECT * FROM render_frames WHERE execution_id = ? ORDER BY sequence_number ASC",
                (execution_id,)
            ) as cursor:
                rows = await cursor.fetchall()
        else:
            rows = self.db.execute(
                "SELECT * FROM render_frames WHERE execution_id = ? ORDER BY sequence_number ASC",
                (execution_id,)
            ).fetchall()

        columns = ['id', 'execution_id', 'sequence_number', 'xml_content', 'ralph_count', 'timestamp']
        return [dict(zip(columns, row)) for row in rows]


class SmithersDB:
    """Main database class wrapping sqlite3/aiosqlite"""

    def __init__(self, db_path: str = ":memory:", is_async: bool = False):
        self.db_path = db_path
        self.is_async = is_async
        self._connection: Optional[Union[sqlite3.Connection, aiosqlite.Connection]] = None
        self._initialized = False

        # Modules
        self.execution: Optional[ExecutionModule] = None
        self.state: Optional[GlobalStateStore] = None
        self.tasks: Optional[TasksModule] = None
        self.frames: Optional[RenderFramesModule] = None
        self.artifacts: Optional[ArtifactsModule] = None

    async def connect(self) -> None:
        """Initialize database connection and modules with production defaults."""
        if self._connection is not None:
            return

        if self.is_async:
            self._connection = await aiosqlite.connect(self.db_path)
            # Production defaults (PRD 8.11)
            await self._connection.execute("PRAGMA journal_mode=WAL")
            await self._connection.execute("PRAGMA busy_timeout=5000")
            await self._connection.execute("PRAGMA synchronous=NORMAL")
            await self._connection.execute("PRAGMA foreign_keys=ON")
        else:
            self._connection = sqlite3.connect(self.db_path, check_same_thread=False)
            # Production defaults (PRD 8.11)
            self._connection.execute("PRAGMA journal_mode=WAL")
            self._connection.execute("PRAGMA busy_timeout=5000")
            self._connection.execute("PRAGMA synchronous=NORMAL")
            self._connection.execute("PRAGMA foreign_keys=ON")

        # Initialize modules
        self.execution = ExecutionModule(self._connection)
        self.state = GlobalStateStore(self._connection)
        self.tasks = TasksModule(self._connection)
        self.frames = RenderFramesModule(self._connection)
        self.artifacts = ArtifactsModule(self._connection)

        self._initialized = True

    async def close(self) -> None:
        """Close database connection"""
        if self._connection:
            if self.is_async:
                await self._connection.close()
            else:
                self._connection.close()
            self._connection = None
        self._initialized = False

    async def initialize_schema(self) -> None:
        """Initialize database schema from SQL file."""
        if not self._connection:
            await self.connect()

        # Read schema file
        schema_path = os.path.join(os.path.dirname(__file__), 'schema.sql')
        with open(schema_path, 'r') as f:
            schema_sql = f.read()

        # Execute schema
        await self.executescript(schema_sql)

    async def execute(self, sql: str, params: Optional[Tuple] = None) -> None:
        """Execute SQL statement"""
        if not self._connection:
            await self.connect()

        if self.is_async:
            await self._connection.execute(sql, params or ())
            await self._connection.commit()
        else:
            self._connection.execute(sql, params or ())
            self._connection.commit()

    async def executescript(self, script: str) -> None:
        """Execute SQL script"""
        if not self._connection:
            await self.connect()

        if self.is_async:
            await self._connection.executescript(script)
        else:
            self._connection.executescript(script)

    async def query(self, sql: str, params: Optional[Tuple] = None) -> List[Tuple]:
        """Execute query and return results"""
        if not self._connection:
            await self.connect()

        if self.is_async:
            async with self._connection.execute(sql, params or ()) as cursor:
                return await cursor.fetchall()
        else:
            return self._connection.execute(sql, params or ()).fetchall()

    async def query_one(self, sql: str, params: Optional[Tuple] = None) -> Optional[Tuple]:
        """Execute query and return single result"""
        if not self._connection:
            await self.connect()

        if self.is_async:
            async with self._connection.execute(sql, params or ()) as cursor:
                return await cursor.fetchone()
        else:
            return self._connection.execute(sql, params or ()).fetchone()

    @property
    def connection(self) -> Union[sqlite3.Connection, aiosqlite.Connection]:
        """Get raw database connection"""
        if not self._connection:
            raise RuntimeError("Database not connected. Call connect() first.")
        return self._connection

    @property
    def current_execution_id(self) -> Optional[str]:
        """Get current execution ID from ExecutionModule"""
        if self.execution:
            return self.execution._current_execution_id
        return None

    async def record_event(self, execution_id: str, source: str, node_id: str, event_type: str, payload_json: Dict[str, Any]) -> None:
        """Record an event for audit trail"""
        timestamp = datetime.now().isoformat()
        payload_str = json.dumps(payload_json)

        if self.is_async:
            await self._connection.execute(
                """INSERT INTO events (execution_id, source, node_id, event_type, payload, timestamp)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (execution_id, source, node_id, event_type, payload_str, timestamp)
            )
            await self._connection.commit()
        else:
            self._connection.execute(
                """INSERT INTO events (execution_id, source, node_id, event_type, payload, timestamp)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (execution_id, source, node_id, event_type, payload_str, timestamp)
            )
            self._connection.commit()

    async def get_agent_history(self, agent_id: str) -> Optional[str]:
        """Get agent message history for resuming"""
        if self.is_async:
            async with self._connection.execute(
                "SELECT message_history FROM agents WHERE id = ?", (agent_id,)
            ) as cursor:
                row = await cursor.fetchone()
        else:
            row = self._connection.execute(
                "SELECT message_history FROM agents WHERE id = ?", (agent_id,)
            ).fetchone()

        return row[0] if row else None

    async def save_agent_result(self, execution_id: str, agent_id: str, model: str,
                               prompt: str, status: str, started_at: datetime, ended_at: Optional[datetime],
                               result: Optional[str], result_structured: Optional[str],
                               error: Optional[str], tokens_input: int = 0, tokens_output: int = 0) -> None:
        """Save agent execution result (matches schema)"""
        if self.is_async:
            await self._connection.execute(
                """INSERT OR REPLACE INTO agents
                   (id, execution_id, model, prompt, status, started_at, completed_at,
                    result, result_structured, error, tokens_input, tokens_output)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (agent_id, execution_id, model, prompt, status, started_at.isoformat(),
                 ended_at.isoformat() if ended_at else None, result, result_structured,
                 error, tokens_input, tokens_output)
            )
            await self._connection.commit()
        else:
            self._connection.execute(
                """INSERT OR REPLACE INTO agents
                   (id, execution_id, model, prompt, status, started_at, completed_at,
                    result, result_structured, error, tokens_input, tokens_output)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (agent_id, execution_id, model, prompt, status, started_at.isoformat(),
                 ended_at.isoformat() if ended_at else None, result, result_structured,
                 error, tokens_input, tokens_output)
            )
            self._connection.commit()

    async def save_tool_call(self, agent_id: str, execution_id: str, tool_name: str, input_json: str,
                           output_inline: Optional[str], error: Optional[str],
                           started_at: datetime, ended_at: Optional[datetime],
                           duration_ms: int, status: str = 'completed') -> None:
        """Save tool call record (matches schema)"""
        call_id = str(uuid.uuid4())

        if self.is_async:
            await self._connection.execute(
                """INSERT INTO tool_calls
                   (id, agent_id, execution_id, tool_name, input, output_inline, error, 
                    status, started_at, completed_at, duration_ms)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (call_id, agent_id, execution_id, tool_name, input_json, output_inline, error,
                 status, started_at.isoformat(), ended_at.isoformat() if ended_at else None, duration_ms)
            )
            await self._connection.commit()
        else:
            self._connection.execute(
                """INSERT INTO tool_calls
                   (id, agent_id, execution_id, tool_name, input, output_inline, error, 
                    status, started_at, completed_at, duration_ms)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (call_id, agent_id, execution_id, tool_name, input_json, output_inline, error,
                 status, started_at.isoformat(), ended_at.isoformat() if ended_at else None, duration_ms)
            )
            self._connection.commit()

    async def update_agent_status(self, agent_id: str, status: str) -> None:
        """Update agent execution status"""
        if self.is_async:
            await self._connection.execute(
                "UPDATE agents SET status = ? WHERE id = ?",
                (status, agent_id)
            )
            await self._connection.commit()
        else:
            self._connection.execute(
                "UPDATE agents SET status = ? WHERE id = ?",
                (status, agent_id)
            )
            self._connection.commit()


# Convenience functions for common patterns
def create_smithers_db(
    db_path: Optional[str] = None,
    is_async: bool = False
) -> SmithersDB:
    """Create SmithersDB instance with optional path from environment"""
    path = db_path or os.getenv('SMITHERS_DB_PATH', ':memory:')
    return SmithersDB(path, is_async)


async def create_async_smithers_db(
    db_path: Optional[str] = None
) -> SmithersDB:
    """Create and connect async SmithersDB instance"""
    db = create_smithers_db(db_path, is_async=True)
    await db.connect()
    return db