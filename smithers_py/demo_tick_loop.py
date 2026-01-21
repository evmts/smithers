#!/usr/bin/env python3
"""
Demo of the tick loop engine functionality.

This demonstrates the 7-phase tick loop with IfNode + PhaseNode without
requiring complex test frameworks. Shows:
- State snapshot creation
- XML frame persistence
- Context object functionality
- Basic reconciliation
"""

import json
import uuid
import time
from dataclasses import dataclass
from typing import Dict, Any, Optional
from pathlib import Path


# Minimal implementations for demo


@dataclass
class Context:
    """Context object with frozen snapshots for render phase."""
    v: Dict[str, Any]  # Volatile state snapshot
    state: Dict[str, Any]  # SQLite state snapshot
    db: Any  # Database handle placeholder
    frame_id: int
    _frame_start_time: float

    def now(self) -> float:
        return self._frame_start_time


class DemoNode:
    """Base demo node for testing."""

    def __init__(self, type: str, key: str = None, **props):
        self.type = type
        self.key = key
        self.children = []
        for k, v in props.items():
            setattr(self, k, v)


class IfNode(DemoNode):
    """Demo If node."""

    def __init__(self, condition: bool = True, key: str = None, children=None):
        super().__init__("if", key=key)
        self.condition = condition
        self.children = children or []


class PhaseNode(DemoNode):
    """Demo Phase node."""

    def __init__(self, name: str, key: str = None, children=None):
        super().__init__("phase", key=key)
        self.name = name
        self.children = children or []


class TextNode(DemoNode):
    """Demo Text node."""

    def __init__(self, text: str):
        super().__init__("text")
        self.text = text


def serialize_to_xml(node, indent=0) -> str:
    """Simple XML serialization for demo."""
    if hasattr(node, 'text'):  # TextNode
        return node.text

    indent_str = "  " * indent
    attrs = []

    if hasattr(node, 'key') and node.key:
        attrs.append(f'key="{node.key}"')

    if hasattr(node, 'condition'):
        attrs.append(f'condition="{node.condition}"')

    if hasattr(node, 'name'):
        attrs.append(f'name="{node.name}"')

    attr_str = " " + " ".join(attrs) if attrs else ""

    if not node.children:
        return f"{indent_str}<{node.type}{attr_str} />"

    children_xml = []
    for child in node.children:
        child_xml = serialize_to_xml(child, indent + 1)
        if hasattr(child, 'text'):  # TextNode - no indentation
            children_xml.append(child_xml)
        else:
            children_xml.append(child_xml)

    if all(hasattr(child, 'text') for child in node.children):
        # Text content
        content = "".join(children_xml)
        return f"{indent_str}<{node.type}{attr_str}>{content}</{node.type}>"
    else:
        # Element children
        child_indent = "  " * (indent + 1)
        content = "\n" + child_indent + f"\n{child_indent}".join(children_xml) + f"\n{indent_str}"
        return f"{indent_str}<{node.type}{attr_str}>{content}</{node.type}>"


class DemoTickLoop:
    """Demo implementation of the tick loop engine."""

    def __init__(self, volatile_state, app_component, execution_id):
        self.volatile_state = volatile_state
        self.app_component = app_component
        self.execution_id = execution_id
        self.frame_id = 0
        self.last_frame_xml = None
        self.frames = []  # Store frames in memory for demo

    async def run(self):
        """Run single frame for M0 demo."""
        print(f"🎬 Starting demo tick loop for execution {self.execution_id}")
        await self._run_single_frame()
        print("✅ Demo tick loop completed successfully")

    async def _run_single_frame(self):
        """Execute single frame of the 7-phase cycle."""
        frame_start_time = time.time()
        print(f"🎯 Frame {self.frame_id} starting...")

        # PHASE 1: State Snapshot
        ctx = await self._phase1_state_snapshot(frame_start_time)

        # PHASE 2: Render
        current_tree = await self._phase2_render(ctx)

        # PHASE 3: Reconcile
        changes = await self._phase3_reconcile(current_tree)

        # PHASE 4: Commit
        await self._phase4_commit(current_tree, ctx)

        # PHASE 5: Execute (M0: no-op)
        await self._phase5_execute(changes)

        # PHASE 6: Post-Commit Effects (M0: no-op)
        await self._phase6_post_commit_effects(changes)

        # PHASE 7: State Update Flush
        await self._phase7_state_flush()

        self.frame_id += 1
        print(f"✅ Frame {self.frame_id - 1} completed")

    async def _phase1_state_snapshot(self, frame_start_time):
        print("  📸 Phase 1: State Snapshot")
        # Create frozen snapshots
        v_snapshot = self.volatile_state.copy()  # Simple copy for demo
        state_snapshot = {"show_phase": True}  # Demo SQLite state

        return Context(
            v=v_snapshot,
            state=state_snapshot,
            db=None,  # Demo - no real DB
            frame_id=self.frame_id,
            _frame_start_time=frame_start_time
        )

    async def _phase2_render(self, ctx):
        print("  🎨 Phase 2: Render")
        tree = self.app_component(ctx)
        return tree

    async def _phase3_reconcile(self, current_tree):
        print("  🔄 Phase 3: Reconcile")
        return {"mounted": [], "updated": [], "unmounted": []}

    async def _phase4_commit(self, current_tree, ctx):
        print("  💾 Phase 4: Commit")
        xml_content = serialize_to_xml(current_tree)

        # Skip if XML unchanged (frame coalescing)
        if xml_content == self.last_frame_xml:
            print("    ⏭️  Skipping duplicate frame")
            return

        # Save frame (demo - store in memory)
        frame = {
            "id": str(uuid.uuid4()),
            "execution_id": self.execution_id,
            "sequence_number": self.frame_id,
            "xml_content": xml_content,
            "timestamp": ctx.now()
        }
        self.frames.append(frame)
        self.last_frame_xml = xml_content
        print(f"    💾 Saved frame {frame['id']} (sequence {self.frame_id})")
        print(f"    📄 XML Preview:\n{xml_content}")

    async def _phase5_execute(self, changes):
        print("  🚀 Phase 5: Execute (M0: no-op)")

    async def _phase6_post_commit_effects(self, changes):
        print("  ✨ Phase 6: Post-Commit Effects (M0: no-op)")

    async def _phase7_state_flush(self):
        print("  🔄 Phase 7: State Update Flush")


def demo_app_component(ctx: Context):
    """Demo app that uses IfNode and PhaseNode."""
    show_phase = ctx.state.get('show_phase', True)
    phase_name = ctx.v.get('current_phase', 'initialization')

    return IfNode(
        key="root_if",
        condition=show_phase,
        children=[
            PhaseNode(
                key="test_phase",
                name=phase_name,
                children=[TextNode(f"Phase: {phase_name}")]
            )
        ]
    )


async def demo_basic_functionality():
    """Demonstrate basic tick loop functionality."""
    print("🧪 Demo: Basic Tick Loop Functionality")
    print("=" * 50)

    # Create demo volatile state
    volatile_state = {'current_phase': 'testing'}

    # Create tick loop
    execution_id = str(uuid.uuid4())
    tick_loop = DemoTickLoop(
        volatile_state=volatile_state,
        app_component=demo_app_component,
        execution_id=execution_id
    )

    # Run single frame
    await tick_loop.run()

    # Verify frame was created
    assert len(tick_loop.frames) == 1
    frame = tick_loop.frames[0]

    print("\n📋 Frame Verification:")
    print(f"  Execution ID: {frame['execution_id']}")
    print(f"  Sequence Number: {frame['sequence_number']}")
    print(f"  XML Content Length: {len(frame['xml_content'])} chars")

    # Verify XML content
    xml = frame['xml_content']
    checks = [
        ('<if', 'Contains <if> tag'),
        ('key="root_if"', 'Contains root_if key'),
        ('condition="True"', 'Contains condition=True'),
        ('<phase', 'Contains <phase> tag'),
        ('key="test_phase"', 'Contains test_phase key'),
        ('name="testing"', 'Contains phase name'),
        ('Phase: testing', 'Contains phase text')
    ]

    print("\n✅ XML Content Checks:")
    for check, description in checks:
        passed = check in xml
        print(f"  {description}: {'✅' if passed else '❌'}")
        assert passed, f"Failed check: {description}"

    return tick_loop


async def demo_state_isolation():
    """Demonstrate state snapshot isolation."""
    print("\n🧪 Demo: State Snapshot Isolation")
    print("=" * 50)

    class StateTestApp:
        def __init__(self):
            self.snapshot_values = []

        def __call__(self, ctx: Context):
            # Capture snapshot value
            current = ctx.v.get('test_value', 0)
            self.snapshot_values.append(current)

            # Try to modify snapshot (should not affect original)
            ctx.v['test_value'] = 999  # This modifies the snapshot copy

            return PhaseNode(
                key="isolation_test",
                name=f"value_{current}",
                children=[]
            )

    # Create state and app
    volatile_state = {'test_value': 42}
    app = StateTestApp()

    execution_id = str(uuid.uuid4())
    tick_loop = DemoTickLoop(
        volatile_state=volatile_state,
        app_component=app,
        execution_id=execution_id
    )

    # Run frame
    await tick_loop.run()

    print("\n📊 State Isolation Results:")
    print(f"  App captured value: {app.snapshot_values[0]}")
    print(f"  Original volatile state: {volatile_state.get('test_value')}")
    print(f"  Snapshot modified during render: {tick_loop.volatile_state.get('test_value')}")

    # Verify isolation - snapshot modification doesn't affect original
    assert app.snapshot_values[0] == 42
    assert volatile_state.get('test_value') == 42  # Original unchanged

    print("✅ State isolation verified!")


async def demo_frame_coalescing():
    """Demonstrate frame coalescing behavior."""
    print("\n🧪 Demo: Frame Coalescing")
    print("=" * 50)

    def static_app(ctx):
        return PhaseNode(
            key="static_phase",
            name="unchanged",
            children=[TextNode("Static content")]
        )

    volatile_state = {}
    execution_id = str(uuid.uuid4())

    tick_loop = DemoTickLoop(
        volatile_state=volatile_state,
        app_component=static_app,
        execution_id=execution_id
    )

    # Run first frame
    print("\n📍 Running first frame...")
    await tick_loop._run_single_frame()

    # Run second frame (should be coalesced)
    print("\n📍 Running second frame...")
    await tick_loop._run_single_frame()

    print(f"\n📊 Frame Coalescing Results:")
    print(f"  Frames rendered: 2")
    print(f"  Frames saved: {len(tick_loop.frames)}")

    # Should only have one frame due to coalescing
    assert len(tick_loop.frames) == 1
    print("✅ Frame coalescing verified!")


if __name__ == "__main__":
    import asyncio

    async def main():
        print("🚀 Smithers Tick Loop Engine Demo")
        print("=" * 60)
        print()

        try:
            # Run all demos
            tick_loop1 = await demo_basic_functionality()
            await demo_state_isolation()
            await demo_frame_coalescing()

            print("\n🎉 All demos completed successfully!")
            print("\n📄 Final Frame XML:")
            print("-" * 40)
            print(tick_loop1.frames[0]['xml_content'])
            print("-" * 40)

        except Exception as e:
            print(f"\n❌ Demo failed: {e}")
            import traceback
            traceback.print_exc()

    asyncio.run(main())