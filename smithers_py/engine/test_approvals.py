"""Tests for Approval System."""

import asyncio
import json
import sqlite3
from datetime import datetime

import pytest

from smithers_py.engine.approvals import (
    ApprovalSystem,
    ApprovalKind,
    ApprovalStatus,
    ApprovalResult,
    create_file_edit_approval,
    create_command_exec_approval,
)


@pytest.fixture
def db_connection():
    """Create in-memory database with approvals table."""
    conn = sqlite3.connect(":memory:")
    conn.execute("""
        CREATE TABLE approvals (
            id TEXT PRIMARY KEY,
            execution_id TEXT NOT NULL,
            node_id TEXT NOT NULL,
            type TEXT,
            prompt TEXT,
            options TEXT,
            metadata TEXT,
            status TEXT NOT NULL,
            response TEXT,
            created_at TIMESTAMP,
            responded_at TIMESTAMP,
            responder TEXT
        )
    """)
    conn.commit()
    return conn


@pytest.fixture
def approval_system(db_connection):
    """Create approval system."""
    return ApprovalSystem(db_connection, "exec-123")


class TestApprovalSystem:
    """Tests for ApprovalSystem."""
    
    @pytest.mark.asyncio
    async def test_request_creates_pending(self, approval_system, db_connection):
        """Test that requesting approval creates pending record."""
        # Start request but don't await (it will block)
        task = asyncio.create_task(
            approval_system.request(
                node_id="claude-1",
                kind=ApprovalKind.FILE_EDIT,
                payload={"path": "/test.py", "old_content": "", "new_content": "test"},
                timeout=0.1  # Short timeout
            )
        )
        
        # Give it time to create the request
        await asyncio.sleep(0.01)
        
        # Check database
        row = db_connection.execute(
            "SELECT node_id, type, status FROM approvals WHERE execution_id = ?",
            ("exec-123",)
        ).fetchone()
        
        assert row is not None
        assert row[0] == "claude-1"
        assert row[1] == "file_edit"
        assert row[2] == "pending"
        
        # Let the timeout expire
        result = await task
        assert not result.approved
    
    @pytest.mark.asyncio
    async def test_respond_approves(self, approval_system, db_connection):
        """Test responding to approval request."""
        # Start request in background
        async def request_and_check():
            result = await approval_system.request(
                node_id="claude-1",
                kind=ApprovalKind.COMMAND_EXEC,
                payload={"command": "make build"},
                timeout=1.0
            )
            return result
        
        task = asyncio.create_task(request_and_check())
        await asyncio.sleep(0.01)
        
        # Get the request ID
        row = db_connection.execute(
            "SELECT id FROM approvals WHERE status = 'pending'"
        ).fetchone()
        request_id = row[0]
        
        # Approve it
        success = approval_system.respond(
            request_id=request_id,
            approved=True,
            responder="test-user",
            comment="Looks good"
        )
        
        assert success
        
        # Wait for result
        result = await task
        
        assert result.approved
        assert result.responder == "test-user"
        assert result.comment == "Looks good"
    
    @pytest.mark.asyncio
    async def test_respond_denies(self, approval_system, db_connection):
        """Test denying approval request."""
        task = asyncio.create_task(
            approval_system.request(
                node_id="claude-1",
                kind=ApprovalKind.EXTERNAL_API,
                payload={"api": "payment-gateway"},
                timeout=1.0
            )
        )
        await asyncio.sleep(0.01)
        
        # Get request ID
        row = db_connection.execute(
            "SELECT id FROM approvals WHERE status = 'pending'"
        ).fetchone()
        
        # Deny it
        approval_system.respond(
            request_id=row[0],
            approved=False,
            comment="Too risky"
        )
        
        result = await task
        
        assert not result.approved
        assert result.comment == "Too risky"
    
    def test_respond_invalid_request(self, approval_system):
        """Test responding to non-existent request."""
        success = approval_system.respond(
            request_id="nonexistent",
            approved=True
        )
        
        assert not success
    
    def test_list_pending(self, approval_system, db_connection):
        """Test listing pending approvals."""
        # Insert some test approvals
        db_connection.execute("""
            INSERT INTO approvals (id, execution_id, node_id, type, prompt, status, created_at)
            VALUES ('req-1', 'exec-123', 'node-1', 'file_edit', 'Edit file?', 'pending', datetime('now'))
        """)
        db_connection.execute("""
            INSERT INTO approvals (id, execution_id, node_id, type, prompt, status, created_at)
            VALUES ('req-2', 'exec-123', 'node-2', 'command_exec', 'Run command?', 'approved', datetime('now'))
        """)
        db_connection.execute("""
            INSERT INTO approvals (id, execution_id, node_id, type, prompt, status, created_at)
            VALUES ('req-3', 'exec-123', 'node-3', 'external_api', 'Call API?', 'pending', datetime('now'))
        """)
        db_connection.commit()
        
        pending = approval_system.list_pending()
        
        assert len(pending) == 2
        assert all(r.status == ApprovalStatus.PENDING for r in pending)
    
    def test_event_handler_notification(self, approval_system):
        """Test that event handlers are notified."""
        notifications = []
        
        def handler(request):
            notifications.append(request)
        
        approval_system.on_approval_requested(handler)
        
        # This will timeout but should trigger handler
        asyncio.get_event_loop().run_until_complete(
            approval_system.request(
                node_id="claude-1",
                kind=ApprovalKind.FILE_EDIT,
                payload={},
                timeout=0.01
            )
        )
        
        assert len(notifications) == 1
        assert notifications[0].node_id == "claude-1"


class TestApprovalPayloadHelpers:
    """Test helper functions for creating approval payloads."""
    
    def test_file_edit_approval(self):
        """Test file edit approval payload creation."""
        payload = create_file_edit_approval(
            path="/src/main.py",
            old_content="def main():\n    pass",
            new_content="def main():\n    print('hello')",
            operation="modify"
        )
        
        assert payload["path"] == "/src/main.py"
        assert payload["operation"] == "modify"
        assert "old_content" in payload
        assert "new_content" in payload
    
    def test_command_exec_approval(self):
        """Test command execution approval payload creation."""
        payload = create_command_exec_approval(
            command="npm run build",
            working_dir="/project",
            env={"NODE_ENV": "production"},
            estimated_duration="5 minutes"
        )
        
        assert payload["command"] == "npm run build"
        assert payload["working_dir"] == "/project"
        assert payload["env"]["NODE_ENV"] == "production"
