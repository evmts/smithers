"""Tests for MCP Server Core.

Tests the McpCore JSON-RPC handler and session management.
"""

import pytest
import asyncio
import json
import tempfile
import os
from datetime import datetime
from pathlib import Path

from smithers_py.mcp.server import (
    McpCore,
    McpSession,
    EventBuffer,
    JsonRpcError,
    ErrorCode,
)


@pytest.fixture
def temp_db():
    """Create a temporary database."""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "test.db"
        # Initialize DB with schema
        import sqlite3
        conn = sqlite3.connect(str(db_path))
        
        # Create minimal schema needed for tests
        conn.execute("""
            CREATE TABLE IF NOT EXISTS executions (
                id TEXT PRIMARY KEY,
                name TEXT,
                source_file TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                config TEXT DEFAULT '{}',
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS frames (
                id TEXT PRIMARY KEY,
                execution_id TEXT NOT NULL,
                sequence INTEGER NOT NULL,
                status TEXT DEFAULT 'completed',
                created_at TEXT DEFAULT (datetime('now'))
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS execution_tags (
                execution_id TEXT NOT NULL,
                tag TEXT NOT NULL,
                PRIMARY KEY (execution_id, tag)
            )
        """)
        conn.commit()
        conn.close()
        
        yield str(db_path)


@pytest.fixture
def mcp_core(temp_db):
    """Create MCP core instance."""
    core = McpCore(temp_db)
    yield core
    core.cleanup()


class TestMcpCore:
    """Tests for McpCore class."""
    
    @pytest.mark.asyncio
    async def test_initialize(self, mcp_core):
        """Test initialize handshake."""
        message = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-11-25",
                "capabilities": {}
            }
        }
        
        response = await mcp_core.handle(message)
        
        assert response["jsonrpc"] == "2.0"
        assert response["id"] == 1
        assert "result" in response
        assert response["result"]["protocolVersion"] == "2025-11-25"
        assert "sessionId" in response["result"]
        assert "capabilities" in response["result"]
    
    @pytest.mark.asyncio
    async def test_ping(self, mcp_core):
        """Test ping method."""
        message = {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "ping",
            "params": {}
        }
        
        response = await mcp_core.handle(message)
        
        assert response["id"] == 2
        assert response["result"]["pong"] is True
    
    @pytest.mark.asyncio
    async def test_list_resources(self, mcp_core):
        """Test resources/list method."""
        message = {
            "jsonrpc": "2.0",
            "id": 3,
            "method": "resources/list",
            "params": {}
        }
        
        response = await mcp_core.handle(message)
        
        assert "result" in response
        assert "resources" in response["result"]
        resources = response["result"]["resources"]
        assert len(resources) >= 3
        
        uris = [r["uri"] for r in resources]
        assert "smithers://executions" in uris
        assert "smithers://health" in uris
    
    @pytest.mark.asyncio
    async def test_read_resource_health(self, mcp_core):
        """Test resources/read for health endpoint."""
        message = {
            "jsonrpc": "2.0",
            "id": 4,
            "method": "resources/read",
            "params": {"uri": "smithers://health"}
        }
        
        response = await mcp_core.handle(message)
        
        assert "result" in response
        assert response["result"]["uri"] == "smithers://health"
        
        # Parse the contents
        contents = json.loads(response["result"]["contents"])
        assert contents["status"] in ("healthy", "degraded")
        assert "version" in contents
    
    @pytest.mark.asyncio
    async def test_list_tools(self, mcp_core):
        """Test tools/list method."""
        message = {
            "jsonrpc": "2.0",
            "id": 5,
            "method": "tools/list",
            "params": {}
        }
        
        response = await mcp_core.handle(message)
        
        assert "result" in response
        assert "tools" in response["result"]
        
        tools = response["result"]["tools"]
        tool_names = [t["name"] for t in tools]
        
        assert "start_execution" in tool_names
        assert "stop" in tool_names
        assert "pause" in tool_names
    
    @pytest.mark.asyncio
    async def test_method_not_found(self, mcp_core):
        """Test error for unknown method."""
        message = {
            "jsonrpc": "2.0",
            "id": 6,
            "method": "unknown/method",
            "params": {}
        }
        
        response = await mcp_core.handle(message)
        
        assert "error" in response
        assert response["error"]["code"] == ErrorCode.METHOD_NOT_FOUND.value
    
    @pytest.mark.asyncio
    async def test_invalid_jsonrpc_version(self, mcp_core):
        """Test error for wrong JSON-RPC version."""
        message = {
            "jsonrpc": "1.0",
            "id": 7,
            "method": "ping",
            "params": {}
        }
        
        response = await mcp_core.handle(message)
        
        assert "error" in response
        assert response["error"]["code"] == ErrorCode.INVALID_REQUEST.value
    
    @pytest.mark.asyncio
    async def test_session_persistence(self, mcp_core):
        """Test session is reused with same ID."""
        # First request creates session
        msg1 = {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}}
        resp1 = await mcp_core.handle(msg1)
        session_id = resp1["result"]["sessionId"]
        
        # Second request with same session ID
        msg2 = {"jsonrpc": "2.0", "id": 2, "method": "ping", "params": {}}
        await mcp_core.handle(msg2, session_id)
        
        # Session should exist and be updated
        assert session_id in mcp_core._sessions
        session = mcp_core._sessions[session_id]
        assert session.session_id == session_id


class TestEventBuffer:
    """Tests for EventBuffer class."""
    
    @pytest.mark.asyncio
    async def test_push_and_get(self):
        """Test pushing and retrieving events."""
        buffer = EventBuffer(max_size=100)
        
        id1 = await buffer.push("test.event", {"key": "value1"})
        id2 = await buffer.push("test.event", {"key": "value2"})
        
        assert id1 == 1
        assert id2 == 2
        
        events = await buffer.get_since(0)
        assert len(events) == 2
        
        events_since_1 = await buffer.get_since(1)
        assert len(events_since_1) == 1
        assert events_since_1[0]["data"]["key"] == "value2"
    
    @pytest.mark.asyncio
    async def test_max_size_oldest_drop(self):
        """Test that oldest events are dropped when buffer full."""
        buffer = EventBuffer(max_size=3, drop_policy="oldest")
        
        await buffer.push("e", {"n": 1})
        await buffer.push("e", {"n": 2})
        await buffer.push("e", {"n": 3})
        await buffer.push("e", {"n": 4})
        
        events = await buffer.get_since(0)
        
        # Should have events 2, 3, 4 (oldest dropped)
        assert len(events) == 3
        nums = [e["data"]["n"] for e in events]
        assert nums == [2, 3, 4]
    
    @pytest.mark.asyncio
    async def test_newest_drop_policy(self):
        """Test newest drop policy."""
        buffer = EventBuffer(max_size=2, drop_policy="newest")
        
        id1 = await buffer.push("e", {"n": 1})
        id2 = await buffer.push("e", {"n": 2})
        id3 = await buffer.push("e", {"n": 3})  # Should be dropped
        
        assert id1 == 1
        assert id2 == 2
        assert id3 == -1  # Dropped
        
        events = await buffer.get_since(0)
        assert len(events) == 2


class TestMcpSession:
    """Tests for McpSession class."""
    
    def test_session_creation(self):
        """Test session defaults."""
        session = McpSession(session_id="test-123")
        
        assert session.session_id == "test-123"
        assert session.event_cursor == 0
        assert session.subscriptions == []
        assert isinstance(session.created_at, datetime)
    
    def test_subscription_tracking(self):
        """Test subscription list management."""
        session = McpSession(session_id="test-456")
        
        session.subscriptions.append("smithers://executions")
        session.subscriptions.append("smithers://health")
        
        assert len(session.subscriptions) == 2
        assert "smithers://executions" in session.subscriptions
