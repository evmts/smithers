"""
Task Lease Manager for crash-safe task execution.

Implements the lease protocol from PRD section 7.3.2:
- Leases prevent double-execution after crashes
- Heartbeats extend leases during long-running tasks
- Orphan recovery on startup

Uses SQLite tasks table with lease_owner, lease_expires_at, heartbeat_at columns.
"""

import asyncio
import os
import uuid
from datetime import datetime, timedelta
from typing import Optional, List
from dataclasses import dataclass
from enum import Enum

from ..db.database import SmithersDB


class OrphanPolicy(str, Enum):
    """Policy for handling orphaned tasks on startup."""
    RETRY = "retry"  # Retry the task
    FAIL = "fail"    # Mark as failed
    IGNORE = "ignore"  # Leave as orphaned


@dataclass
class TaskAction:
    """Action to take for an orphaned task."""
    task_id: str
    action: str  # "retry" or "fail"


@dataclass
class RetryTask(TaskAction):
    action: str = "retry"


@dataclass
class MarkFailed(TaskAction):
    action: str = "fail"


class TaskLeaseManager:
    """
    Manages task leases for crash safety.
    
    Each running task holds a lease that expires after lease_duration_ms.
    The task must heartbeat before expiry to maintain the lease.
    On startup, expired leases indicate orphaned tasks from crashed processes.
    """
    
    lease_duration_ms: int = 30_000  # 30 seconds
    heartbeat_interval_ms: int = 10_000  # 10 seconds
    
    def __init__(self, db: SmithersDB, process_id: Optional[str] = None):
        self.db = db
        self.process_id = process_id or f"pid-{os.getpid()}-{uuid.uuid4().hex[:8]}"
        self._heartbeat_tasks: dict[str, asyncio.Task] = {}
    
    async def acquire_lease(self, task_id: str) -> bool:
        """
        Attempt to acquire lease for a task.
        
        Returns False if already leased by another process.
        """
        now = datetime.now()
        expires_at = now + timedelta(milliseconds=self.lease_duration_ms)
        
        # Check if task exists and is not already leased
        result = await self.db.query_one(
            """SELECT lease_owner, lease_expires_at FROM tasks WHERE id = ?""",
            (task_id,)
        )
        
        if result is None:
            # Task doesn't exist - can't acquire lease
            return False
        
        current_owner, current_expires = result
        
        # Check if lease is held and not expired
        if current_owner and current_expires:
            expires_dt = datetime.fromisoformat(current_expires)
            if expires_dt > now and current_owner != self.process_id:
                # Another process holds a valid lease
                return False
        
        # Acquire or renew lease
        await self.db.execute(
            """UPDATE tasks 
               SET lease_owner = ?, lease_expires_at = ?, heartbeat_at = ?
               WHERE id = ?""",
            (self.process_id, expires_at.isoformat(), now.isoformat(), task_id)
        )
        
        return True
    
    async def heartbeat(self, task_id: str) -> None:
        """
        Extend lease. Called periodically during execution.
        
        Should be called at heartbeat_interval_ms intervals.
        """
        now = datetime.now()
        expires_at = now + timedelta(milliseconds=self.lease_duration_ms)
        
        await self.db.execute(
            """UPDATE tasks 
               SET lease_expires_at = ?, heartbeat_at = ?
               WHERE id = ? AND lease_owner = ?""",
            (expires_at.isoformat(), now.isoformat(), task_id, self.process_id)
        )
    
    async def release_lease(self, task_id: str) -> None:
        """Release lease on completion."""
        await self.db.execute(
            """UPDATE tasks 
               SET lease_owner = NULL, lease_expires_at = NULL
               WHERE id = ? AND lease_owner = ?""",
            (task_id, self.process_id)
        )
        
        # Cancel heartbeat task if running
        if task_id in self._heartbeat_tasks:
            self._heartbeat_tasks[task_id].cancel()
            del self._heartbeat_tasks[task_id]
    
    def start_heartbeat(self, task_id: str) -> None:
        """Start automatic heartbeat for a task."""
        if task_id in self._heartbeat_tasks:
            return  # Already running
        
        async def heartbeat_loop():
            interval = self.heartbeat_interval_ms / 1000.0
            while True:
                await asyncio.sleep(interval)
                try:
                    await self.heartbeat(task_id)
                except Exception:
                    # Log but continue - task may have been released
                    pass
        
        self._heartbeat_tasks[task_id] = asyncio.create_task(heartbeat_loop())
    
    def stop_heartbeat(self, task_id: str) -> None:
        """Stop automatic heartbeat for a task."""
        if task_id in self._heartbeat_tasks:
            self._heartbeat_tasks[task_id].cancel()
            del self._heartbeat_tasks[task_id]


async def recover_orphans(
    db: SmithersDB, 
    policy: OrphanPolicy = OrphanPolicy.RETRY,
    max_retries: int = 3
) -> List[TaskAction]:
    """
    Called on engine startup to handle tasks from crashed processes.
    
    Finds tasks with expired leases and applies the orphan policy.
    """
    now = datetime.now()
    
    # Find orphaned tasks (running status but expired lease)
    orphans = await db.query(
        """SELECT id, retry_count FROM tasks
           WHERE status = 'running'
           AND lease_expires_at IS NOT NULL
           AND lease_expires_at < ?""",
        (now.isoformat(),)
    )
    
    actions: List[TaskAction] = []
    
    for task_row in orphans:
        task_id = task_row[0]
        retry_count = task_row[1] or 0
        
        if policy == OrphanPolicy.IGNORE:
            # Mark as orphaned but take no action
            await db.execute(
                "UPDATE tasks SET status = 'orphaned' WHERE id = ?",
                (task_id,)
            )
            continue
        
        if policy == OrphanPolicy.RETRY and retry_count < max_retries:
            # Retry the task
            actions.append(RetryTask(task_id=task_id))
            await db.execute(
                """UPDATE tasks 
                   SET status = 'pending', 
                       retry_count = ?, 
                       lease_owner = NULL,
                       lease_expires_at = NULL
                   WHERE id = ?""",
                (retry_count + 1, task_id)
            )
        else:
            # Mark as failed (exceeded retries or policy is FAIL)
            actions.append(MarkFailed(task_id=task_id))
            await db.execute(
                """UPDATE tasks 
                   SET status = 'orphaned',
                       lease_owner = NULL,
                       lease_expires_at = NULL
                   WHERE id = ?""",
                (task_id,)
            )
    
    return actions


class CancellationHandler:
    """
    Handles task cancellation when nodes disappear from the plan tree.
    
    Per PRD section 7.3.4: When a node is unmounted while its task is running,
    the task should be cancelled. If it completes anyway, the result is recorded
    but handlers are NOT fired.
    """
    
    def __init__(self, db: SmithersDB):
        self.db = db
        self._cancellation_signals: dict[str, asyncio.Event] = {}
    
    def request_cancel(self, task_id: str) -> None:
        """Request cancellation of a task."""
        if task_id not in self._cancellation_signals:
            self._cancellation_signals[task_id] = asyncio.Event()
        self._cancellation_signals[task_id].set()
    
    def is_cancelled(self, task_id: str) -> bool:
        """Check if cancellation was requested."""
        if task_id in self._cancellation_signals:
            return self._cancellation_signals[task_id].is_set()
        return False
    
    async def cancel_task(self, task_id: str) -> None:
        """
        Cancel a running task:
        1. Set status to 'cancelling'
        2. Send cancel signal to executor
        3. If task completes anyway:
           - Record completion (for audit)
           - Do NOT fire event handlers (node is gone)
           - Set status to 'cancelled'
        """
        # Set cancelling status
        await self.db.execute(
            "UPDATE tasks SET status = 'cancelling' WHERE id = ?",
            (task_id,)
        )
        
        # Signal cancellation
        self.request_cancel(task_id)
    
    async def mark_cancelled(self, task_id: str) -> None:
        """Mark task as cancelled after cancellation signal processed."""
        await self.db.execute(
            "UPDATE tasks SET status = 'cancelled' WHERE id = ?",
            (task_id,)
        )
        
        # Clean up signal
        if task_id in self._cancellation_signals:
            del self._cancellation_signals[task_id]
    
    def get_cancellation_event(self, task_id: str) -> asyncio.Event:
        """Get or create cancellation event for a task."""
        if task_id not in self._cancellation_signals:
            self._cancellation_signals[task_id] = asyncio.Event()
        return self._cancellation_signals[task_id]
