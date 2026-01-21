#!/usr/bin/env python3
"""Check smithers_py tests by importing and running test modules directly."""

import sys
import os
import traceback
from pathlib import Path

# Add smithers_py to path
sys.path.insert(0, str(Path(__file__).parent))

# Track results
passed = 0
failed = 0
errors = []

print("=== Running Smithers-Py Tests ===\n")

# Test 1: Basic imports
print("1. Testing basic imports...")
try:
    import smithers_py
    from smithers_py import SmithersDB, create_smithers_db, create_async_smithers_db, run_migrations
    print("✓ Basic imports successful")
    passed += 1
except Exception as e:
    print(f"✗ Basic imports failed: {e}")
    errors.append(("Basic imports", str(e)))
    failed += 1

# Test 2: Node imports
print("\n2. Testing node imports...")
try:
    from smithers_py.nodes import (
        Node, NodeBase, NodeHandlers, NodeMeta,
        TextNode, IfNode, PhaseNode, StepNode, RalphNode,
        WhileNode, FragmentNode, EachNode, StopNode, EndNode,
        ClaudeNode, ToolPolicy, EffectNode
    )
    print("✓ Node imports successful")
    passed += 1
except Exception as e:
    print(f"✗ Node imports failed: {e}")
    errors.append(("Node imports", str(e)))
    failed += 1

# Test 3: JSX runtime imports
print("\n3. Testing JSX runtime imports...")
try:
    from smithers_py.jsx_runtime import jsx, jsx_s, jsxs, jsx_dev, Fragment, JSX_ELEMENT_TYPE
    print("✓ JSX runtime imports successful")
    passed += 1
except Exception as e:
    print(f"✗ JSX runtime imports failed: {e}")
    errors.append(("JSX runtime imports", str(e)))
    failed += 1

# Test 4: State imports
print("\n4. Testing state imports...")
try:
    from smithers_py.state import StateStore, SQLiteStore, VolatileStore, create_state_store
    print("✓ State imports successful")
    passed += 1
except Exception as e:
    print(f"✗ State imports failed: {e}")
    errors.append(("State imports", str(e)))
    failed += 1

# Test 5: Serializer imports
print("\n5. Testing serializer imports...")
try:
    from smithers_py.serialize import XMLSerializer
    print("✓ Serializer imports successful")
    passed += 1
except Exception as e:
    print(f"✗ Serializer imports failed: {e}")
    errors.append(("Serializer imports", str(e)))
    failed += 1

# Test 6: Engine imports
print("\n6. Testing engine imports...")
try:
    from smithers_py.engine import TickLoop, HandlerTransaction, EngineEvent
    print("✓ Engine imports successful")
    passed += 1
except Exception as e:
    print(f"✗ Engine imports failed: {e}")
    errors.append(("Engine imports", str(e)))
    failed += 1

# Test 7: Basic node creation
print("\n7. Testing basic node creation...")
try:
    from smithers_py.nodes import TextNode, PhaseNode, ClaudeNode

    text = TextNode(text="Hello")
    assert text.type == "text"
    assert text.text == "Hello"

    phase = PhaseNode(name="test")
    assert phase.type == "phase"
    assert phase.name == "test"

    claude = ClaudeNode(model="sonnet", prompt="Test")
    assert claude.type == "claude"
    assert claude.model == "sonnet"

    print("✓ Basic node creation successful")
    passed += 1
except Exception as e:
    print(f"✗ Basic node creation failed: {e}")
    errors.append(("Basic node creation", str(e)))
    failed += 1

# Test 8: Database creation
print("\n8. Testing database creation...")
try:
    from smithers_py import create_smithers_db
    db = create_smithers_db(":memory:")
    print("✓ Database creation successful")
    passed += 1
except Exception as e:
    print(f"✗ Database creation failed: {e}")
    errors.append(("Database creation", str(e)))
    failed += 1

# Test 9: State store creation
print("\n9. Testing state store creation...")
try:
    from smithers_py.state import create_state_store

    # Test SQLite store
    sqlite_store = create_state_store("sqlite", path=":memory:")
    sqlite_store.set("test", "value")
    assert sqlite_store.get("test") == "value"

    # Test volatile store
    volatile_store = create_state_store("volatile")
    volatile_store.set("test", "value")
    assert volatile_store.get("test") == "value"

    print("✓ State store creation successful")
    passed += 1
except Exception as e:
    print(f"✗ State store creation failed: {e}")
    errors.append(("State store creation", str(e)))
    failed += 1

# Test 10: XML serialization
print("\n10. Testing XML serialization...")
try:
    from smithers_py.serialize import XMLSerializer
    from smithers_py.nodes import TextNode, PhaseNode

    serializer = XMLSerializer()

    # Test simple text node
    text = TextNode(text="Hello World")
    xml = serializer.serialize(text)
    assert "Hello World" in xml

    # Test phase node with children
    phase = PhaseNode(name="test", children=[text])
    xml = serializer.serialize(phase)
    assert "<phase" in xml
    assert 'name="test"' in xml

    print("✓ XML serialization successful")
    passed += 1
except Exception as e:
    print(f"✗ XML serialization failed: {e}")
    errors.append(("XML serialization", str(e)))
    failed += 1

# Summary
print(f"\n{'='*50}")
print(f"Test Results: {passed} passed, {failed} failed")

if errors:
    print(f"\nErrors encountered:")
    for test_name, error in errors:
        print(f"  - {test_name}: {error}")
    print("\n❌ Tests FAILED")
    sys.exit(1)
else:
    print("\n✅ All tests PASSED")
    sys.exit(0)