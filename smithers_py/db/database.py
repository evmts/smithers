"""
Smithers Database Layer for Python

A comprehensive SQLite-based database layer matching the TypeScript schema
for state management, execution tracking, and orchestration.
"""

import sqlite3
import aiosqlite
import json
import uuid
import asyncio
from datetime import datetime
from typing import Any, Dict, List, Optional, Union, Tuple, AsyncGenerator
from pathlib import Path
import os


class SqliteStore:
    """State storage compatible with TypeScript implementation"""

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
        if self._is_async:
            async with self.db.execute(
                "SELECT * FROM executions WHERE status IN ('pending', 'running') ORDER BY created_at DESC LIMIT 1"
            ) as cursor:
                row = await cursor.fetchone()
        else:
            row = self.db.execute(
                "SELECT * FROM executions WHERE status IN ('pending', 'running') ORDER BY created_at DESC LIMIT 1"
            ).fetchone()

        if row:
            # Convert row to dict (assuming columns match order)
            columns = ['id', 'name', 'source_file', 'status', 'config', 'result', 'error',
                      'end_summary', 'end_reason', 'exit_code', 'started_at', 'completed_at',
                      'created_at', 'total_iterations', 'total_agents', 'total_tool_calls', 'total_tokens_used']
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
        self.state: Optional[SqliteStore] = None
        self.tasks: Optional[TasksModule] = None
        self.frames: Optional[RenderFramesModule] = None

    async def connect(self) -> None:
        """Initialize database connection and modules"""
        if self._connection is not None:
            return

        if self.is_async:
            self._connection = await aiosqlite.connect(self.db_path)
            await self._connection.execute("PRAGMA foreign_keys = ON")
        else:
            self._connection = sqlite3.connect(self.db_path)
            self._connection.execute("PRAGMA foreign_keys = ON")

        # Initialize modules
        self.execution = ExecutionModule(self._connection)
        self.state = SqliteStore(self._connection)
        self.tasks = TasksModule(self._connection)
        self.frames = RenderFramesModule(self._connection)

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