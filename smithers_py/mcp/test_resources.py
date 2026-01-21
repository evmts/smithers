"""Tests for MCP Resource Provider."""

import json
import sqlite3
import tempfile
from datetime import datetime
from pathlib import Path

import pytest

from smithers_py.mcp.resources import MCPResourceProvider, MCPResource
from smithers_py.db.database import SmithersDB


@pytest.fixture
def temp_db():
    """Create a temporary database."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name

    # Initialize database with schema directly using sqlite3
    conn = sqlite3.connect(db_path)
    schema_path = Path(__file__).parent.parent / "db" / "schema.sql"
    with open(schema_path, 'r') as f:
        schema_sql = f.read()
    conn.executescript(schema_sql)
    conn.commit()
    conn.close()

    yield db_path

    # Cleanup
    Path(db_path).unlink()


@pytest.fixture
def provider(temp_db):
    """Create MCPResourceProvider with temp database."""
    return MCPResourceProvider(temp_db)


@pytest.fixture
def sample_execution(temp_db):
    """Create sample execution with frames and nodes."""
    conn = sqlite3.connect(temp_db)
    conn.row_factory = sqlite3.Row

    # Create execution
    exec_id = "test-exec-123"
    conn.execute("""
        INSERT INTO executions (id, name, source_file, status, created_at, updated_at, config)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        exec_id,
        "Test Execution",
        "test.smithers",
        "running",
        datetime.now().isoformat(),
        datetime.now().isoformat(),
        json.dumps({"test": True})
    ))

    # Add tags
    conn.execute("INSERT INTO execution_tags (execution_id, tag) VALUES (?, ?)", (exec_id, "test"))
    conn.execute("INSERT INTO execution_tags (execution_id, tag) VALUES (?, ?)", (exec_id, "sample"))

    # Create frames
    for i in range(5):
        frame_id = f"frame-{i}"
        conn.execute("""
            INSERT INTO frames (id, execution_id, sequence, created_at, status, phase_path, step_index)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            frame_id,
            exec_id,
            i,
            datetime.now().isoformat(),
            "completed",
            f"phase{i}",
            i * 10
        ))

        # Add nodes to frame
        for j in range(3):
            conn.execute("""
                INSERT INTO frame_nodes (frame_id, node_id, node_type, path, status, metadata)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (
                frame_id,
                f"node-{i}-{j}",
                "test_node",
                f"path/to/node/{i}/{j}",
                "active" if j == 0 else "completed",
                json.dumps({"index": j})
            ))

    # Create node instances
    conn.execute("""
        INSERT INTO node_instances (execution_id, node_id, node_type, path, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (
        exec_id,
        "node-0-0",
        "test_node",
        "path/to/node/0/0",
        "active",
        datetime.now().isoformat()
    ))

    # Create events (using actual schema column names)
    for i in range(10):
        conn.execute("""
            INSERT INTO events (execution_id, source, node_id, event_type, payload, timestamp)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            exec_id,
            "test",
            f"node-{i % 5}-0" if i % 2 == 0 else None,
            f"event_type_{i % 3}",
            json.dumps({"event_index": i}),
            datetime.now().isoformat()
        ))

    conn.commit()
    conn.close()

    return exec_id


class TestMCPResource:
    """Test MCPResource model."""

    def test_basic_resource(self):
        """Test basic resource creation."""
        resource = MCPResource(
            uri="smithers://test",
            data={"key": "value"}
        )

        assert resource.uri == "smithers://test"
        assert resource.mime_type == "application/json"
        assert resource.data == {"key": "value"}
        assert resource.metadata is None

    def test_to_response_with_dict(self):
        """Test converting dict data to response."""
        resource = MCPResource(
            uri="smithers://test",
            data={"key": "value"},
            metadata={"type": "test"}
        )

        response = resource.to_response()
        assert response["uri"] == "smithers://test"
        assert response["mimeType"] == "application/json"
        assert json.loads(response["contents"]) == {"key": "value"}
        assert response["metadata"] == {"type": "test"}

    def test_to_response_with_string(self):
        """Test converting string data to response."""
        resource = MCPResource(
            uri="smithers://test",
            data="plain text content"
        )

        response = resource.to_response()
        assert response["uri"] == "smithers://test"
        assert response["mimeType"] == "application/json"
        assert response["contents"] == "plain text content"
        assert "metadata" not in response


class TestMCPResourceProvider:
    """Test MCPResourceProvider."""

    def test_unknown_scheme(self, provider):
        """Test handling unknown URI scheme."""
        result = provider.resolve("http://example.com")
        assert result is None

    def test_unknown_resource(self, provider):
        """Test handling unknown resource path."""
        result = provider.resolve("smithers://unknown/resource")
        assert result.uri == "smithers://unknown/resource"
        data = result.data
        assert data["type"] == "not_found"
        assert "Unknown resource" in data["error"]

    def test_list_executions_empty(self, provider):
        """Test listing executions when none exist."""
        result = provider.resolve("smithers://executions")
        assert result.uri == "smithers://executions"
        data = result.data
        assert data["items"] == []
        assert data["total"] == 0
        assert data["page"] == 1
        assert data["per_page"] == 20
        assert data["has_next"] is False
        assert data["has_prev"] is False

    def test_list_executions_with_data(self, provider, sample_execution):
        """Test listing executions with data."""
        result = provider.resolve("smithers://executions")
        data = result.data

        assert data["total"] == 1
        assert len(data["items"]) == 1

        exec_item = data["items"][0]
        assert exec_item["id"] == sample_execution
        assert exec_item["name"] == "Test Execution"
        assert exec_item["source_file"] == "test.smithers"
        assert exec_item["status"] == "running"
        assert exec_item["total_frames"] == 5
        assert exec_item["current_frame"] == 4
        assert set(exec_item["tags"]) == {"test", "sample"}

    def test_list_executions_pagination(self, provider, temp_db):
        """Test execution list pagination."""
        # Create 25 executions
        conn = sqlite3.connect(temp_db)
        for i in range(25):
            conn.execute("""
                INSERT INTO executions (id, name, source_file, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (
                f"exec-{i:02d}",
                f"Execution {i}",
                "test.smithers",
                "completed",
                datetime.now().isoformat(),
                datetime.now().isoformat()
            ))
        conn.commit()
        conn.close()

        # Test first page
        result = provider.resolve("smithers://executions?page=1&per_page=10")
        data = result.data
        assert data["total"] == 25
        assert len(data["items"]) == 10
        assert data["has_next"] is True
        assert data["has_prev"] is False
        assert data["next_cursor"] == "2"

        # Test second page
        result = provider.resolve("smithers://executions?page=2&per_page=10")
        data = result.data
        assert len(data["items"]) == 10
        assert data["has_next"] is True
        assert data["has_prev"] is True
        assert data["prev_cursor"] == "1"
        assert data["next_cursor"] == "3"

        # Test last page
        result = provider.resolve("smithers://executions?page=3&per_page=10")
        data = result.data
        assert len(data["items"]) == 5
        assert data["has_next"] is False
        assert data["has_prev"] is True

    def test_get_execution(self, provider, sample_execution):
        """Test getting execution detail."""
        result = provider.resolve(f"smithers://executions/{sample_execution}")
        data = result.data

        assert data["id"] == sample_execution
        assert data["name"] == "Test Execution"
        assert data["source_file"] == "test.smithers"
        assert data["status"] == "running"
        assert data["total_frames"] == 5
        assert data["current_frame"] == 4
        assert set(data["tags"]) == {"test", "sample"}
        assert data["config"] == {"test": True}

        # Check node stats
        assert "node_stats" in data
        stats = data["node_stats"]
        assert stats["total_nodes"] == 1
        assert stats["active_nodes"] == 1

    def test_get_execution_not_found(self, provider):
        """Test getting non-existent execution."""
        result = provider.resolve("smithers://executions/nonexistent")
        data = result.data
        assert data["type"] == "not_found"
        assert "not found" in data["error"]

    def test_list_frames(self, provider, sample_execution):
        """Test listing frames for execution."""
        result = provider.resolve(f"smithers://executions/{sample_execution}/frames")
        data = result.data

        assert data["total"] == 5
        assert len(data["items"]) == 5

        # Check frames are in descending order
        frame = data["items"][0]
        assert frame["sequence"] == 4
        assert frame["status"] == "completed"
        assert frame["node_count"] == 3
        assert frame["active_nodes"] == 1
        assert frame["phase_path"] == "phase4"
        assert frame["step_index"] == 40

    def test_get_frame(self, provider, sample_execution):
        """Test getting frame detail."""
        result = provider.resolve(f"smithers://executions/{sample_execution}/frames/2")
        data = result.data

        assert data["sequence"] == 2
        assert data["status"] == "completed"
        assert data["phase_path"] == "phase2"
        assert data["step_index"] == 20

        # Check nodes
        assert len(data["nodes"]) == 3
        node = data["nodes"][0]
        assert node["node_id"] == "node-2-0"
        assert node["node_type"] == "test_node"
        assert node["status"] == "active"
        assert node["metadata"] == {"index": 0}

        # Check events
        assert "events" in data
        assert isinstance(data["events"], list)

    def test_list_events(self, provider, sample_execution):
        """Test listing events for execution."""
        result = provider.resolve(f"smithers://executions/{sample_execution}/events")
        data = result.data

        assert data["total"] == 10
        assert len(data["items"]) == 10

        # Check event structure
        event = data["items"][0]
        assert "id" in event
        assert "type" in event
        assert "created_at" in event
        assert "data" in event
        assert event["data"]["event_index"] >= 0

    def test_get_node(self, provider, sample_execution):
        """Test getting node detail."""
        result = provider.resolve(f"smithers://executions/{sample_execution}/nodes/node-0-0")
        data = result.data

        assert data["node_id"] == "node-0-0"
        assert data["node_type"] == "test_node"
        assert data["path"] == "path/to/node/0/0"
        assert data["status"] == "active"
        assert "created_at" in data

        # Should have empty runs and recent_frames
        assert data["runs"] == []
        assert isinstance(data["recent_frames"], list)

    def test_get_health(self, provider):
        """Test health endpoint."""
        result = provider.resolve("smithers://health")
        data = result.data

        assert data["status"] == "healthy"
        assert data["version"] == "0.1.0"
        assert data["database"]["status"] == "connected"
        assert "rate_limits" in data
        assert "system" in data

    def test_list_scripts(self, provider):
        """Test listing scripts (currently empty)."""
        result = provider.resolve("smithers://scripts")
        data = result.data

        assert data["items"] == []
        assert data["total"] == 0
        metadata = result.metadata
        assert "not yet implemented" in metadata["note"]

    def test_error_handling(self, provider):
        """Test error handling in resource methods."""
        # Create a provider with bad DB path
        bad_provider = MCPResourceProvider("/nonexistent/path.db")

        # Should return error response, not raise
        result = bad_provider.resolve("smithers://executions")
        data = result.data
        assert data["type"] == "error"
        assert "error" in data

    def test_query_parameter_parsing(self, provider):
        """Test parsing of query parameters."""
        # Test with various query params
        result = provider.resolve("smithers://executions?page=3&per_page=50")
        data = result.data
        assert data["page"] == 3
        assert data["per_page"] == 50

        # Test with cursor
        result = provider.resolve("smithers://executions?cursor=abc123")
        assert result is not None  # Should not error