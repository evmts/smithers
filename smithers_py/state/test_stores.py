"""Tests for state stores."""

import tempfile
import os
from datetime import datetime
from typing import Dict, Any

import pytest

from .base import WriteOp
from .volatile import VolatileStore
from .sqlite import SqliteStore


class TestVolatileStore:
    """Test cases for VolatileStore."""

    def test_basic_get_set(self):
        """Test basic get/set operations."""
        store = VolatileStore()

        # Get non-existent key returns None
        assert store.get("missing") is None

        # Queue and commit a write
        store.set("key1", "value1")
        assert store.has_pending_writes()

        # Value not visible until commit
        assert store.get("key1") is None

        # Commit makes value visible
        store.commit()
        assert not store.has_pending_writes()
        assert store.get("key1") == "value1"

    def test_snapshot_isolation(self):
        """Test that snapshots are frozen copies."""
        store = VolatileStore()

        # Set initial data
        store.set("key1", {"nested": "value1"})
        store.commit()

        # Get snapshot
        snapshot = store.snapshot()
        assert snapshot["key1"]["nested"] == "value1"

        # Modify original data
        store.set("key1", {"nested": "value2"})
        store.commit()

        # Snapshot should be unchanged
        assert snapshot["key1"]["nested"] == "value1"
        assert store.get("key1")["nested"] == "value2"

    def test_batched_writes(self):
        """Test that multiple writes are batched and applied atomically."""
        store = VolatileStore()

        # Queue multiple writes
        store.set("key1", "value1")
        store.set("key2", "value2")
        store.set("key3", "value3")

        # All writes pending
        assert store.has_pending_writes()
        assert store.get("key1") is None
        assert store.get("key2") is None
        assert store.get("key3") is None

        # Commit applies all at once
        store.commit()
        assert not store.has_pending_writes()
        assert store.get("key1") == "value1"
        assert store.get("key2") == "value2"
        assert store.get("key3") == "value3"

    def test_version_counter(self):
        """Test that version counter increments on commits."""
        store = VolatileStore()

        initial_version = store.version

        # No change without writes
        store.commit()
        assert store.version == initial_version

        # Version increments on actual commit
        store.set("key1", "value1")
        store.commit()
        assert store.version == initial_version + 1

        # Multiple writes = one version increment
        store.set("key1", "updated")
        store.set("key2", "new")
        store.commit()
        assert store.version == initial_version + 2

    def test_delete_operation(self):
        """Test deletion by setting value to None."""
        store = VolatileStore()

        # Set a value
        store.set("key1", "value1")
        store.commit()
        assert store.get("key1") == "value1"

        # Delete by setting to None
        store.set("key1", None)
        store.commit()
        assert store.get("key1") is None

    def test_enqueue_multiple_ops(self):
        """Test enqueueing multiple operations at once."""
        store = VolatileStore()

        ops = [
            WriteOp(key="key1", value="value1", trigger="test.trigger"),
            WriteOp(key="key2", value="value2", trigger="test.trigger"),
        ]

        store.enqueue(ops)
        assert store.has_pending_writes()

        store.commit()
        assert store.get("key1") == "value1"
        assert store.get("key2") == "value2"

    def test_clear_queue(self):
        """Test clearing queue without applying."""
        store = VolatileStore()

        store.set("key1", "value1")
        assert store.has_pending_writes()

        store.clear_queue()
        assert not store.has_pending_writes()

        # Value was not applied
        assert store.get("key1") is None


class TestSqliteStore:
    """Test cases for SqliteStore."""

    @pytest.fixture
    def temp_db(self):
        """Create temporary database file."""
        fd, path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        yield path
        if os.path.exists(path):
            os.unlink(path)

    def test_basic_get_set(self, temp_db):
        """Test basic get/set operations."""
        store = SqliteStore(temp_db, "exec1")

        try:
            # Get non-existent key returns None
            assert store.get("missing") is None

            # Queue and commit a write
            store.set("key1", "value1")
            assert store.has_pending_writes()

            # Value not visible until commit
            assert store.get("key1") is None

            # Commit makes value visible
            store.commit()
            assert not store.has_pending_writes()
            assert store.get("key1") == "value1"
        finally:
            store.close()

    def test_persistence(self, temp_db):
        """Test that data persists across store instances."""
        # First instance
        store1 = SqliteStore(temp_db, "exec1")
        store1.set("key1", "value1")
        store1.commit()
        store1.close()

        # Second instance should see the data
        store2 = SqliteStore(temp_db, "exec1")
        try:
            assert store2.get("key1") == "value1"
        finally:
            store2.close()

    def test_execution_isolation(self, temp_db):
        """Test that different executions are isolated."""
        store1 = SqliteStore(temp_db, "exec1")
        store2 = SqliteStore(temp_db, "exec2")

        try:
            # Set data in store1
            store1.set("key1", "value1")
            store1.commit()

            # Store2 should not see it
            assert store2.get("key1") is None

            # Set different data in store2
            store2.set("key1", "value2")
            store2.commit()

            # Both should see their own data
            assert store1.get("key1") == "value1"
            assert store2.get("key1") == "value2"
        finally:
            store1.close()
            store2.close()

    def test_complex_data_types(self, temp_db):
        """Test serialization of complex data types."""
        store = SqliteStore(temp_db, "exec1")

        try:
            # Test various data types
            test_data = {
                "string": "hello",
                "number": 42,
                "float": 3.14,
                "boolean": True,
                "null": None,
                "list": [1, 2, 3],
                "dict": {"nested": "value", "count": 10},
            }

            for key, value in test_data.items():
                store.set(key, value)

            store.commit()

            # Verify all data types round-trip correctly
            for key, expected_value in test_data.items():
                actual_value = store.get(key)
                assert actual_value == expected_value
        finally:
            store.close()

    def test_snapshot_with_complex_data(self, temp_db):
        """Test snapshot with complex nested data."""
        store = SqliteStore(temp_db, "exec1")

        try:
            # Set nested data
            store.set("config", {
                "models": ["gpt-4", "claude"],
                "settings": {"timeout": 30, "retries": 3}
            })
            store.commit()

            # Get snapshot
            snapshot = store.snapshot()

            # Modify snapshot (should not affect store)
            snapshot["config"]["models"].append("gemini")
            snapshot["config"]["settings"]["timeout"] = 60

            # Store data should be unchanged
            config = store.get("config")
            assert len(config["models"]) == 2
            assert config["settings"]["timeout"] == 30
        finally:
            store.close()

    def test_transitions_audit_log(self, temp_db):
        """Test that state transitions are logged."""
        store = SqliteStore(temp_db, "exec1")

        try:
            # Initial set
            store.set("counter", 1, trigger="init")
            store.commit()

            # Update value
            store.set("counter", 2, trigger="increment")
            store.commit()

            # Delete value
            store.set("counter", None, trigger="reset")
            store.commit()

            # Check transition log
            transitions = store.get_transitions("counter")

            # Should have 3 transitions in reverse chronological order
            assert len(transitions) == 3

            # Most recent: delete
            assert transitions[0]["key"] == "counter"
            assert transitions[0]["old_value"] == 2
            assert transitions[0]["new_value"] is None
            assert transitions[0]["trigger"] == "reset"

            # Middle: update
            assert transitions[1]["key"] == "counter"
            assert transitions[1]["old_value"] == 1
            assert transitions[1]["new_value"] == 2
            assert transitions[1]["trigger"] == "increment"

            # Oldest: create
            assert transitions[2]["key"] == "counter"
            assert transitions[2]["old_value"] is None
            assert transitions[2]["new_value"] == 1
            assert transitions[2]["trigger"] == "init"
        finally:
            store.close()

    def test_transitions_all_keys(self, temp_db):
        """Test getting transitions for all keys."""
        store = SqliteStore(temp_db, "exec1")

        try:
            # Set multiple keys
            store.set("key1", "value1", trigger="test1")
            store.set("key2", "value2", trigger="test2")
            store.commit()

            # Get all transitions
            transitions = store.get_transitions()

            # Should have 2 transitions
            assert len(transitions) == 2

            # Check keys are present
            keys = {t["key"] for t in transitions}
            assert keys == {"key1", "key2"}
        finally:
            store.close()

    def test_delete_operation(self, temp_db):
        """Test deletion by setting value to None."""
        store = SqliteStore(temp_db, "exec1")

        try:
            # Set a value
            store.set("key1", "value1")
            store.commit()
            assert store.get("key1") == "value1"

            # Delete by setting to None
            store.set("key1", None)
            store.commit()
            assert store.get("key1") is None

            # Should not appear in snapshot
            snapshot = store.snapshot()
            assert "key1" not in snapshot
        finally:
            store.close()

    def test_context_manager(self, temp_db):
        """Test using store as context manager."""
        with SqliteStore(temp_db, "exec1") as store:
            store.set("key1", "value1")
            store.commit()
            assert store.get("key1") == "value1"

        # Store should be closed after context manager
        # Create new store to verify data persisted
        with SqliteStore(temp_db, "exec1") as store2:
            assert store2.get("key1") == "value1"


class TestStoreComparison:
    """Test that both stores have equivalent behavior."""

    def test_equivalent_basic_operations(self):
        """Test that both stores behave the same for basic operations."""
        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
            db_path = f.name

        try:
            stores = [
                VolatileStore(),
                SqliteStore(db_path, "exec1")
            ]

            for store in stores:
                try:
                    # Test basic operations
                    assert store.get("missing") is None

                    store.set("key1", "value1")
                    assert store.has_pending_writes()
                    assert store.get("key1") is None  # Not visible until commit

                    store.commit()
                    assert not store.has_pending_writes()
                    assert store.get("key1") == "value1"

                    # Test snapshot
                    snapshot = store.snapshot()
                    assert snapshot["key1"] == "value1"

                    # Test delete
                    store.set("key1", None)
                    store.commit()
                    assert store.get("key1") is None

                finally:
                    if hasattr(store, 'close'):
                        store.close()

        finally:
            if os.path.exists(db_path):
                os.unlink(db_path)


if __name__ == "__main__":
    # Run tests
    pytest.main([__file__, "-v"])