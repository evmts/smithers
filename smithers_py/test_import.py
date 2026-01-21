#!/usr/bin/env python3
"""Test script to verify smithers_py imports correctly"""

import sys
import os

try:
    import smithers_py
    print("✓ Package imported successfully")
    print(f"  Version: {smithers_py.__version__}")

    # Test main exports
    exports = smithers_py.__all__
    print(f"  Exports: {', '.join(exports)}")

    # Test database module
    from smithers_py import SmithersDB, create_smithers_db, run_migrations
    print("✓ Database exports imported")

    # Test creating DB instance
    db = create_smithers_db()
    print("✓ SmithersDB instance created")

    print("\nPackage structure verified!")

except ImportError as e:
    print(f"✗ Import error: {e}")
    sys.exit(1)
except Exception as e:
    print(f"✗ Error: {e}")
    sys.exit(1)