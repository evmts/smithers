"""
Integration test for the tick loop engine.

Tests the complete 7-phase cycle with IfNode + PhaseNode to verify:
- State snapshot isolation
- XML frame persistence to database
- Context object functionality
- Frame coalescing behavior
"""

import asyncio
import tempfile
import os
import uuid
from pathlib import Path

import pytest

from smithers_py.db.database import SmithersDB
from smithers_py.db.migrations import run_migrations
from smithers_py.state.volatile import VolatileStore
from smithers_py.nodes.structural import IfNode, PhaseNode
from smithers_py.nodes.text import TextNode
from smithers_py.engine.tick_loop import TickLoop, Context
from smithers_py.serialize.xml import serialize_to_xml


# Sample app component for testing (prefixed with _ to avoid pytest collection)
def _app_component(ctx: Context):
    """Test app that uses IfNode and PhaseNode with state-based conditions."""

    # Check state to determine what to render
    show_phase = ctx.state.get('show_phase', True)
    phase_name = ctx.v.get('current_phase', 'initialization')

    return IfNode(
        key="root_if",
        condition=show_phase,
        children=[
            PhaseNode(
                key="test_phase",
                name=phase_name,
                children=[
                    TextNode(text=f"Phase: {phase_name}")
                ]
            )
        ]
    )


class TestTickLoopIntegration:
    """Integration tests for the tick loop engine."""

    @pytest.fixture
    async def setup_test_db(self):
        """Create a temporary database for testing."""
        # Create temporary file
        temp_fd, temp_path = tempfile.mkstemp(suffix='.db')
        os.close(temp_fd)

        try:
            # Initialize database
            db = SmithersDB(temp_path, is_async=True)
            await db.connect()

            # Run migrations
            await run_migrations(db.connection)

            # Create execution
            execution_id = str(uuid.uuid4())
            await db.execution.start(
                name="test_tick_loop",
                source_file="test_tick_loop_integration.py",
                config={"test": True}
            )

            yield db, execution_id

        finally:
            await db.close()
            # Clean up temp file
            Path(temp_path).unlink(missing_ok=True)

    async def test_single_frame_render(self, setup_test_db):
        """Test that a single frame renders correctly and persists to DB."""
        db, execution_id = setup_test_db

        # Create volatile state with test data
        volatile_state = VolatileStore()
        volatile_state.set('current_phase', 'testing')
        volatile_state.commit()

        # Create tick loop
        tick_loop = TickLoop(
            db=db,
            volatile_state=volatile_state,
            app_component=_app_component,
            execution_id=execution_id
        )

        # Run single frame
        await tick_loop.run()

        # Verify frame was saved to database
        frames = await db.frames.list(execution_id)
        assert len(frames) == 1

        frame = frames[0]
        assert frame['execution_id'] == execution_id
        assert frame['sequence_number'] == 0
        assert 'xml_content' in frame
        assert frame['xml_content'] is not None

        # Verify XML content structure
        xml_content = frame['xml_content']
        assert '<if' in xml_content
        assert 'key="root_if"' in xml_content
        assert 'condition="True"' in xml_content
        assert '<phase' in xml_content
        assert 'key="test_phase"' in xml_content
        assert 'name="testing"' in xml_content
        assert 'Phase: testing' in xml_content

        print(f"✅ Frame XML content:\n{xml_content}")

    async def test_state_snapshot_isolation(self, setup_test_db):
        """Test that state snapshots are isolated during render phase."""
        db, execution_id = setup_test_db

        class StateTestApp:
            """Test app that modifies state during render."""

            def __init__(self):
                self.render_call_count = 0
                self.snapshot_values = []

            def __call__(self, ctx: Context):
                self.render_call_count += 1

                # Capture the snapshot value
                current_value = ctx.v.get('test_value', 0)
                self.snapshot_values.append(current_value)

                # Modify volatile state (shouldn't affect current render)
                ctx.v['test_value'] = current_value + 100  # This should NOT work - ctx.v is read-only snapshot

                return PhaseNode(
                    key="isolation_test",
                    name=f"render_{self.render_call_count}_value_{current_value}",
                    children=[]
                )

        # Create volatile state
        volatile_state = VolatileStore()
        volatile_state.set('test_value', 42)
        volatile_state.commit()

        app = StateTestApp()

        # Create tick loop
        tick_loop = TickLoop(
            db=db,
            volatile_state=volatile_state,
            app_component=app,
            execution_id=execution_id
        )

        # Run single frame
        await tick_loop.run()

        # Verify the app was called exactly once
        assert app.render_call_count == 1
        assert app.snapshot_values == [42]

        # Verify actual volatile state wasn't changed by render
        assert volatile_state.get('test_value') == 42

        # Verify frame was created with correct content
        frames = await db.frames.list(execution_id)
        assert len(frames) == 1

        xml_content = frames[0]['xml_content']
        assert 'name="render_1_value_42"' in xml_content

        print(f"✅ State isolation verified - volatile state unchanged: {volatile_state.get('test_value')}")

    async def test_context_object_functionality(self, setup_test_db):
        """Test that Context object provides correct data and functionality."""
        db, execution_id = setup_test_db

        class ContextTestApp:
            """Test app that validates Context object."""

            def __init__(self):
                self.context_data = None

            def __call__(self, ctx: Context):
                # Capture context for inspection
                self.context_data = {
                    'frame_id': ctx.frame_id,
                    'now': ctx.now(),
                    'v_keys': list(ctx.v.keys()),
                    'state_keys': list(ctx.state.keys()),
                    'has_db': ctx.db is not None,
                }

                return PhaseNode(
                    key="context_test",
                    name="context_validation",
                    children=[]
                )

        # Create states with test data
        volatile_state = VolatileStore()
        volatile_state.set('vol_key1', 'vol_value1')
        volatile_state.set('vol_key2', 42)
        volatile_state.commit()

        app = ContextTestApp()

        # Create tick loop
        tick_loop = TickLoop(
            db=db,
            volatile_state=volatile_state,
            app_component=app,
            execution_id=execution_id
        )

        # Set some SQLite state
        tick_loop.sqlite_state.set('sqlite_key1', 'sqlite_value1')
        tick_loop.sqlite_state.commit()

        # Run single frame
        await tick_loop.run()

        # Verify context data
        assert app.context_data is not None
        ctx_data = app.context_data

        assert ctx_data['frame_id'] == 0  # First frame
        assert isinstance(ctx_data['now'], float)
        assert ctx_data['has_db'] is True

        # Check volatile state snapshot
        assert 'vol_key1' in ctx_data['v_keys']
        assert 'vol_key2' in ctx_data['v_keys']

        # Check SQLite state snapshot
        assert 'sqlite_key1' in ctx_data['state_keys']

        print(f"✅ Context validation passed: {ctx_data}")

    async def test_frame_coalescing_behavior(self, setup_test_db):
        """Test that identical frames are coalesced (not saved twice)."""
        db, execution_id = setup_test_db

        # Simple static app that always returns same tree
        def static_app(ctx: Context):
            return PhaseNode(
                key="static_phase",
                name="unchanged",
                children=[TextNode(text="Static content")]
            )

        volatile_state = VolatileStore()

        tick_loop = TickLoop(
            db=db,
            volatile_state=volatile_state,
            app_component=static_app,
            execution_id=execution_id
        )

        # Run first frame
        await tick_loop._run_single_frame()

        # Run second frame (should be coalesced)
        await tick_loop._run_single_frame()

        # Only one frame should be saved due to coalescing
        frames = await db.frames.list(execution_id)
        assert len(frames) == 1

        print(f"✅ Frame coalescing verified - only {len(frames)} frame(s) saved")

    async def test_conditional_rendering_with_state_changes(self, setup_test_db):
        """Test IfNode condition changes based on state."""
        db, execution_id = setup_test_db

        def conditional_app(ctx: Context):
            enabled = ctx.v.get('feature_enabled', False)

            return IfNode(
                key="feature_toggle",
                condition=enabled,
                children=[
                    PhaseNode(
                        key="feature_phase",
                        name="feature_active",
                        children=[TextNode(text="Feature is on!")]
                    )
                ] if enabled else []
            )

        volatile_state = VolatileStore()

        tick_loop = TickLoop(
            db=db,
            volatile_state=volatile_state,
            app_component=conditional_app,
            execution_id=execution_id
        )

        # First frame: feature disabled
        await tick_loop._run_single_frame()

        # Enable feature
        volatile_state.set('feature_enabled', True)
        volatile_state.commit()

        # Second frame: feature enabled (new tick loop to see state change)
        tick_loop_2 = TickLoop(
            db=db,
            volatile_state=volatile_state,
            app_component=conditional_app,
            execution_id=execution_id
        )
        await tick_loop_2._run_single_frame()

        # Should have 2 different frames now
        frames = await db.frames.list(execution_id)
        assert len(frames) == 2

        # First frame should have condition="False"
        assert 'condition="False"' in frames[0]['xml_content']

        # Second frame should have condition="True" and phase content
        frame2_xml = frames[1]['xml_content']
        assert 'condition="True"' in frame2_xml
        assert '<phase' in frame2_xml
        assert 'name="feature_active"' in frame2_xml
        assert 'Feature is on!' in frame2_xml

        print(f"✅ Conditional rendering verified across {len(frames)} frames")


# Run the tests
if __name__ == "__main__":
    async def run_all_tests():
        """Run all tests manually."""
        test_instance = TestTickLoopIntegration()

        print("🧪 Running tick loop integration tests...\n")

        # Test 1: Basic frame render
        print("1. Testing single frame render...")
        setup = await test_instance.setup_test_db().__anext__()
        await test_instance.test_single_frame_render(setup)

        # Test 2: State isolation
        print("\n2. Testing state snapshot isolation...")
        setup = await test_instance.setup_test_db().__anext__()
        await test_instance.test_state_snapshot_isolation(setup)

        # Test 3: Context functionality
        print("\n3. Testing context object functionality...")
        setup = await test_instance.setup_test_db().__anext__()
        await test_instance.test_context_object_functionality(setup)

        # Test 4: Frame coalescing
        print("\n4. Testing frame coalescing behavior...")
        setup = await test_instance.setup_test_db().__anext__()
        await test_instance.test_frame_coalescing_behavior(setup)

        # Test 5: Conditional rendering
        print("\n5. Testing conditional rendering with state changes...")
        setup = await test_instance.setup_test_db().__anext__()
        await test_instance.test_conditional_rendering_with_state_changes(setup)

        print("\n🎉 All tests completed successfully!")

    asyncio.run(run_all_tests())