"""Tests for File System Watcher and Context.

Tests the FileWatcher debouncing and FileSystemContext instrumentation.
"""

import pytest
import tempfile
import os
from pathlib import Path
from unittest.mock import Mock, patch

from smithers_py.engine.fs_watcher import (
    FileWatcher,
    FileSystemContext,
    FileRecord,
)


class TestFileWatcher:
    """Tests for FileWatcher class."""
    
    def test_ignore_patterns_default(self):
        """Test default ignore patterns."""
        watcher = FileWatcher()
        
        assert watcher._matches_ignore("node_modules/foo.js")
        assert watcher._matches_ignore(".git/config")
        assert watcher._matches_ignore("dist/bundle.js")
        assert watcher._matches_ignore("__pycache__/foo.pyc")
        assert watcher._matches_ignore("foo.pyc")
    
    def test_ignore_patterns_custom(self):
        """Test custom ignore patterns."""
        watcher = FileWatcher(ignore_patterns=["*.tmp", "build/**"])
        
        assert watcher._matches_ignore("foo.tmp")
        assert watcher._matches_ignore("build/output.js")
        assert not watcher._matches_ignore("src/main.py")
    
    def test_on_file_change_ignored(self):
        """Test ignored files don't trigger callback."""
        callback = Mock()
        watcher = FileWatcher()
        watcher.set_on_change(callback)
        
        watcher.on_file_change("node_modules/package.json")
        
        # Should not have scheduled tick
        assert watcher._pending_tick is None or watcher._pending_tick.done()
    
    def test_debounce_setting(self):
        """Test debounce time can be configured."""
        watcher = FileWatcher(debounce_ms=500)
        assert watcher.debounce_ms == 500
    
    def test_stop_cancels_pending(self):
        """Test stop cancels pending tick."""
        watcher = FileWatcher()
        watcher._watching = True
        
        watcher.stop()
        
        assert not watcher._watching


class TestFileSystemContext:
    """Tests for FileSystemContext class."""
    
    @pytest.fixture
    def temp_dir(self):
        """Create temporary directory."""
        with tempfile.TemporaryDirectory() as tmpdir:
            yield tmpdir
    
    @pytest.fixture
    def fs_ctx(self, temp_dir):
        """Create FileSystemContext with temp directory."""
        return FileSystemContext(base_path=temp_dir)
    
    def test_write_and_read(self, fs_ctx, temp_dir):
        """Test basic write and read."""
        fs_ctx.write("test.txt", "Hello, World!")
        content = fs_ctx.read("test.txt")
        
        assert content == "Hello, World!"
        assert Path(temp_dir, "test.txt").exists()
    
    def test_write_creates_directories(self, fs_ctx, temp_dir):
        """Test write creates parent directories."""
        fs_ctx.write("a/b/c/test.txt", "nested")
        
        assert Path(temp_dir, "a/b/c/test.txt").exists()
    
    def test_read_bytes(self, fs_ctx, temp_dir):
        """Test reading binary files."""
        data = b"\x00\x01\x02\x03"
        fs_ctx.write_bytes("binary.bin", data)
        
        result = fs_ctx.read_bytes("binary.bin")
        assert result == data
    
    def test_delete(self, fs_ctx, temp_dir):
        """Test file deletion."""
        fs_ctx.write("to_delete.txt", "temporary")
        assert fs_ctx.exists("to_delete.txt")
        
        result = fs_ctx.delete("to_delete.txt")
        
        assert result is True
        assert not fs_ctx.exists("to_delete.txt")
    
    def test_delete_nonexistent(self, fs_ctx):
        """Test delete returns False for nonexistent file."""
        result = fs_ctx.delete("nonexistent.txt")
        assert result is False
    
    def test_exists(self, fs_ctx):
        """Test exists check."""
        assert not fs_ctx.exists("missing.txt")
        
        fs_ctx.write("present.txt", "here")
        assert fs_ctx.exists("present.txt")
    
    def test_hash(self, fs_ctx):
        """Test file hashing."""
        fs_ctx.write("hashme.txt", "deterministic content")
        
        hash1 = fs_ctx.hash("hashme.txt")
        hash2 = fs_ctx.hash("hashme.txt")
        
        assert hash1 == hash2
        assert len(hash1) == 64  # SHA256 hex
    
    def test_hash_nonexistent(self, fs_ctx):
        """Test hash returns None for nonexistent file."""
        result = fs_ctx.hash("nonexistent.txt")
        assert result is None
    
    def test_list_dir(self, fs_ctx, temp_dir):
        """Test directory listing."""
        fs_ctx.write("file1.txt", "a")
        fs_ctx.write("file2.txt", "b")
        
        files = fs_ctx.list_dir()
        
        assert "file1.txt" in files
        assert "file2.txt" in files
    
    def test_records_operations(self, fs_ctx):
        """Test operations are recorded."""
        fs_ctx.set_context(frame_id=1, node_id="node-123")
        
        fs_ctx.write("test.txt", "content")
        fs_ctx.read("test.txt")
        
        records = fs_ctx.get_records()
        
        assert len(records) == 2
        assert records[0].operation == "write"
        assert records[1].operation == "read"
        assert records[0].frame_id == 1
        assert records[0].node_id == "node-123"
    
    def test_records_filter_by_frame(self, fs_ctx):
        """Test filtering records by frame."""
        fs_ctx.set_context(frame_id=1)
        fs_ctx.write("f1.txt", "a")
        
        fs_ctx.set_context(frame_id=2)
        fs_ctx.write("f2.txt", "b")
        
        frame1_records = fs_ctx.get_records(frame_id=1)
        
        assert len(frame1_records) == 1
        assert frame1_records[0].path.endswith("f1.txt")
    
    def test_records_include_hash(self, fs_ctx):
        """Test records include content hash."""
        fs_ctx.write("hashed.txt", "content")
        
        records = fs_ctx.get_records()
        
        assert records[0].hash is not None
        assert len(records[0].hash) == 16  # Truncated hash
    
    def test_absolute_path_handling(self, fs_ctx, temp_dir):
        """Test absolute paths are handled correctly."""
        abs_path = os.path.join(temp_dir, "absolute.txt")
        fs_ctx.write(abs_path, "absolute content")
        
        content = fs_ctx.read(abs_path)
        assert content == "absolute content"
    
    def test_clear_records(self, fs_ctx):
        """Test clearing records."""
        fs_ctx.write("test.txt", "content")
        assert len(fs_ctx.get_records()) == 1
        
        fs_ctx.clear_records()
        
        assert len(fs_ctx.get_records()) == 0


class TestFileRecord:
    """Tests for FileRecord dataclass."""
    
    def test_record_creation(self):
        """Test creating a file record."""
        record = FileRecord(
            path="/path/to/file.txt",
            operation="write",
            size=1024,
            hash="abc123",
            frame_id=5,
            node_id="node-1"
        )
        
        assert record.path == "/path/to/file.txt"
        assert record.operation == "write"
        assert record.size == 1024
        assert record.hash == "abc123"
        assert record.frame_id == 5
    
    def test_record_defaults(self):
        """Test default values."""
        record = FileRecord(
            path="/file.txt",
            operation="read",
            size=0,
            hash=None
        )
        
        assert record.frame_id is None
        assert record.node_id is None
        assert record.timestamp is not None
