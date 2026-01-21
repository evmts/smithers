#!/usr/bin/env python3
"""Check error handling in state store implementation."""

import json
import tempfile
import os
from smithers_py.state import VolatileStore, SqliteStore

def test_error_scenarios():
    """Test error handling scenarios."""
    print("Testing error handling...")

    # Test 1: Invalid JSON serialization
    print("\n1. Testing serialization of non-JSON types...")
    store = SqliteStore(":memory:", "test")

    # Function should fail to serialize
    try:
        store.set("func", lambda x: x)
        store.commit()
        print("❌ Should have failed to serialize function")
    except (TypeError, json.JSONDecodeError) as e:
        print(f"✓ Correctly failed: {type(e).__name__}")

    # Test 2: Large data
    print("\n2. Testing large data...")
    large_list = list(range(10000))
    store.set("large", large_list)
    store.commit()
    assert store.get("large") == large_list
    print("✓ Large data handled correctly")

    # Test 3: Invalid database path
    print("\n3. Testing invalid database path...")
    try:
        store = SqliteStore("/invalid/path/db.sqlite", "test")
        print("❌ Should have failed with invalid path")
    except Exception as e:
        print(f"✓ Correctly failed: {type(e).__name__}")

    # Test 4: Concurrent access (would need threading)
    print("\n4. Skipping concurrent access test (needs threading)")

    # Test 5: Database corruption simulation
    print("\n5. Testing database integrity...")
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name

    store = SqliteStore(db_path, "test")
    store.set("key", "value")
    store.commit()
    store.close()

    # Corrupt the file
    with open(db_path, "wb") as f:
        f.write(b"corrupted data")

    try:
        store = SqliteStore(db_path, "test")
        store.get("key")
        print("❌ Should have failed with corrupted DB")
    except Exception as e:
        print(f"✓ Correctly failed: {type(e).__name__}")

    os.unlink(db_path)

    # Test 6: None values
    print("\n6. Testing None values...")
    store = VolatileStore()
    store.set("none_key", None)
    store.commit()
    assert store.get("none_key") is None
    print("✓ None values handled correctly")

    print("\n✅ Error handling tests completed")

if __name__ == "__main__":
    test_error_scenarios()