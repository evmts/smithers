#!/usr/bin/env python3
"""Validate state store implementation against spec requirements."""

from smithers_py.state import VolatileStore, SqliteStore, WriteOp

def test_volatile_store():
    """Test VolatileStore basic functionality."""
    print("Testing VolatileStore...")

    store = VolatileStore()

    # Test basic operations
    assert store.get("key1") is None
    store.set("key1", "value1")
    assert store.has_pending_writes()
    assert store.get("key1") is None  # Not visible before commit

    store.commit()
    assert store.get("key1") == "value1"
    assert not store.has_pending_writes()

    # Test snapshot
    snapshot = store.snapshot()
    assert snapshot["key1"] == "value1"

    print("✓ VolatileStore basic ops work")

def test_sqlite_store():
    """Test SqliteStore basic functionality."""
    print("\nTesting SqliteStore...")

    store = SqliteStore(":memory:", "test_exec")

    # Test basic operations
    assert store.get("key1") is None
    store.set("key1", "value1", trigger="test")
    assert store.has_pending_writes()
    assert store.get("key1") is None  # Not visible before commit

    store.commit()
    assert store.get("key1") == "value1"
    assert not store.has_pending_writes()

    # Test complex data
    store.set("data", {"nested": [1, 2, 3]})
    store.commit()
    assert store.get("data") == {"nested": [1, 2, 3]}

    # Test transitions
    transitions = store.get_transitions("key1")
    assert len(transitions) == 1
    assert transitions[0]["new_value"] == "value1"
    assert transitions[0]["trigger"] == "test"

    store.close()
    print("✓ SqliteStore basic ops work")

def test_spec_requirements():
    """Validate key spec requirements."""
    print("\nValidating spec requirements...")

    # 1. Batching semantics
    store = VolatileStore()
    store.set("a", 1)
    store.set("b", 2)
    store.set("c", 3)

    # All writes queued, none visible
    assert all(store.get(k) is None for k in ["a", "b", "c"])

    # Commit applies all atomically
    store.commit()
    assert store.get("a") == 1
    assert store.get("b") == 2
    assert store.get("c") == 3
    print("✓ Batching semantics work")

    # 2. Snapshot isolation
    store = SqliteStore(":memory:", "exec1")
    store.set("config", {"timeout": 30})
    store.commit()

    snap = store.snapshot()
    snap["config"]["timeout"] = 60  # Modify snapshot

    # Original unchanged
    assert store.get("config")["timeout"] == 30
    print("✓ Snapshot isolation works")

    # 3. Execution isolation (SqliteStore)
    # Would need two connections to same file to test properly

    # 4. Audit logging
    store.set("counter", 1, trigger="init")
    store.commit()
    store.set("counter", 2, trigger="increment")
    store.commit()

    transitions = store.get_transitions("counter")
    assert len(transitions) == 2
    assert transitions[0]["old_value"] == 1
    assert transitions[0]["new_value"] == 2
    assert transitions[0]["trigger"] == "increment"
    print("✓ Audit logging works")

    store.close()

if __name__ == "__main__":
    test_volatile_store()
    test_sqlite_store()
    test_spec_requirements()
    print("\n✅ All validation tests passed!")