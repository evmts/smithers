#!/usr/bin/env python3
"""Test script to verify all P0 fixes are working correctly."""

import asyncio
import os
import sys
import uuid
from pathlib import Path

# Imports - errors will be caught during test execution
from smithers_py.db.database import SmithersDB, ExecutionModule, TasksModule, SqliteStore
from smithers_py.state.sqlite import SqliteStore as StateSqliteStore
from smithers_py.state.base import WriteOp, StoreTarget
from smithers_py.executors.claude import ClaudeExecutor
from smithers_py.engine.tick_loop import TickLoop, Context
from smithers_py.state.volatile import VolatileStore
from smithers_py.nodes.text import TextNode
import pytest

@pytest.mark.asyncio
async def test_p0_fixes():
    """Test all P0 fixes in an integrated way."""

    # Create in-memory database (sync mode for TickLoop compatibility)
    print("\nCreating test database...")
    db = SmithersDB(":memory:", is_async=False)
    await db.connect()

    # Run migrations to create schema
    from smithers_py.db.migrations import run_migrations
    await run_migrations(db.connection)

    # Test P0.2: ExecutionModule.start() accepts execution_id
    print("\nTesting ExecutionModule.start() (P0.2)...")
    test_execution_id = str(uuid.uuid4())
    returned_id = await db.execution.start(
        name="test_execution",
        source_file="test.py",
        execution_id=test_execution_id
    )
    assert returned_id == test_execution_id
    print("✅ P0.2: ExecutionModule.start() correctly accepts execution_id parameter")

    # Test P0.3: TasksModule.start() accepts component_type
    print("\nTesting TasksModule.start() (P0.3)...")
    task_id = str(uuid.uuid4())
    try:
        await db.tasks.start(
            task_id=task_id,
            name="test_task",
            execution_id=test_execution_id,
            component_type="claude",
            component_name="test_node"
        )
        print("✅ P0.3: TasksModule.start() correctly accepts component_type parameter")
    except Exception as e:
        print(f"❌ P0.3: TasksModule.start() error: {e}")
        raise

    # Test P0.4: SqliteStore accepts path-based initialization
    print("\nTesting SqliteStore initialization (P0.4)...")
    try:
        # Use path-based initialization (SqliteStore creates its own sync connection)
        state_store = StateSqliteStore(":memory:", test_execution_id)
        state_store.set("test_key", "test_value", "test_trigger")
        state_store.commit()
        value = state_store.get("test_key")
        assert value == "test_value"
        print("✅ P0.4: SqliteStore correctly initializes with path parameter")
    except Exception as e:
        print(f"❌ P0.4: SqliteStore error: {e}")
        raise

    # Test P0.5: DB API methods exist
    print("\nTesting DB API methods (P0.5)...")
    try:
        # Test record_event
        await db.record_event(
            execution_id=test_execution_id,
            source="test",
            node_id="test_node",
            event_type="test_event",
            payload_json={"test": True}
        )

        # Test save_agent_result
        from datetime import datetime
        await db.save_agent_result(
            execution_id=test_execution_id,
            agent_id="test_agent",
            model="sonnet",
            prompt="test prompt",
            status="completed",
            started_at=datetime.now(),
            ended_at=None,
            result="test result",
            result_structured=None,
            error=None
        )

        # Test other methods
        assert db.current_execution_id == test_execution_id
        await db.update_agent_status("test_run", "running")

        print("✅ P0.5: All required DB API methods exist and work")
    except Exception as e:
        print(f"❌ P0.5: DB API method error: {e}")
        raise

    # Test P0.6: ClaudeExecutor import and execution_id handling
    print("\nTesting ClaudeExecutor (P0.6)...")
    try:
        executor = ClaudeExecutor(db)
        # Basic instantiation test
        print("✅ P0.6: ClaudeExecutor imports and instantiates correctly")
    except Exception as e:
        print(f"❌ P0.6: ClaudeExecutor error: {e}")
        raise

    # Test P0.7: TickLoop instantiates and has quiescence check
    print("\nTesting TickLoop instantiation (P0.7)...")
    try:
        # Simple component that renders once
        def test_component(ctx: Context):
            return TextNode(text="Hello")

        volatile_store = VolatileStore()
        tick_loop = TickLoop(db, volatile_store, test_component, test_execution_id)

        # Verify TickLoop has the required methods and state
        assert hasattr(tick_loop, 'run'), "TickLoop missing run() method"
        assert hasattr(tick_loop, '_is_quiescent'), "TickLoop missing _is_quiescent() method"
        assert tick_loop.execution_id == test_execution_id
        print("✅ P0.7: TickLoop correctly instantiates with required interface")
    except Exception as e:
        print(f"❌ P0.7: TickLoop error: {e}")
        raise

    # Test P0.8: StoreTarget enum in WriteOp
    print("\nTesting StoreTarget enum (P0.8)...")
    try:
        # Create WriteOp with StoreTarget
        op1 = WriteOp(key="test", value="value", target=StoreTarget.VOLATILE)
        op2 = WriteOp(key="test", value="value", target=StoreTarget.SQLITE)
        assert op1.target == StoreTarget.VOLATILE
        assert op2.target == StoreTarget.SQLITE
        print("✅ P0.8: StoreTarget enum exists and works in WriteOp")
    except Exception as e:
        print(f"❌ P0.8: StoreTarget error: {e}")
        raise

    # Clean up
    await db.close()

    print("\n" + "="*50)
    print("✅ ALL P0 FIXES VERIFIED SUCCESSFULLY!")
    print("="*50)

if __name__ == "__main__":
    asyncio.run(test_p0_fixes())