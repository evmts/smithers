"""Tests for Artifact System."""

import json
import sqlite3
import tempfile
from pathlib import Path

import pytest

from smithers_py.engine.artifacts import ArtifactSystem, ArtifactType, Artifact


@pytest.fixture
def db_connection():
    """Create in-memory database with artifacts table."""
    conn = sqlite3.connect(":memory:")
    conn.execute("""
        CREATE TABLE artifacts (
            id TEXT PRIMARY KEY,
            execution_id TEXT NOT NULL,
            node_id TEXT,
            frame_id INTEGER,
            key TEXT,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            content_json TEXT NOT NULL,
            created_at TIMESTAMP,
            updated_at TIMESTAMP
        )
    """)
    conn.commit()
    return conn


@pytest.fixture
def artifact_system(db_connection):
    """Create artifact system."""
    return ArtifactSystem(db_connection, "exec-123")


class TestArtifactSystem:
    """Tests for ArtifactSystem."""
    
    def test_markdown_artifact(self, artifact_system, db_connection):
        """Test creating markdown artifact."""
        artifact_id = artifact_system.markdown(
            name="Analysis Report",
            content="# Results\n\nAll tests passed."
        )
        
        assert artifact_id is not None
        
        # Verify in DB
        row = db_connection.execute(
            "SELECT name, type, content_json FROM artifacts WHERE id = ?",
            (artifact_id,)
        ).fetchone()
        
        assert row[0] == "Analysis Report"
        assert row[1] == "markdown"
        assert "# Results" in json.loads(row[2])["markdown"]
    
    def test_table_artifact(self, artifact_system, db_connection):
        """Test creating table artifact."""
        rows = [
            {"name": "test1", "status": "passed", "duration": 1.2},
            {"name": "test2", "status": "failed", "duration": 0.5},
        ]
        
        artifact_id = artifact_system.table(
            name="Test Results",
            rows=rows
        )
        
        assert artifact_id is not None
        
        # Verify content
        artifact = artifact_system.get(artifact_id)
        assert artifact is not None
        assert artifact.type == ArtifactType.TABLE
        assert artifact.content["columns"] == ["name", "status", "duration"]
        assert len(artifact.content["rows"]) == 2
    
    def test_progress_artifact(self, artifact_system):
        """Test creating progress artifact."""
        artifact_id = artifact_system.progress(
            name="Build Progress",
            current=3,
            total=10,
            message="Compiling module 3 of 10"
        )
        
        artifact = artifact_system.get(artifact_id)
        assert artifact is not None
        assert artifact.type == ArtifactType.PROGRESS
        assert artifact.content["current"] == 3
        assert artifact.content["total"] == 10
        assert artifact.content["percent"] == 30.0
    
    def test_keyed_artifact_upsert(self, artifact_system, db_connection):
        """Test that keyed artifacts update in place."""
        # Create initial
        id1 = artifact_system.progress(
            name="Build",
            current=1,
            total=5,
            key="build-progress"
        )
        
        # Update with same key
        id2 = artifact_system.progress(
            name="Build",
            current=3,
            total=5,
            key="build-progress"
        )
        
        # Should be same artifact
        assert id1 == id2
        
        # Should only be one row
        count = db_connection.execute(
            "SELECT COUNT(*) FROM artifacts WHERE execution_id = ?",
            ("exec-123",)
        ).fetchone()[0]
        assert count == 1
        
        # Content should be updated
        artifact = artifact_system.get(id1)
        assert artifact.content["current"] == 3
    
    def test_keyless_artifact_append(self, artifact_system, db_connection):
        """Test that keyless artifacts always append."""
        id1 = artifact_system.markdown(name="Log 1", content="First entry")
        id2 = artifact_system.markdown(name="Log 2", content="Second entry")
        
        assert id1 != id2
        
        # Should be two rows
        count = db_connection.execute(
            "SELECT COUNT(*) FROM artifacts WHERE execution_id = ?",
            ("exec-123",)
        ).fetchone()[0]
        assert count == 2
    
    def test_link_artifact(self, artifact_system):
        """Test creating link artifact."""
        artifact_id = artifact_system.link(
            name="Documentation",
            url="https://docs.example.com",
            description="API Reference"
        )
        
        artifact = artifact_system.get(artifact_id)
        assert artifact.type == ArtifactType.LINK
        assert artifact.content["url"] == "https://docs.example.com"
    
    def test_image_artifact(self, artifact_system):
        """Test creating image artifact."""
        artifact_id = artifact_system.image(
            name="Screenshot",
            path="/tmp/screenshot.png",
            alt_text="Test failure screenshot"
        )
        
        artifact = artifact_system.get(artifact_id)
        assert artifact.type == ArtifactType.IMAGE
        assert artifact.content["path"] == "/tmp/screenshot.png"
    
    def test_image_requires_path_or_url(self, artifact_system):
        """Test image artifact requires path or url."""
        with pytest.raises(ValueError):
            artifact_system.image(name="No source")
    
    def test_list_for_execution(self, artifact_system):
        """Test listing artifacts for execution."""
        artifact_system.markdown(name="Report 1", content="Content 1")
        artifact_system.markdown(name="Report 2", content="Content 2")
        artifact_system.progress(name="Progress", current=5, total=10)
        
        artifacts = artifact_system.list_for_execution()
        
        assert len(artifacts) == 3
        # Should be ordered by updated_at DESC
        assert all(isinstance(a, Artifact) for a in artifacts)
    
    def test_context_tracking(self, artifact_system, db_connection):
        """Test that node_id and frame_id are tracked."""
        artifact_system.set_context(node_id="claude-1", frame_id=42)
        
        artifact_id = artifact_system.markdown(name="With Context", content="Test")
        
        row = db_connection.execute(
            "SELECT node_id, frame_id FROM artifacts WHERE id = ?",
            (artifact_id,)
        ).fetchone()
        
        assert row[0] == "claude-1"
        assert row[1] == 42
