"""SQLite-backed persistent state store implementation."""

import sqlite3
import json
import copy
from typing import Dict, Any, Optional, List
from datetime import datetime
from .base import StateStore, WriteOp


class SqliteStore:
    """Execution-scoped SQLite state store with batched writes and audit logging."""

    def __init__(self, db_path: str, execution_id: str) -> None:
        """Initialize with database path and execution ID.

        Args:
            db_path: Path to SQLite database file
            execution_id: Unique ID for this execution scope
        """
        self.db_path = db_path
        self.db = sqlite3.connect(db_path)
        self.db.row_factory = sqlite3.Row
        self.execution_id = execution_id
        self._write_queue: List[WriteOp] = []
        self._init_tables()

    def _init_tables(self) -> None:
        """Initialize execution_state and execution_transitions tables."""
        # These tables are execution-scoped, not global

        create_state_table = """
            CREATE TABLE IF NOT EXISTS execution_state (
                execution_id TEXT NOT NULL,
                key TEXT NOT NULL,
                value TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (execution_id, key)
            )
        """

        create_transitions_table = """
            CREATE TABLE IF NOT EXISTS execution_transitions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                execution_id TEXT NOT NULL,
                key TEXT NOT NULL,
                old_value TEXT,
                new_value TEXT,
                trigger TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """

        create_state_index = """
            CREATE INDEX IF NOT EXISTS idx_execution_state_exec
            ON execution_state(execution_id)
        """

        create_transitions_index = """
            CREATE INDEX IF NOT EXISTS idx_execution_transitions_exec_time
            ON execution_transitions(execution_id, timestamp)
        """

        self.db.execute(create_state_table)
        self.db.execute(create_transitions_table)
        self.db.execute(create_state_index)
        self.db.execute(create_transitions_index)
        self.db.commit()

    def _serialize_value(self, value: Any) -> str:
        """Serialize value to JSON string."""
        if value is None:
            return "null"
        return json.dumps(value, ensure_ascii=False, separators=(',', ':'))

    def _deserialize_value(self, value_str: str) -> Any:
        """Deserialize JSON string to value."""
        if value_str == "null":
            return None
        try:
            return json.loads(value_str)
        except json.JSONDecodeError:
            # Fallback for non-JSON strings
            return value_str

    def get(self, key: str) -> Any:
        """Get value for key from current state."""
        cursor = self.db.execute(
            "SELECT value FROM execution_state WHERE execution_id = ? AND key = ?",
            (self.execution_id, key)
        )
        row = cursor.fetchone()

        if row is None:
            return None
        return self._deserialize_value(row[0])

    def set(self, key: str, value: Any, trigger: Optional[str] = None) -> None:
        """Queue a write operation. Changes not applied until commit()."""
        self._write_queue.append(WriteOp(key=key, value=value, trigger=trigger))

    def snapshot(self) -> Dict[str, Any]:
        """Return frozen snapshot of current state for render."""
        cursor = self.db.execute(
            "SELECT key, value FROM execution_state WHERE execution_id = ?",
            (self.execution_id,)
        )
        data = {}
        for key, value_str in cursor:
            data[key] = self._deserialize_value(value_str)
        return copy.deepcopy(data)

    def enqueue(self, ops: List[WriteOp]) -> None:
        """Queue multiple write operations."""
        self._write_queue.extend(ops)

    def commit(self) -> None:
        """Apply all queued write operations atomically."""
        if not self._write_queue:
            return

        with self.db:
            for op in self._write_queue:
                # Get current value for audit log
                current_value = self.get(op.key)
                current_value_str = self._serialize_value(current_value) if current_value is not None else None

                if op.value is None:
                    # Delete operation
                    self.db.execute(
                        "DELETE FROM execution_state WHERE execution_id = ? AND key = ?",
                        (self.execution_id, op.key)
                    )
                    new_value_str = None
                else:
                    # Set operation
                    new_value_str = self._serialize_value(op.value)
                    self.db.execute(
                        """INSERT OR REPLACE INTO execution_state (execution_id, key, value, updated_at)
                           VALUES (?, ?, ?, ?)""",
                        (self.execution_id, op.key, new_value_str, op.timestamp or datetime.now())
                    )

                # Log transition for audit
                self.db.execute(
                    """INSERT INTO execution_transitions (execution_id, key, old_value, new_value, trigger, timestamp)
                       VALUES (?, ?, ?, ?, ?, ?)""",
                    (self.execution_id, op.key, current_value_str, new_value_str,
                     op.trigger, op.timestamp or datetime.now())
                )

        # Clear the queue
        self._write_queue.clear()

    def has_pending_writes(self) -> bool:
        """Check if there are pending writes to commit."""
        return bool(self._write_queue)

    def clear_queue(self) -> None:
        """Clear pending write queue without applying."""
        self._write_queue.clear()

    def get_transitions(self, key: Optional[str] = None, limit: int = 100) -> List[Dict[str, Any]]:
        """Get audit log of state transitions."""
        if key is None:
            cursor = self.db.execute(
                """SELECT key, old_value, new_value, trigger, timestamp
                   FROM execution_transitions
                   WHERE execution_id = ?
                   ORDER BY timestamp DESC LIMIT ?""",
                (self.execution_id, limit)
            )
        else:
            cursor = self.db.execute(
                """SELECT key, old_value, new_value, trigger, timestamp
                   FROM execution_transitions
                   WHERE execution_id = ? AND key = ?
                   ORDER BY timestamp DESC LIMIT ?""",
                (self.execution_id, key, limit)
            )

        transitions = []
        for row in cursor:
            key, old_value_str, new_value_str, trigger, timestamp = row
            transitions.append({
                "key": key,
                "old_value": self._deserialize_value(old_value_str) if old_value_str else None,
                "new_value": self._deserialize_value(new_value_str) if new_value_str else None,
                "trigger": trigger,
                "timestamp": timestamp
            })
        return transitions

    def close(self) -> None:
        """Close the database connection."""
        if self.db:
            self.db.close()
            self.db = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()