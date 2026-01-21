#!/usr/bin/env python3
"""Test imports for state stores."""

try:
    from smithers_py.state import VolatileStore, SqliteStore, WriteOp, StateStore
    print("✓ All imports successful")

    # Try to instantiate VolatileStore
    v_store = VolatileStore()
    print("✓ VolatileStore instantiated")

    # Try to instantiate SqliteStore
    s_store = SqliteStore(":memory:", "test_exec")
    print("✓ SqliteStore instantiated")

except Exception as e:
    print(f"✗ Import error: {e}")
    import traceback
    traceback.print_exc()