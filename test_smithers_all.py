#!/usr/bin/env python3
"""Test all smithers_py components by importing and running tests directly."""

import sys
import os
import asyncio
import traceback
import importlib.util
from pathlib import Path

# Add smithers root to path
sys.path.insert(0, str(Path(__file__).parent))

# Track results
test_results = []

def run_test(name, test_func):
    """Run a test and track results."""
    try:
        print(f"\n{'='*60}")
        print(f"Running: {name}")
        print('='*60)
        test_func()
        test_results.append((name, True, None))
        print(f"\n✅ {name} PASSED")
    except Exception as e:
        test_results.append((name, False, str(e)))
        print(f"\n❌ {name} FAILED: {e}")
        traceback.print_exc()

# Test 1: Basic imports
def test_basic_imports():
    """Test basic package imports."""
    print("Testing basic imports...")
    import smithers_py
    from smithers_py import SmithersDB, create_smithers_db, create_async_smithers_db, run_migrations
    print(f"✓ Package version: {smithers_py.__version__}")
    print("✓ All basic imports successful")

run_test("Basic Imports", test_basic_imports)

# Test 2: Node module
def test_node_module():
    """Test node module functionality."""
    print("Testing node module...")
    from smithers_py.nodes import (
        Node, NodeBase, NodeHandlers, NodeMeta,
        TextNode, IfNode, PhaseNode, StepNode, RalphNode,
        WhileNode, FragmentNode, EachNode, StopNode, EndNode,
        ClaudeNode, ToolPolicy, EffectNode
    )

    # Create nodes
    text = TextNode(text="Hello")
    assert text.type == "text"
    assert text.text == "Hello"

    phase = PhaseNode(name="test")
    assert phase.type == "phase"
    assert phase.name == "test"

    claude = ClaudeNode(model="sonnet", prompt="Test")
    assert claude.type == "claude"
    assert claude.model == "sonnet"

    print("✓ All node types work correctly")

run_test("Node Module", test_node_module)

# Test 3: Database module
def test_database_module():
    """Test database functionality."""
    print("Testing database module...")
    from smithers_py import create_smithers_db

    # Create in-memory database
    db = create_smithers_db(":memory:")
    print("✓ Database created")

    # Test basic operations
    cursor = db.connection.cursor()
    cursor.execute("CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY, value TEXT)")
    cursor.execute("INSERT INTO test (value) VALUES (?)", ("test_value",))
    db.connection.commit()

    cursor.execute("SELECT value FROM test WHERE id = 1")
    result = cursor.fetchone()
    assert result[0] == "test_value"
    print("✓ Database operations work")

run_test("Database Module", test_database_module)

# Test 4: State module
def test_state_module():
    """Test state module functionality."""
    print("Testing state module...")
    from smithers_py.state import StateStore, SQLiteStore, VolatileStore, create_state_store

    # Test volatile store
    volatile = create_state_store("volatile")
    volatile.set("key1", "value1")
    assert volatile.get("key1") == "value1"
    print("✓ Volatile store works")

    # Test SQLite store
    sqlite_store = create_state_store("sqlite", path=":memory:")
    sqlite_store.set("key2", "value2")
    assert sqlite_store.get("key2") == "value2"
    print("✓ SQLite store works")

run_test("State Module", test_state_module)

# Test 5: Serializer module
def test_serializer_module():
    """Test serializer functionality."""
    print("Testing serializer module...")
    from smithers_py.serialize import XMLSerializer
    from smithers_py.nodes import TextNode, PhaseNode

    serializer = XMLSerializer()

    # Test text node serialization
    text = TextNode(text="Hello World")
    xml = serializer.serialize(text)
    assert "Hello World" in xml
    print("✓ Text node serialization works")

    # Test phase node serialization
    phase = PhaseNode(name="test-phase", children=[text])
    xml = serializer.serialize(phase)
    assert "<phase" in xml
    assert 'name="test-phase"' in xml
    print("✓ Phase node serialization works")

run_test("Serializer Module", test_serializer_module)

# Test 6: Engine module
def test_engine_module():
    """Test engine module imports."""
    print("Testing engine module...")
    from smithers_py.engine import TickLoop, HandlerTransaction, EngineEvent

    # Basic import test
    print("✓ Engine modules import successfully")

    # Test event creation
    event = EngineEvent(type="test", source="test", payload={})
    assert event.type == "test"
    print("✓ Engine events work")

run_test("Engine Module", test_engine_module)

# Test 7: P0 fixes
async def test_p0_fixes_async():
    """Test P0 fixes asynchronously."""
    print("Testing P0 fixes...")

    from smithers_py.db.database import SmithersDB, ExecutionModule, TasksModule
    from smithers_py.state.sqlite import SqliteStore as StateSqliteStore
    from smithers_py.state.base import WriteOp, StoreTarget
    from smithers_py.executors.claude import ClaudeExecutor
    from smithers_py.engine.tick_loop import TickLoop, Context
    from smithers_py.state.volatile import VolatileStore
    from smithers_py.nodes.text import TextNode
    import uuid

    # Create database
    db = SmithersDB(":memory:", is_async=True)
    await db.connect()

    # Run migrations
    from smithers_py.db.migrations import run_migrations
    await run_migrations(db.connection)

    # Test execution ID
    exec_id = str(uuid.uuid4())
    returned_id = await db.execution.start(
        name="test", source_file="test.py", execution_id=exec_id
    )
    assert returned_id == exec_id
    print("✓ P0.2: ExecutionModule.start() accepts execution_id")

    # Test task start
    task_id = str(uuid.uuid4())
    await db.tasks.start(
        task_id=task_id,
        name="test_task",
        execution_id=exec_id,
        component_type="claude",
        component_name="test"
    )
    print("✓ P0.3: TasksModule.start() accepts component_type")

    # Test SqliteStore connection
    state_store = StateSqliteStore(db.connection, exec_id)
    state_store.set("key", "value", "trigger")
    state_store.commit()
    assert state_store.get("key") == "value"
    print("✓ P0.4: SqliteStore accepts connection")

    # Test StoreTarget enum
    op = WriteOp(key="test", value="val", target=StoreTarget.VOLATILE)
    assert op.target == StoreTarget.VOLATILE
    print("✓ P0.8: StoreTarget enum works")

    await db.close()

def test_p0_fixes():
    """Wrapper to run async P0 tests."""
    asyncio.run(test_p0_fixes_async())

run_test("P0 Fixes", test_p0_fixes)

# Test 8: JSX Runtime
def test_jsx_runtime():
    """Test JSX runtime functionality."""
    print("Testing JSX runtime...")
    from smithers_py.jsx_runtime import jsx, jsx_s, jsxs, jsx_dev, Fragment, JSX_ELEMENT_TYPE

    # Test basic jsx
    elem = jsx("div", {"className": "test"})
    assert elem["type"] == "div"
    assert elem["props"]["className"] == "test"
    print("✓ JSX runtime works")

    # Test Fragment
    assert Fragment == "Fragment"
    print("✓ Fragment symbol exists")

run_test("JSX Runtime", test_jsx_runtime)

# Print summary
print(f"\n{'='*70}")
print("TEST SUMMARY")
print('='*70)

passed = sum(1 for _, success, _ in test_results if success)
failed = sum(1 for _, success, _ in test_results if not success)

for name, success, error in test_results:
    status = "PASSED" if success else "FAILED"
    print(f"{status:8} {name}")
    if error:
        print(f"         Error: {error[:60]}...")

print(f"\nTotal: {passed} passed, {failed} failed out of {len(test_results)} tests")

if failed == 0:
    print("\n🎉 ALL TESTS PASSED! M0 requirements verified.")
    print("\nThe smithers_py package is ready for use.")
else:
    print(f"\n❌ {failed} tests failed. Please fix the errors above.")

sys.exit(1 if failed > 0 else 0)