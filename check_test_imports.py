#!/usr/bin/env python3
"""Check if test module has syntax errors."""

try:
    import smithers_py.nodes.test_nodes
    print("✓ Test module imported successfully")

    # Count test methods
    test_count = 0
    for name in dir(smithers_py.nodes.test_nodes):
        if name.startswith("Test"):
            cls = getattr(smithers_py.nodes.test_nodes, name)
            for method in dir(cls):
                if method.startswith("test_"):
                    test_count += 1

    print(f"✓ Found {test_count} test methods")

except SyntaxError as e:
    print(f"✗ Syntax error in test module: {e}")
    print(f"  Line {e.lineno}: {e.text}")
except ImportError as e:
    print(f"✗ Import error: {e}")
except Exception as e:
    print(f"✗ Unexpected error: {e}")
    import traceback
    traceback.print_exc()