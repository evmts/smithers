"""
Phase and Step Progression System.

Per PRD sections 2.3.2 and milestone 4:
- Declarative progression through phases and steps
- Persisted progress for resumability
- Visible in plan tree and UI
"""

import json
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Literal, Optional


class PhaseStatus:
    """Phase execution status."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    SKIPPED = "skipped"
    FAILED = "failed"


@dataclass
class PhaseProgress:
    """Progress record for a phase."""
    phase_id: str
    execution_id: str
    name: str
    status: str = PhaseStatus.PENDING
    current_step: int = 0
    total_steps: int = 0
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class StepProgress:
    """Progress record for a step within a phase."""
    step_id: str
    phase_id: str
    execution_id: str
    name: str
    index: int
    status: str = PhaseStatus.PENDING
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error: Optional[str] = None
    result: Optional[Dict[str, Any]] = None


class PhaseRegistry:
    """
    Manages phase and step progression.
    
    Tracks progress through named phases and their steps,
    enabling resumability and visibility.
    """
    
    def __init__(self, db_connection, execution_id: str):
        """
        Initialize phase registry.
        
        Args:
            db_connection: SQLite connection
            execution_id: Current execution ID
        """
        self.db = db_connection
        self.execution_id = execution_id
        self._ensure_tables()
    
    def _ensure_tables(self) -> None:
        """Ensure phases and steps tables exist."""
        self.db.execute("""
            CREATE TABLE IF NOT EXISTS phase_progress (
                phase_id TEXT NOT NULL,
                execution_id TEXT NOT NULL,
                name TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                current_step INTEGER DEFAULT 0,
                total_steps INTEGER DEFAULT 0,
                started_at TIMESTAMP,
                completed_at TIMESTAMP,
                error TEXT,
                metadata TEXT,
                PRIMARY KEY (phase_id, execution_id)
            )
        """)
        self.db.execute("""
            CREATE TABLE IF NOT EXISTS step_progress (
                step_id TEXT NOT NULL,
                phase_id TEXT NOT NULL,
                execution_id TEXT NOT NULL,
                name TEXT NOT NULL,
                step_index INTEGER NOT NULL,
                status TEXT DEFAULT 'pending',
                started_at TIMESTAMP,
                completed_at TIMESTAMP,
                error TEXT,
                result TEXT,
                PRIMARY KEY (step_id, execution_id)
            )
        """)
        self.db.commit()
    
    # Phase operations
    
    def start_phase(
        self, 
        phase_id: str, 
        name: str,
        total_steps: int = 0,
        metadata: Optional[Dict[str, Any]] = None
    ) -> PhaseProgress:
        """
        Start or resume a phase.
        
        If phase exists, returns current state (for resumability).
        """
        # Check for existing phase
        existing = self.get_phase(phase_id)
        if existing:
            # Resume: update to running if pending
            if existing.status == PhaseStatus.PENDING:
                self._update_phase_status(phase_id, PhaseStatus.RUNNING)
                existing.status = PhaseStatus.RUNNING
            return existing
        
        # Create new phase
        now = datetime.now()
        self.db.execute(
            """INSERT INTO phase_progress 
               (phase_id, execution_id, name, status, current_step, total_steps,
                started_at, metadata)
               VALUES (?, ?, ?, 'running', 0, ?, ?, ?)""",
            (
                phase_id, 
                self.execution_id, 
                name, 
                total_steps,
                now.isoformat(),
                json.dumps(metadata) if metadata else None
            )
        )
        self.db.commit()
        
        return PhaseProgress(
            phase_id=phase_id,
            execution_id=self.execution_id,
            name=name,
            status=PhaseStatus.RUNNING,
            current_step=0,
            total_steps=total_steps,
            started_at=now,
            metadata=metadata or {}
        )
    
    def complete_phase(self, phase_id: str) -> None:
        """Mark phase as completed."""
        now = datetime.now()
        self.db.execute(
            """UPDATE phase_progress 
               SET status = 'completed', completed_at = ?
               WHERE phase_id = ? AND execution_id = ?""",
            (now.isoformat(), phase_id, self.execution_id)
        )
        self.db.commit()
    
    def fail_phase(self, phase_id: str, error: str) -> None:
        """Mark phase as failed."""
        now = datetime.now()
        self.db.execute(
            """UPDATE phase_progress 
               SET status = 'failed', completed_at = ?, error = ?
               WHERE phase_id = ? AND execution_id = ?""",
            (now.isoformat(), error, phase_id, self.execution_id)
        )
        self.db.commit()
    
    def skip_phase(self, phase_id: str, reason: Optional[str] = None) -> None:
        """Mark phase as skipped."""
        self.db.execute(
            """UPDATE phase_progress 
               SET status = 'skipped', error = ?
               WHERE phase_id = ? AND execution_id = ?""",
            (reason, phase_id, self.execution_id)
        )
        self.db.commit()
    
    def get_phase(self, phase_id: str) -> Optional[PhaseProgress]:
        """Get phase progress by ID."""
        row = self.db.execute(
            """SELECT phase_id, execution_id, name, status, current_step,
                      total_steps, started_at, completed_at, error, metadata
               FROM phase_progress
               WHERE phase_id = ? AND execution_id = ?""",
            (phase_id, self.execution_id)
        ).fetchone()
        
        if not row:
            return None
        
        return PhaseProgress(
            phase_id=row[0],
            execution_id=row[1],
            name=row[2],
            status=row[3],
            current_step=row[4],
            total_steps=row[5],
            started_at=datetime.fromisoformat(row[6]) if row[6] else None,
            completed_at=datetime.fromisoformat(row[7]) if row[7] else None,
            error=row[8],
            metadata=json.loads(row[9]) if row[9] else {}
        )
    
    def get_current_phase(self) -> Optional[PhaseProgress]:
        """Get the currently running phase."""
        row = self.db.execute(
            """SELECT phase_id, execution_id, name, status, current_step,
                      total_steps, started_at, completed_at, error, metadata
               FROM phase_progress
               WHERE execution_id = ? AND status = 'running'
               ORDER BY started_at DESC
               LIMIT 1""",
            (self.execution_id,)
        ).fetchone()
        
        if not row:
            return None
        
        return PhaseProgress(
            phase_id=row[0],
            execution_id=row[1],
            name=row[2],
            status=row[3],
            current_step=row[4],
            total_steps=row[5],
            started_at=datetime.fromisoformat(row[6]) if row[6] else None,
            completed_at=datetime.fromisoformat(row[7]) if row[7] else None,
            error=row[8],
            metadata=json.loads(row[9]) if row[9] else {}
        )
    
    def list_phases(self) -> List[PhaseProgress]:
        """List all phases for this execution."""
        rows = self.db.execute(
            """SELECT phase_id, execution_id, name, status, current_step,
                      total_steps, started_at, completed_at, error, metadata
               FROM phase_progress
               WHERE execution_id = ?
               ORDER BY started_at""",
            (self.execution_id,)
        ).fetchall()
        
        return [
            PhaseProgress(
                phase_id=row[0],
                execution_id=row[1],
                name=row[2],
                status=row[3],
                current_step=row[4],
                total_steps=row[5],
                started_at=datetime.fromisoformat(row[6]) if row[6] else None,
                completed_at=datetime.fromisoformat(row[7]) if row[7] else None,
                error=row[8],
                metadata=json.loads(row[9]) if row[9] else {}
            )
            for row in rows
        ]
    
    def _update_phase_status(self, phase_id: str, status: str) -> None:
        """Update phase status."""
        now = datetime.now()
        started_at = now.isoformat() if status == PhaseStatus.RUNNING else None
        
        if started_at:
            self.db.execute(
                """UPDATE phase_progress 
                   SET status = ?, started_at = COALESCE(started_at, ?)
                   WHERE phase_id = ? AND execution_id = ?""",
                (status, started_at, phase_id, self.execution_id)
            )
        else:
            self.db.execute(
                """UPDATE phase_progress 
                   SET status = ?
                   WHERE phase_id = ? AND execution_id = ?""",
                (status, phase_id, self.execution_id)
            )
        self.db.commit()
    
    # Step operations
    
    def start_step(
        self, 
        step_id: str, 
        phase_id: str,
        name: str,
        index: int
    ) -> StepProgress:
        """
        Start or resume a step.
        """
        # Check for existing step
        existing = self.get_step(step_id)
        if existing:
            if existing.status == PhaseStatus.PENDING:
                self._update_step_status(step_id, PhaseStatus.RUNNING)
                existing.status = PhaseStatus.RUNNING
            return existing
        
        # Create new step
        now = datetime.now()
        self.db.execute(
            """INSERT INTO step_progress 
               (step_id, phase_id, execution_id, name, step_index, status, started_at)
               VALUES (?, ?, ?, ?, ?, 'running', ?)""",
            (step_id, phase_id, self.execution_id, name, index, now.isoformat())
        )
        
        # Update phase current step
        self.db.execute(
            """UPDATE phase_progress SET current_step = ? 
               WHERE phase_id = ? AND execution_id = ?""",
            (index + 1, phase_id, self.execution_id)
        )
        self.db.commit()
        
        return StepProgress(
            step_id=step_id,
            phase_id=phase_id,
            execution_id=self.execution_id,
            name=name,
            index=index,
            status=PhaseStatus.RUNNING,
            started_at=now
        )
    
    def complete_step(self, step_id: str, result: Optional[Dict[str, Any]] = None) -> None:
        """Mark step as completed."""
        now = datetime.now()
        self.db.execute(
            """UPDATE step_progress 
               SET status = 'completed', completed_at = ?, result = ?
               WHERE step_id = ? AND execution_id = ?""",
            (now.isoformat(), json.dumps(result) if result else None, 
             step_id, self.execution_id)
        )
        self.db.commit()
    
    def fail_step(self, step_id: str, error: str) -> None:
        """Mark step as failed."""
        now = datetime.now()
        self.db.execute(
            """UPDATE step_progress 
               SET status = 'failed', completed_at = ?, error = ?
               WHERE step_id = ? AND execution_id = ?""",
            (now.isoformat(), error, step_id, self.execution_id)
        )
        self.db.commit()
    
    def get_step(self, step_id: str) -> Optional[StepProgress]:
        """Get step progress by ID."""
        row = self.db.execute(
            """SELECT step_id, phase_id, execution_id, name, step_index,
                      status, started_at, completed_at, error, result
               FROM step_progress
               WHERE step_id = ? AND execution_id = ?""",
            (step_id, self.execution_id)
        ).fetchone()
        
        if not row:
            return None
        
        return StepProgress(
            step_id=row[0],
            phase_id=row[1],
            execution_id=row[2],
            name=row[3],
            index=row[4],
            status=row[5],
            started_at=datetime.fromisoformat(row[6]) if row[6] else None,
            completed_at=datetime.fromisoformat(row[7]) if row[7] else None,
            error=row[8],
            result=json.loads(row[9]) if row[9] else None
        )
    
    def list_steps(self, phase_id: str) -> List[StepProgress]:
        """List all steps for a phase."""
        rows = self.db.execute(
            """SELECT step_id, phase_id, execution_id, name, step_index,
                      status, started_at, completed_at, error, result
               FROM step_progress
               WHERE phase_id = ? AND execution_id = ?
               ORDER BY step_index""",
            (phase_id, self.execution_id)
        ).fetchall()
        
        return [
            StepProgress(
                step_id=row[0],
                phase_id=row[1],
                execution_id=row[2],
                name=row[3],
                index=row[4],
                status=row[5],
                started_at=datetime.fromisoformat(row[6]) if row[6] else None,
                completed_at=datetime.fromisoformat(row[7]) if row[7] else None,
                error=row[8],
                result=json.loads(row[9]) if row[9] else None
            )
            for row in rows
        ]
    
    def _update_step_status(self, step_id: str, status: str) -> None:
        """Update step status."""
        now = datetime.now()
        
        if status == PhaseStatus.RUNNING:
            self.db.execute(
                """UPDATE step_progress 
                   SET status = ?, started_at = COALESCE(started_at, ?)
                   WHERE step_id = ? AND execution_id = ?""",
                (status, now.isoformat(), step_id, self.execution_id)
            )
        else:
            self.db.execute(
                """UPDATE step_progress SET status = ?
                   WHERE step_id = ? AND execution_id = ?""",
                (status, step_id, self.execution_id)
            )
        self.db.commit()
    
    # Progress path helpers
    
    def get_progress_path(self) -> str:
        """
        Get current progress as a path string.
        
        Example: "research/step-2" or "implement/step-1"
        """
        current_phase = self.get_current_phase()
        if not current_phase:
            return "/"
        
        return f"{current_phase.name}/step-{current_phase.current_step}"


__all__ = [
    "PhaseRegistry", 
    "PhaseProgress", 
    "StepProgress",
    "PhaseStatus"
]
