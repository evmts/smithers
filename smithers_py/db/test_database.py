"""Comprehensive tests for M0-Database-Schema implementation"""

import pytest
import sqlite3
import aiosqlite
import asyncio
import json
import tempfile
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict

from smithers_py.db.database import (
    SmithersDB,
    SqliteStore,
    ExecutionModule,
    TasksModule,
    RenderFramesModule,
    ArtifactsModule,
    create_smithers_db,
    create_async_smithers_db
)
from smithers_py.db.migrations import run_migrations


class TestSqliteStore:
    """Test SqliteStore state management"""

    @pytest.mark.asyncio
    async def test_sync_store_basic_operations(self):
        """Test sync store get/set operations"""
        with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
            db_path = f.name

        try:
            # Create sync database
            conn = sqlite3.connect(db_path)
            run_migrations(conn)
            store = SqliteStore(conn)

            # Test set and get
            await store.set("test_key", {"value": 42})
            result = await store.get("test_key")
            assert result == {"value": 42}

            # Test get non-existent key
            result = await store.get("non_existent")
            assert result is None

            # Test overwrite
            await store.set("test_key", {"value": 100})
            result = await store.get("test_key")
            assert result == {"value": 100}

            conn.close()
        finally:
            os.unlink(db_path)

    @pytest.mark.asyncio
    async def test_async_store_basic_operations(self):
        """Test async store get/set operations"""
        with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
            db_path = f.name

        try:
            # Create async database
            conn = await aiosqlite.connect(db_path)
            await conn.executescript(open(Path(__file__).parent / 'schema.sql').read())
            store = SqliteStore(conn)

            # Test set and get
            await store.set("async_key", [1, 2, 3])
            result = await store.get("async_key")
            assert result == [1, 2, 3]

            # Test complex object
            complex_obj = {
                "nested": {"data": [1, 2, 3]},
                "string": "test",
                "number": 3.14
            }
            await store.set("complex", complex_obj)
            result = await store.get("complex")
            assert result == complex_obj

            await conn.close()
        finally:
            os.unlink(db_path)

    @pytest.mark.asyncio
    async def test_store_edge_cases(self):
        """Test store edge cases"""
        with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
            db_path = f.name

        try:
            conn = sqlite3.connect(db_path)
            run_migrations(conn)
            store = SqliteStore(conn)

            # Test None value
            await store.set("null_key", None)
            result = await store.get("null_key")
            assert result is None

            # Test empty string key
            await store.set("", "empty_key")
            result = await store.get("")
            assert result == "empty_key"

            # Test very long key
            long_key = "a" * 1000
            await store.set(long_key, "long_key_value")
            result = await store.get(long_key)
            assert result == "long_key_value"

            # Test unicode
            await store.set("unicode_key", "🚀 Rocket")
            result = await store.get("unicode_key")
            assert result == "🚀 Rocket"

            conn.close()
        finally:
            os.unlink(db_path)


class TestExecutionModule:
    """Test ExecutionModule for tracking executions"""

    @pytest.mark.asyncio
    async def test_execution_lifecycle(self):
        """Test complete execution lifecycle"""
        with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
            db_path = f.name

        try:
            conn = sqlite3.connect(db_path)
            run_migrations(conn)
            execution_module = ExecutionModule(conn)

            # Start new execution
            config = {"model": "test", "max_iterations": 10}
            exec_id = await execution_module.start("test_exec", "test.py", config)
            assert exec_id is not None
            assert execution_module._current_execution_id == exec_id

            # Complete execution
            result = {"status": "success", "data": [1, 2, 3]}
            await execution_module.complete(exec_id, result)
            assert execution_module._current_execution_id is None

            # Verify execution was saved
            cursor = conn.execute("SELECT * FROM executions WHERE id = ?", (exec_id,))
            row = cursor.fetchone()
            assert row is not None

            conn.close()
        finally:
            os.unlink(db_path)

    @pytest.mark.asyncio
    async def test_execution_failure(self):
        """Test execution failure handling"""
        with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
            db_path = f.name

        try:
            conn = sqlite3.connect(db_path)
            run_migrations(conn)
            execution_module = ExecutionModule(conn)

            # Start and fail execution
            exec_id = await execution_module.start("failing_exec", "fail.py")
            await execution_module.fail(exec_id, "Test error message")

            # Verify failure was recorded
            cursor = conn.execute("SELECT status, error FROM executions WHERE id = ?", (exec_id,))
            row = cursor.fetchone()
            assert row[0] == 'failed'
            assert row[1] == 'Test error message'

            conn.close()
        finally:
            os.unlink(db_path)

    @pytest.mark.asyncio
    async def test_execution_resume(self):
        """Test resuming an execution"""
        with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
            db_path = f.name

        try:
            conn = sqlite3.connect(db_path)
            run_migrations(conn)
            execution_module = ExecutionModule(conn)

            # Start execution
            exec_id = await execution_module.start("resume_test", "resume.py")

            # Simulate interruption - just close without completing
            execution_module._current_execution_id = None

            # Resume execution with same ID
            resumed_id = await execution_module.start("resume_test", "resume.py", execution_id=exec_id)
            assert resumed_id == exec_id
            assert execution_module._current_execution_id == exec_id

            conn.close()
        finally:
            os.unlink(db_path)

    @pytest.mark.asyncio
    async def test_find_incomplete(self):
        """Test finding incomplete executions"""
        with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
            db_path = f.name

        try:
            conn = sqlite3.connect(db_path)
            run_migrations(conn)
            execution_module = ExecutionModule(conn)

            # No incomplete executions initially
            result = await execution_module.find_incomplete()
            assert result is None

            # Start execution
            exec_id1 = await execution_module.start("incomplete1", "test1.py")

            # Find incomplete should return this execution
            result = await execution_module.find_incomplete()
            assert result is not None
            assert result['id'] == exec_id1
            assert result['status'] == 'running'

            # Complete it and start another
            await execution_module.complete(exec_id1)
            exec_id2 = await execution_module.start("incomplete2", "test2.py")

            # Should return the new incomplete one
            result = await execution_module.find_incomplete()
            assert result['id'] == exec_id2

            conn.close()
        finally:
            os.unlink(db_path)

    @pytest.mark.asyncio
    async def test_execution_with_env_var(self):
        """Test execution ID from environment variable"""
        with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
            db_path = f.name

        try:
            conn = sqlite3.connect(db_path)
            run_migrations(conn)
            execution_module = ExecutionModule(conn)

            # Set environment variable
            test_exec_id = "env-exec-123"
            os.environ['SMITHERS_EXECUTION_ID'] = test_exec_id

            # Start should use env var ID
            exec_id = await execution_module.start("env_test", "env.py")
            assert exec_id == test_exec_id

            # Cleanup env var
            del os.environ['SMITHERS_EXECUTION_ID']

            conn.close()
        finally:
            os.unlink(db_path)


class TestTasksModule:
    """Test TasksModule for task tracking"""

    @pytest.mark.asyncio
    async def test_task_lifecycle(self):
        """Test task start and complete"""
        with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
            db_path = f.name

        try:
            conn = sqlite3.connect(db_path)
            run_migrations(conn)

            # Need an execution first
            exec_module = ExecutionModule(conn)
            exec_id = await exec_module.start("task_test", "task.py")

            tasks_module = TasksModule(conn)

            # Start task
            task_id = "task-123"
            await tasks_module.start(task_id, "Test Task", exec_id, "agent", "TestAgent")

            # Verify task was created
            cursor = conn.execute("SELECT status FROM tasks WHERE id = ?", (task_id,))
            row = cursor.fetchone()
            assert row[0] == 'running'

            # Complete task
            await tasks_module.complete(task_id)

            # Verify completion
            cursor = conn.execute("SELECT status, completed_at FROM tasks WHERE id = ?", (task_id,))
            row = cursor.fetchone()
            assert row[0] == 'completed'
            assert row[1] is not None

            conn.close()
        finally:
            os.unlink(db_path)

    @pytest.mark.asyncio
    async def test_task_heartbeat(self):
        """Test task heartbeat updates"""
        with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
            db_path = f.name

        try:
            conn = sqlite3.connect(db_path)
            run_migrations(conn)

            exec_module = ExecutionModule(conn)
            exec_id = await exec_module.start("heartbeat_test", "heartbeat.py")

            tasks_module = TasksModule(conn)
            task_id = "heartbeat-task"
            await tasks_module.start(task_id, "Heartbeat Task", exec_id, "component")

            # Send heartbeat
            lease_owner = "worker-1"
            await tasks_module.heartbeat(task_id, lease_owner)

            # Verify heartbeat was recorded
            cursor = conn.execute("SELECT heartbeat_at, lease_owner FROM tasks WHERE id = ?", (task_id,))
            row = cursor.fetchone()
            assert row[0] is not None
            assert row[1] == lease_owner

            conn.close()
        finally:
            os.unlink(db_path)


class TestArtifactsModule:
    """Test ArtifactsModule for artifact storage"""

    @pytest.mark.asyncio
    async def test_artifact_create_and_get(self):
        """Test creating and retrieving artifacts"""
        with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
            db_path = f.name

        try:
            conn = sqlite3.connect(db_path)
            run_migrations(conn)

            exec_module = ExecutionModule(conn)
            exec_id = await exec_module.start("artifact_test", "artifact.py")

            artifacts_module = ArtifactsModule(conn)

            # Create keyed artifact
            content = {"data": "test content", "value": 42}
            artifact_id = await artifacts_module.create(
                exec_id, "node-123", 1, "test-key", "Test Artifact", "data", content
            )
            assert artifact_id is not None

            # Get keyed artifact
            artifact = await artifacts_module.get(exec_id, "test-key")
            assert artifact is not None
            assert artifact['name'] == "Test Artifact"
            assert artifact['type'] == "data"
            assert artifact['content'] == content

            # Create keyless artifact
            keyless_id = await artifacts_module.create(
                exec_id, "node-456", 2, None, "Keyless Artifact", "log", {"log": "message"}
            )
            assert keyless_id is not None

            conn.close()
        finally:
            os.unlink(db_path)

    @pytest.mark.asyncio
    async def test_artifact_update(self):
        """Test updating keyed artifacts"""
        with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
            db_path = f.name

        try:
            conn = sqlite3.connect(db_path)
            run_migrations(conn)

            exec_module = ExecutionModule(conn)
            exec_id = await exec_module.start("update_test", "update.py")

            artifacts_module = ArtifactsModule(conn)

            # Create initial artifact
            initial_content = {"version": 1, "data": "initial"}
            await artifacts_module.create(
                exec_id, None, None, "update-key", "Update Test", "config", initial_content
            )

            # Update artifact
            updated_content = {"version": 2, "data": "updated"}
            success = await artifacts_module.update(exec_id, "update-key", updated_content)
            assert success is True

            # Verify update
            artifact = await artifacts_module.get(exec_id, "update-key")
            assert artifact['content'] == updated_content

            # Try updating non-existent artifact
            success = await artifacts_module.update(exec_id, "non-existent", {"data": "test"})
            assert success is False

            conn.close()
        finally:
            os.unlink(db_path)

    @pytest.mark.asyncio
    async def test_artifact_list(self):
        """Test listing artifacts with filtering"""
        with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
            db_path = f.name

        try:
            conn = sqlite3.connect(db_path)
            run_migrations(conn)

            exec_module = ExecutionModule(conn)
            exec_id = await exec_module.start("list_test", "list.py")

            artifacts_module = ArtifactsModule(conn)

            # Create multiple artifacts of different types
            await artifacts_module.create(exec_id, None, None, "key1", "Markdown", "markdown", {"content": "# Title"})
            await artifacts_module.create(exec_id, None, None, "key2", "Table", "table", {"rows": []})
            await artifacts_module.create(exec_id, None, None, None, "Progress", "progress", {"percent": 50})
            await artifacts_module.create(exec_id, None, None, "key3", "Another Markdown", "markdown", {"content": "Text"})

            # List all artifacts
            all_artifacts = await artifacts_module.list(exec_id)
            assert len(all_artifacts) == 4

            # List by type
            markdown_artifacts = await artifacts_module.list(exec_id, "markdown")
            assert len(markdown_artifacts) == 2
            assert all(a['type'] == 'markdown' for a in markdown_artifacts)

            # List table artifacts
            table_artifacts = await artifacts_module.list(exec_id, "table")
            assert len(table_artifacts) == 1
            assert table_artifacts[0]['name'] == "Table"

            conn.close()
        finally:
            os.unlink(db_path)

    @pytest.mark.asyncio
    async def test_artifact_unique_constraint(self):
        """Test unique constraint on execution_id + key"""
        with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
            db_path = f.name

        try:
            conn = sqlite3.connect(db_path)
            run_migrations(conn)

            exec_module = ExecutionModule(conn)
            exec_id = await exec_module.start("unique_test", "unique.py")

            artifacts_module = ArtifactsModule(conn)

            # Create artifact with key
            await artifacts_module.create(exec_id, None, None, "unique-key", "First", "data", {"v": 1})

            # Try to create another with same key - should fail
            with pytest.raises(sqlite3.IntegrityError):
                await artifacts_module.create(exec_id, None, None, "unique-key", "Second", "data", {"v": 2})

            # But keyless artifacts should work fine
            id1 = await artifacts_module.create(exec_id, None, None, None, "Keyless1", "data", {"v": 1})
            id2 = await artifacts_module.create(exec_id, None, None, None, "Keyless2", "data", {"v": 2})
            assert id1 != id2

            conn.close()
        finally:
            os.unlink(db_path)

    @pytest.mark.asyncio
    async def test_artifact_error_handling(self):
        """Test artifact module error handling"""
        with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
            db_path = f.name

        try:
            conn = sqlite3.connect(db_path)
            run_migrations(conn)

            artifacts_module = ArtifactsModule(conn)

            # Try to update without key
            with pytest.raises(ValueError, match="Key is required"):
                await artifacts_module.update("exec-123", None, {"data": "test"})

            conn.close()
        finally:
            os.unlink(db_path)


class TestRenderFramesModule:
    """Test RenderFramesModule for frame storage"""

    @pytest.mark.asyncio
    async def test_frame_save_and_list(self):
        """Test saving and listing render frames"""
        with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
            db_path = f.name

        try:
            conn = sqlite3.connect(db_path)
            run_migrations(conn)

            exec_module = ExecutionModule(conn)
            exec_id = await exec_module.start("frame_test", "frame.py")

            frames_module = RenderFramesModule(conn)

            # Save frames
            xml1 = "<Phase name='test1'>Content 1</Phase>"
            frame_id1 = await frames_module.save(exec_id, xml1)
            assert frame_id1 is not None

            xml2 = "<Phase name='test2'>Content 2</Phase>"
            frame_id2 = await frames_module.save(exec_id, xml2)

            # List frames
            frames = await frames_module.list(exec_id)
            assert len(frames) == 2
            assert frames[0]['xml_content'] == xml1
            assert frames[0]['sequence_number'] == 0
            assert frames[1]['xml_content'] == xml2
            assert frames[1]['sequence_number'] == 1

            conn.close()
        finally:
            os.unlink(db_path)

    @pytest.mark.asyncio
    async def test_frame_custom_sequence(self):
        """Test saving frames with custom sequence numbers"""
        with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
            db_path = f.name

        try:
            conn = sqlite3.connect(db_path)
            run_migrations(conn)

            exec_module = ExecutionModule(conn)
            exec_id = await exec_module.start("seq_test", "seq.py")

            frames_module = RenderFramesModule(conn)

            # Save with custom sequence
            xml1 = "<Phase>Custom 10</Phase>"
            await frames_module.save(exec_id, xml1, sequence_number=10)

            xml2 = "<Phase>Custom 5</Phase>"
            await frames_module.save(exec_id, xml2, sequence_number=5)

            # List should be ordered by sequence
            frames = await frames_module.list(exec_id)
            assert len(frames) == 2
            assert frames[0]['sequence_number'] == 5
            assert frames[1]['sequence_number'] == 10

            conn.close()
        finally:
            os.unlink(db_path)


class TestSmithersDB:
    """Test main SmithersDB class"""

    @pytest.mark.asyncio
    async def test_sync_database_creation(self):
        """Test synchronous database creation and connection"""
        with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
            db_path = f.name

        try:
            db = SmithersDB(db_path, is_async=False)
            await db.connect()

            # Verify modules are initialized
            assert db.execution is not None
            assert db.state is not None
            assert db.tasks is not None
            assert db.frames is not None

            # Test basic query
            await db.executescript("CREATE TABLE test_table (id INTEGER PRIMARY KEY, value TEXT)")
            await db.execute("INSERT INTO test_table (value) VALUES (?)", ("test_value",))

            result = await db.query_one("SELECT value FROM test_table WHERE id = 1")
            assert result[0] == "test_value"

            await db.close()
        finally:
            os.unlink(db_path)

    @pytest.mark.asyncio
    async def test_async_database_creation(self):
        """Test asynchronous database creation and connection"""
        with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
            db_path = f.name

        try:
            db = SmithersDB(db_path, is_async=True)
            await db.connect()

            # Run schema
            schema_path = Path(__file__).parent / 'schema.sql'
            await db.executescript(open(schema_path).read())

            # Test async operations
            await db.execute("INSERT INTO state (key, value) VALUES (?, ?)",
                           ("async_test", json.dumps({"async": True})))

            result = await db.query_one("SELECT value FROM state WHERE key = ?", ("async_test",))
            assert json.loads(result[0]) == {"async": True}

            await db.close()
        finally:
            os.unlink(db_path)

    @pytest.mark.asyncio
    async def test_database_not_connected_error(self):
        """Test error when using database without connection"""
        db = SmithersDB(":memory:")

        with pytest.raises(RuntimeError, match="Database not connected"):
            _ = db.connection

    @pytest.mark.asyncio
    async def test_convenience_functions(self):
        """Test create_smithers_db convenience functions"""
        # Test basic creation
        db = create_smithers_db()
        assert db.db_path == ':memory:'
        assert not db.is_async

        # Test with custom path
        db = create_smithers_db("/tmp/test.db", is_async=True)
        assert db.db_path == "/tmp/test.db"
        assert db.is_async

        # Test with environment variable
        os.environ['SMITHERS_DB_PATH'] = '/tmp/env_test.db'
        db = create_smithers_db()
        assert db.db_path == '/tmp/env_test.db'
        del os.environ['SMITHERS_DB_PATH']

        # Test async creation helper
        db = await create_async_smithers_db()
        assert db.is_async
        assert db._initialized
        await db.close()

    @pytest.mark.asyncio
    async def test_record_event(self):
        """Test event recording"""
        with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
            db_path = f.name

        try:
            db = SmithersDB(db_path, is_async=False)
            await db.connect()

            # Create schema
            await db.executescript(open(Path(__file__).parent / 'schema.sql').read())

            # Start execution
            exec_id = await db.execution.start("event_test", "event.py")

            # Record event
            event_payload = {"action": "test", "value": 42}
            await db.record_event(exec_id, "test_source", "node-123", "test_event", event_payload)

            # Verify event was recorded
            result = await db.query_one(
                "SELECT source, node_id, event_type, payload FROM events WHERE execution_id = ?",
                (exec_id,)
            )
            assert result[0] == "test_source"
            assert result[1] == "node-123"
            assert result[2] == "test_event"
            assert json.loads(result[3]) == event_payload

            await db.close()
        finally:
            os.unlink(db_path)

    @pytest.mark.asyncio
    async def test_agent_operations(self):
        """Test agent-related operations"""
        with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
            db_path = f.name

        try:
            db = SmithersDB(db_path, is_async=False)
            await db.connect()
            await db.executescript(open(Path(__file__).parent / 'schema.sql').read())

            exec_id = await db.execution.start("agent_test", "agent.py")

            # Save agent result
            run_id = "agent-run-123"
            node_id = "node-456"
            started_at = datetime.now()
            ended_at = datetime.now()
            usage_json = json.dumps({"tokens": 100})

            await db.save_agent_result(
                exec_id, node_id, run_id, "claude-3",
                "completed", started_at, ended_at,
                5, usage_json, "Agent output text",
                json.dumps({"result": "success"}), None
            )

            # Get agent history
            history = await db.get_agent_history(run_id)
            assert history is None  # No message history saved yet

            # Update agent status
            await db.update_agent_status(run_id, "failed")

            # Verify status update
            result = await db.query_one("SELECT status FROM agents WHERE run_id = ?", (run_id,))
            assert result[0] == "failed"

            await db.close()
        finally:
            os.unlink(db_path)

    @pytest.mark.asyncio
    async def test_tool_call_operations(self):
        """Test tool call recording"""
        with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
            db_path = f.name

        try:
            db = SmithersDB(db_path, is_async=False)
            await db.connect()
            await db.executescript(open(Path(__file__).parent / 'schema.sql').read())

            # Save tool call
            run_id = "run-789"
            tool_name = "search"
            input_json = json.dumps({"query": "test"})
            output_json = json.dumps({"results": ["item1", "item2"]})
            started_at = datetime.now()
            ended_at = datetime.now()

            await db.save_tool_call(
                run_id, tool_name, input_json,
                output_json, None,
                started_at, ended_at, 150
            )

            # Verify tool call was saved
            result = await db.query_one(
                "SELECT tool_name, duration_ms FROM tool_calls WHERE run_id = ?",
                (run_id,)
            )
            assert result[0] == "search"
            assert result[1] == 150

            await db.close()
        finally:
            os.unlink(db_path)

    @pytest.mark.asyncio
    async def test_error_handling(self):
        """Test database error handling"""
        with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
            db_path = f.name

        try:
            db = SmithersDB(db_path, is_async=False)
            await db.connect()

            # Test foreign key constraint (requires schema)
            await db.executescript(open(Path(__file__).parent / 'schema.sql').read())

            # Try to insert task with non-existent execution_id
            with pytest.raises(sqlite3.IntegrityError):
                await db.execute(
                    "INSERT INTO tasks (id, name, execution_id, status, component_type) VALUES (?, ?, ?, ?, ?)",
                    ("task-1", "Test Task", "non-existent-exec", "running", "test")
                )

            await db.close()
        finally:
            os.unlink(db_path)


class TestDatabaseValidation:
    """Test database schema validation and edge cases"""

    @pytest.mark.asyncio
    async def test_json_serialization_edge_cases(self):
        """Test JSON serialization of various data types"""
        with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
            db_path = f.name

        try:
            db = SmithersDB(db_path, is_async=False)
            await db.connect()
            await db.executescript(open(Path(__file__).parent / 'schema.sql').read())

            # Test various JSON-serializable values
            test_cases = [
                ("null_value", None),
                ("empty_list", []),
                ("empty_dict", {}),
                ("nested_structure", {"a": {"b": {"c": [1, 2, 3]}}},),
                ("mixed_types", {"int": 1, "float": 3.14, "bool": True, "null": None}),
                ("unicode_data", {"emoji": "🚀", "text": "Hello 世界"}),
                ("large_list", list(range(1000))),
            ]

            for key, value in test_cases:
                await db.state.set(key, value)
                result = await db.state.get(key)
                assert result == value, f"Failed for key: {key}"

            await db.close()
        finally:
            os.unlink(db_path)

    @pytest.mark.asyncio
    async def test_concurrent_access(self):
        """Test concurrent database access (async mode)"""
        with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
            db_path = f.name

        try:
            db = await create_async_smithers_db(db_path)
            await db.executescript(open(Path(__file__).parent / 'schema.sql').read())

            # Start execution
            exec_id = await db.execution.start("concurrent_test", "concurrent.py")

            # Simulate concurrent operations
            async def write_state(key: str, value: int):
                for i in range(10):
                    await db.state.set(f"{key}_{i}", value + i)
                    await asyncio.sleep(0.01)

            # Run concurrent writes
            await asyncio.gather(
                write_state("thread1", 100),
                write_state("thread2", 200),
                write_state("thread3", 300),
            )

            # Verify all writes succeeded
            for prefix, base in [("thread1", 100), ("thread2", 200), ("thread3", 300)]:
                for i in range(10):
                    result = await db.state.get(f"{prefix}_{i}")
                    assert result == base + i

            await db.close()
        finally:
            os.unlink(db_path)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])