"""
Loop Execution State Management.

Per PRD sections 2.3.2 and milestone 4:
- While/Ralph loops with persisted iteration
- Resumable after crash
- Stable IDs per iteration
"""

import json
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Literal, Optional


@dataclass
class LoopState:
    """Persisted state for a loop node."""
    loop_id: str
    execution_id: str
    loop_type: Literal["while", "ralph"]
    current_iteration: int = 0
    max_iterations: int = 100
    status: Literal["running", "completed", "stopped", "max_reached"] = "running"
    started_at: Optional[datetime] = None
    last_iteration_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    stop_reason: Optional[str] = None


class LoopRegistry:
    """
    Manages loop state persistence and iteration tracking.
    
    Ensures loops can resume from their last iteration after crashes.
    """
    
    def __init__(self, db_connection, execution_id: str):
        """
        Initialize loop registry.
        
        Args:
            db_connection: SQLite connection
            execution_id: Current execution ID
        """
        self.db = db_connection
        self.execution_id = execution_id
        self._ensure_table()
    
    def _ensure_table(self) -> None:
        """Ensure loops table exists."""
        self.db.execute("""
            CREATE TABLE IF NOT EXISTS loops (
                loop_id TEXT NOT NULL,
                execution_id TEXT NOT NULL,
                loop_type TEXT NOT NULL,
                current_iteration INTEGER DEFAULT 0,
                max_iterations INTEGER DEFAULT 100,
                status TEXT DEFAULT 'running',
                started_at TIMESTAMP,
                last_iteration_at TIMESTAMP,
                completed_at TIMESTAMP,
                stop_reason TEXT,
                PRIMARY KEY (loop_id, execution_id)
            )
        """)
        self.db.commit()
    
    def get_or_create(
        self, 
        loop_id: str, 
        loop_type: Literal["while", "ralph"],
        max_iterations: int = 100
    ) -> LoopState:
        """
        Get existing loop state or create new one.
        
        For resumability, this returns the last iteration if loop exists.
        """
        row = self.db.execute(
            """SELECT loop_id, execution_id, loop_type, current_iteration, 
                      max_iterations, status, started_at, last_iteration_at,
                      completed_at, stop_reason
               FROM loops 
               WHERE loop_id = ? AND execution_id = ?""",
            (loop_id, self.execution_id)
        ).fetchone()
        
        if row:
            return LoopState(
                loop_id=row[0],
                execution_id=row[1],
                loop_type=row[2],
                current_iteration=row[3],
                max_iterations=row[4],
                status=row[5],
                started_at=datetime.fromisoformat(row[6]) if row[6] else None,
                last_iteration_at=datetime.fromisoformat(row[7]) if row[7] else None,
                completed_at=datetime.fromisoformat(row[8]) if row[8] else None,
                stop_reason=row[9]
            )
        
        # Create new loop state
        now = datetime.now()
        self.db.execute(
            """INSERT INTO loops 
               (loop_id, execution_id, loop_type, current_iteration, max_iterations, 
                status, started_at)
               VALUES (?, ?, ?, 0, ?, 'running', ?)""",
            (loop_id, self.execution_id, loop_type, max_iterations, now.isoformat())
        )
        self.db.commit()
        
        return LoopState(
            loop_id=loop_id,
            execution_id=self.execution_id,
            loop_type=loop_type,
            current_iteration=0,
            max_iterations=max_iterations,
            status="running",
            started_at=now
        )
    
    def increment_iteration(self, loop_id: str) -> int:
        """
        Increment iteration counter and return new value.
        
        Returns the new iteration number.
        """
        now = datetime.now()
        
        self.db.execute(
            """UPDATE loops 
               SET current_iteration = current_iteration + 1,
                   last_iteration_at = ?
               WHERE loop_id = ? AND execution_id = ?""",
            (now.isoformat(), loop_id, self.execution_id)
        )
        self.db.commit()
        
        row = self.db.execute(
            "SELECT current_iteration FROM loops WHERE loop_id = ? AND execution_id = ?",
            (loop_id, self.execution_id)
        ).fetchone()
        
        return row[0] if row else 0
    
    def should_continue(self, loop_id: str, condition_met: bool = True) -> bool:
        """
        Check if loop should continue.
        
        Args:
            loop_id: Loop identifier
            condition_met: For while loops, the condition value
            
        Returns:
            True if loop should continue, False if should stop
        """
        state = self.get_state(loop_id)
        if not state:
            return False
        
        # Check if already completed
        if state.status != "running":
            return False
        
        # Check max iterations
        if state.current_iteration >= state.max_iterations:
            self.complete(loop_id, "max_reached")
            return False
        
        # For while loops, check condition
        if state.loop_type == "while" and not condition_met:
            self.complete(loop_id, "condition_false")
            return False
        
        return True
    
    def get_state(self, loop_id: str) -> Optional[LoopState]:
        """Get current loop state."""
        row = self.db.execute(
            """SELECT loop_id, execution_id, loop_type, current_iteration,
                      max_iterations, status, started_at, last_iteration_at,
                      completed_at, stop_reason
               FROM loops 
               WHERE loop_id = ? AND execution_id = ?""",
            (loop_id, self.execution_id)
        ).fetchone()
        
        if not row:
            return None
        
        return LoopState(
            loop_id=row[0],
            execution_id=row[1],
            loop_type=row[2],
            current_iteration=row[3],
            max_iterations=row[4],
            status=row[5],
            started_at=datetime.fromisoformat(row[6]) if row[6] else None,
            last_iteration_at=datetime.fromisoformat(row[7]) if row[7] else None,
            completed_at=datetime.fromisoformat(row[8]) if row[8] else None,
            stop_reason=row[9]
        )
    
    def complete(
        self, 
        loop_id: str, 
        reason: Literal["condition_false", "max_reached", "explicit_stop", "success"] = "success"
    ) -> None:
        """Mark loop as completed."""
        now = datetime.now()
        
        status = "completed" if reason == "success" else reason.replace("_", " ")
        if reason == "max_reached":
            status = "max_reached"
        elif reason == "condition_false":
            status = "completed"
        elif reason == "explicit_stop":
            status = "stopped"
        else:
            status = "completed"
        
        self.db.execute(
            """UPDATE loops 
               SET status = ?, completed_at = ?, stop_reason = ?
               WHERE loop_id = ? AND execution_id = ?""",
            (status, now.isoformat(), reason, loop_id, self.execution_id)
        )
        self.db.commit()
    
    def reset(self, loop_id: str) -> None:
        """Reset loop to initial state (for debugging/testing)."""
        now = datetime.now()
        
        self.db.execute(
            """UPDATE loops 
               SET current_iteration = 0, status = 'running',
                   started_at = ?, last_iteration_at = NULL, 
                   completed_at = NULL, stop_reason = NULL
               WHERE loop_id = ? AND execution_id = ?""",
            (now.isoformat(), loop_id, self.execution_id)
        )
        self.db.commit()
    
    def list_active(self) -> List[LoopState]:
        """List all active (running) loops for this execution."""
        rows = self.db.execute(
            """SELECT loop_id, execution_id, loop_type, current_iteration,
                      max_iterations, status, started_at, last_iteration_at,
                      completed_at, stop_reason
               FROM loops 
               WHERE execution_id = ? AND status = 'running'
               ORDER BY started_at""",
            (self.execution_id,)
        ).fetchall()
        
        return [
            LoopState(
                loop_id=row[0],
                execution_id=row[1],
                loop_type=row[2],
                current_iteration=row[3],
                max_iterations=row[4],
                status=row[5],
                started_at=datetime.fromisoformat(row[6]) if row[6] else None,
                last_iteration_at=datetime.fromisoformat(row[7]) if row[7] else None,
                completed_at=datetime.fromisoformat(row[8]) if row[8] else None,
                stop_reason=row[9]
            )
            for row in rows
        ]


def compute_iteration_node_id(loop_id: str, iteration: int, child_key: str) -> str:
    """
    Compute stable node ID for a child within a loop iteration.
    
    This ensures stable identity across frames and restarts.
    """
    import hashlib
    path = f"{loop_id}/iter:{iteration}/{child_key}"
    return hashlib.sha256(path.encode('utf-8')).hexdigest()[:12]


__all__ = ["LoopRegistry", "LoopState", "compute_iteration_node_id"]
