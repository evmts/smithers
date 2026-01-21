"""Tests for task lease management."""

import pytest
import sqlite3
import tempfile
import os
from datetime import datetime, timedelta

from smithers_py.db.database import SmithersDB
from smithers_py.db.migrations import run_migrations_sync
from smithers_py.engine.task_lease import (
    TaskLeaseManager,
    CancellationHandler,
    OrphanPolicy,
    recover_orphans,
)


@pytest.fixture
async def db():
    """Create a temporary database for testing."""
    with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
        db_path = f.name
    
    try:
        conn = sqlite3.connect(db_path)
        run_migrations_sync(conn)
        
        db = SmithersDB(db_path, is_async=False)
        await db.connect()
        
        # Create a test execution
        await db.execution.start("test_exec", "test.py")
        
        yield db
        
        await db.close()
    finally:
        os.unlink(db_path)


class TestTaskLeaseManager:
    """Tests for TaskLeaseManager."""
    
    @pytest.mark.asyncio
    async def test_acquire_lease_success(self, db):
        """Test acquiring a lease for a new task."""
        # Create a task
        await db.tasks.start("task-1", "test-task", db.current_execution_id, "claude")
        
        manager = TaskLeaseManager(db, process_id="test-process")
        result = await manager.acquire_lease("task-1")
        
        assert result is True
        
        # Verify lease was set
        row = await db.query_one(
            "SELECT lease_owner, lease_expires_at FROM tasks WHERE id = ?",
            ("task-1",)
        )
        assert row[0] == "test-process"
        assert row[1] is not None
    
    @pytest.mark.asyncio
    async def test_acquire_lease_already_held(self, db):
        """Test acquiring a lease that's already held by another process."""
        # Create a task and acquire lease with first manager
        await db.tasks.start("task-2", "test-task", db.current_execution_id, "claude")
        
        manager1 = TaskLeaseManager(db, process_id="process-1")
        await manager1.acquire_lease("task-2")
        
        # Try to acquire with second manager
        manager2 = TaskLeaseManager(db, process_id="process-2")
        result = await manager2.acquire_lease("task-2")
        
        assert result is False
    
    @pytest.mark.asyncio
    async def test_acquire_expired_lease(self, db):
        """Test acquiring a lease that has expired."""
        # Create a task with expired lease
        await db.tasks.start("task-3", "test-task", db.current_execution_id, "claude")
        
        # Set an expired lease
        expired_time = (datetime.now() - timedelta(hours=1)).isoformat()
        await db.execute(
            "UPDATE tasks SET lease_owner = 'old-process', lease_expires_at = ? WHERE id = ?",
            (expired_time, "task-3")
        )
        
        # Should be able to acquire
        manager = TaskLeaseManager(db, process_id="new-process")
        result = await manager.acquire_lease("task-3")
        
        assert result is True
    
    @pytest.mark.asyncio
    async def test_heartbeat(self, db):
        """Test heartbeat extends lease."""
        await db.tasks.start("task-4", "test-task", db.current_execution_id, "claude")
        
        manager = TaskLeaseManager(db, process_id="test-process")
        await manager.acquire_lease("task-4")
        
        # Get initial expiry
        row1 = await db.query_one(
            "SELECT lease_expires_at FROM tasks WHERE id = ?",
            ("task-4",)
        )
        
        # Heartbeat
        await manager.heartbeat("task-4")
        
        # Get new expiry
        row2 = await db.query_one(
            "SELECT lease_expires_at FROM tasks WHERE id = ?",
            ("task-4",)
        )
        
        # New expiry should be >= old
        assert row2[0] >= row1[0]
    
    @pytest.mark.asyncio
    async def test_release_lease(self, db):
        """Test releasing a lease."""
        await db.tasks.start("task-5", "test-task", db.current_execution_id, "claude")
        
        manager = TaskLeaseManager(db, process_id="test-process")
        await manager.acquire_lease("task-5")
        await manager.release_lease("task-5")
        
        # Lease should be cleared
        row = await db.query_one(
            "SELECT lease_owner, lease_expires_at FROM tasks WHERE id = ?",
            ("task-5",)
        )
        assert row[0] is None
        assert row[1] is None


class TestCancellationHandler:
    """Tests for CancellationHandler."""
    
    @pytest.mark.asyncio
    async def test_request_cancel(self, db):
        """Test requesting cancellation."""
        handler = CancellationHandler(db)
        
        handler.request_cancel("task-1")
        
        assert handler.is_cancelled("task-1") is True
        assert handler.is_cancelled("task-2") is False
    
    @pytest.mark.asyncio
    async def test_cancel_task_sets_status(self, db):
        """Test cancel_task sets status to cancelling."""
        await db.tasks.start("task-c1", "test-task", db.current_execution_id, "claude")
        
        handler = CancellationHandler(db)
        await handler.cancel_task("task-c1")
        
        row = await db.query_one(
            "SELECT status FROM tasks WHERE id = ?",
            ("task-c1",)
        )
        assert row[0] == "cancelling"
    
    @pytest.mark.asyncio
    async def test_mark_cancelled(self, db):
        """Test marking task as cancelled."""
        await db.tasks.start("task-c2", "test-task", db.current_execution_id, "claude")
        
        handler = CancellationHandler(db)
        await handler.cancel_task("task-c2")
        await handler.mark_cancelled("task-c2")
        
        row = await db.query_one(
            "SELECT status FROM tasks WHERE id = ?",
            ("task-c2",)
        )
        assert row[0] == "cancelled"


class TestOrphanRecovery:
    """Tests for orphan task recovery."""
    
    @pytest.mark.asyncio
    async def test_recover_orphans_retry(self, db):
        """Test recovering orphaned tasks with retry policy."""
        # Create a task with expired lease
        await db.tasks.start("orphan-1", "orphan-task", db.current_execution_id, "claude")
        
        expired_time = (datetime.now() - timedelta(hours=1)).isoformat()
        await db.execute(
            """UPDATE tasks 
               SET status = 'running', 
                   lease_owner = 'dead-process', 
                   lease_expires_at = ?,
                   retry_count = 0
               WHERE id = ?""",
            (expired_time, "orphan-1")
        )
        
        actions = await recover_orphans(db, OrphanPolicy.RETRY)
        
        assert len(actions) == 1
        assert actions[0].task_id == "orphan-1"
        assert actions[0].action == "retry"
        
        # Task should be reset to pending
        row = await db.query_one(
            "SELECT status, retry_count FROM tasks WHERE id = ?",
            ("orphan-1",)
        )
        assert row[0] == "pending"
        assert row[1] == 1
    
    @pytest.mark.asyncio
    async def test_recover_orphans_fail_after_max_retries(self, db):
        """Test orphaned task marked as failed after max retries."""
        await db.tasks.start("orphan-2", "orphan-task", db.current_execution_id, "claude")
        
        expired_time = (datetime.now() - timedelta(hours=1)).isoformat()
        await db.execute(
            """UPDATE tasks 
               SET status = 'running', 
                   lease_owner = 'dead-process', 
                   lease_expires_at = ?,
                   retry_count = 5
               WHERE id = ?""",
            (expired_time, "orphan-2")
        )
        
        actions = await recover_orphans(db, OrphanPolicy.RETRY, max_retries=3)
        
        assert len(actions) == 1
        assert actions[0].action == "fail"
        
        row = await db.query_one(
            "SELECT status FROM tasks WHERE id = ?",
            ("orphan-2",)
        )
        assert row[0] == "orphaned"
    
    @pytest.mark.asyncio
    async def test_recover_orphans_ignore(self, db):
        """Test orphan recovery with ignore policy."""
        await db.tasks.start("orphan-3", "orphan-task", db.current_execution_id, "claude")
        
        expired_time = (datetime.now() - timedelta(hours=1)).isoformat()
        await db.execute(
            """UPDATE tasks 
               SET status = 'running', 
                   lease_owner = 'dead-process', 
                   lease_expires_at = ?
               WHERE id = ?""",
            (expired_time, "orphan-3")
        )
        
        actions = await recover_orphans(db, OrphanPolicy.IGNORE)
        
        assert len(actions) == 0
        
        row = await db.query_one(
            "SELECT status FROM tasks WHERE id = ?",
            ("orphan-3",)
        )
        assert row[0] == "orphaned"
