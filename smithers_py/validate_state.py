#!/usr/bin/env python
"""Simple validation script for state stores."""

import sys
import tempfile
import os

# Try importing the modules
try:
    from smithers_py.state import VolatileStore, SqliteStore, WriteOp
    print("✓ Import successful")
except ImportError as e:
    print(f"✗ Import failed: {e}")
    sys.exit(1)

# Test VolatileStore
try:
    store = VolatileStore()

    # Basic operations
    store.set("test_key", "test_value")
    assert store.has_pending_writes()

    store.commit()
    assert not store.has_pending_writes()
    assert store.get("test_key") == "test_value"

    # Snapshot
    snapshot = store.snapshot()
    assert snapshot["test_key"] == "test_value"

    print("✓ VolatileStore basic operations work")
except Exception as e:
    print(f"✗ VolatileStore failed: {e}")
    sys.exit(1)

# Test SqliteStore
try:
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name

    store = SqliteStore(db_path, "test_exec")

    # Basic operations
    store.set("test_key", "test_value")
    assert store.has_pending_writes()

    store.commit()
    assert not store.has_pending_writes()
    assert store.get("test_key") == "test_value"

    # Snapshot
    snapshot = store.snapshot()
    assert snapshot["test_key"] == "test_value"

    # Transitions
    transitions = store.get_transitions()
    assert len(transitions) == 1
    assert transitions[0]["key"] == "test_key"

    store.close()
    os.unlink(db_path)

    print("✓ SqliteStore basic operations work")
except Exception as e:
    print(f"✗ SqliteStore failed: {e}")
    sys.exit(1)

print("✓ All validation tests passed!")