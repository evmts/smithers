"""
Smithers Tick Loop Engine

Implements the 7-phase tick loop for rendering, reconciliation, and execution:
1. State Snapshot - freeze db_state + v_state + tasks + frame_clock
2. Render Phase - produce Plan Tree (pure, no side effects, track deps)
3. Reconcile Phase - diff vs previous frame by stable node identity
4. Commit Phase - persist frame to SQLite
5. Execute Phase - start runnable tasks for newly mounted nodes
6. Post-Commit Effects - run effects whose deps changed
7. State Update Flush - apply all queued updates atomically
"""

import asyncio
import time
import uuid
from datetime import datetime
from typing import Any, Dict, Optional, Callable, List, Set
from dataclasses import dataclass

from ..db.database import SmithersDB
from ..state.volatile import VolatileStore
from ..state.sqlite import SqliteStore
from ..nodes import Node
from ..serialize.xml import serialize_to_xml
from ..executors import ClaudeExecutor, RateLimitCoordinator
from ..executors.base import TaskStatus, StreamEvent, AgentResult
from .events import EventSystem


@dataclass
class Context:
    """
    Context object providing snapshots and frame data to render functions.

    Contains frozen snapshots of all state stores and frame metadata.
    All access is read-only during render phase to ensure purity.
    """

    # State snapshots (frozen at frame start)
    v: Dict[str, Any]  # Volatile state snapshot
    state: Dict[str, Any]  # SQLite state snapshot
    db: SmithersDB  # Database handle for queries

    # Frame metadata
    frame_id: int
    _frame_start_time: float

    def now(self) -> float:
        """Get deterministic frame time (frozen at frame start)."""
        return self._frame_start_time


class TickLoop:
    """
    Main tick loop engine implementing 7-phase rendering cycle.

    Manages the complete lifecycle from state snapshot through execution
    with frame coalescing and throttling to 250ms minimum intervals.
    """

    def __init__(
        self,
        db: SmithersDB,
        volatile_state: VolatileStore,
        app_component: Callable[[Context], Node],
        execution_id: str
    ):
        self.db = db
        self.volatile_state = volatile_state
        self.app_component = app_component
        self.execution_id = execution_id

        # State management
        self.sqlite_state = SqliteStore(db.db_path, execution_id)

        # Frame tracking
        self.frame_id = 0
        self.last_frame_time = 0.0
        self.last_frame_xml: Optional[str] = None

        # Reconciliation state
        self.previous_tree: Optional[Node] = None
        self.mounted_nodes: Dict[str, Node] = {}  # Track mounted runnable nodes

        # Configuration
        self.min_frame_interval = 0.25  # 250ms throttle

        # Executors
        self.rate_limiter = RateLimitCoordinator()
        self.claude_executor = ClaudeExecutor(db)

        # Event system
        self.event_system = EventSystem(db)

        # Task tracking
        self.running_tasks: Set[str] = set()
        self.task_futures: Dict[str, asyncio.Task] = {}
        self.task_results: Dict[str, AgentResult] = {}  # Store results for event handling

    async def run(self) -> None:
        """
        Main tick loop with frame coalescing.

        For M0: renders once and exits since no runnable nodes exist yet.
        Future versions will loop until no pending work remains.
        """
        print(f"🎬 Starting tick loop for execution {self.execution_id}")

        try:
            # M0: Single frame render and exit
            await self._run_single_frame()
            print("✅ M0 tick loop completed successfully")

        except Exception as e:
            print(f"❌ Tick loop failed: {e}")
            raise

    async def _run_single_frame(self) -> None:
        """Execute a single frame of the 7-phase tick cycle."""
        frame_start_time = time.time()

        # Skip frame if too soon (throttling)
        if frame_start_time - self.last_frame_time < self.min_frame_interval:
            return

        print(f"🎯 Frame {self.frame_id} starting...")

        try:
            # PHASE 1: State Snapshot
            ctx = await self._phase1_state_snapshot(frame_start_time)

            # PHASE 2: Render (pure)
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

            # Update frame tracking
            self.frame_id += 1
            self.last_frame_time = frame_start_time
            self.previous_tree = current_tree

            print(f"✅ Frame {self.frame_id - 1} completed")

        except Exception as e:
            print(f"❌ Frame {self.frame_id} failed: {e}")
            raise

    async def _phase1_state_snapshot(self, frame_start_time: float) -> Context:
        """
        Phase 1: Create frozen snapshots of all state stores.

        Returns Context object with read-only views of:
        - Volatile state
        - SQLite state
        - Database handle
        - Frame metadata
        """
        print("  📸 Phase 1: State Snapshot")

        # Create snapshots (deep copies for isolation)
        v_snapshot = self.volatile_state.snapshot()
        state_snapshot = self.sqlite_state.snapshot()

        return Context(
            v=v_snapshot,
            state=state_snapshot,
            db=self.db,
            frame_id=self.frame_id,
            _frame_start_time=frame_start_time
        )

    async def _phase2_render(self, ctx: Context) -> Node:
        """
        Phase 2: Pure render phase producing Plan Tree.

        Calls app component with frozen context.
        No side effects allowed - only tree construction.
        """
        print("  🎨 Phase 2: Render")

        # Call user's app component with frozen context
        tree = self.app_component(ctx)

        # Validate tree structure
        if not hasattr(tree, 'type'):
            raise ValueError(f"Invalid tree root: {tree}")

        return tree

    async def _phase3_reconcile(self, current_tree: Node) -> Dict[str, Any]:
        """
        Phase 3: Reconcile current tree vs previous by stable node identity.

        Returns diff information about what changed.
        For M0: simple comparison, future versions will do proper reconciliation.
        """
        print("  🔄 Phase 3: Reconcile")

        changes = {
            "mounted": [],
            "updated": [],
            "unmounted": [],
            "tree_changed": self.previous_tree != current_tree
        }

        # Build current mounted nodes map
        new_mounted_nodes = {}
        self._collect_runnable_nodes(current_tree, new_mounted_nodes)

        if self.previous_tree is None:
            # First render - everything is mounted
            changes["mounted"] = list(new_mounted_nodes.values())
        else:
            # Determine what changed
            old_node_ids = set(self.mounted_nodes.keys())
            new_node_ids = set(new_mounted_nodes.keys())

            # Newly mounted
            for node_id in new_node_ids - old_node_ids:
                changes["mounted"].append(new_mounted_nodes[node_id])

            # Still mounted (updated)
            for node_id in new_node_ids & old_node_ids:
                changes["updated"].append(new_mounted_nodes[node_id])

            # Unmounted
            for node_id in old_node_ids - new_node_ids:
                changes["unmounted"].append(self.mounted_nodes[node_id])

        # Update event system with current mounted nodes
        self.event_system.update_mounted_nodes(new_mounted_nodes)
        self.mounted_nodes = new_mounted_nodes

        return changes

    def _collect_runnable_nodes(self, node: Node, collected: Dict[str, Node]) -> None:
        """Recursively collect all runnable nodes with their IDs."""
        from smithers_py.nodes import ClaudeNode

        # Generate node ID based on path
        node_id = node.key or f"{node.type}_{id(node)}"

        # Check if this is a runnable node
        if isinstance(node, ClaudeNode):
            collected[node_id] = node

        # Recurse into children
        if hasattr(node, 'children'):
            for child in node.children:
                self._collect_runnable_nodes(child, collected)

    async def _phase4_commit(self, current_tree: Node, ctx: Context) -> None:
        """
        Phase 4: Persist frame to SQLite as XML.

        Saves the rendered tree as XML in render_frames table.
        """
        print("  💾 Phase 4: Commit")

        # Serialize tree to XML
        xml_content = serialize_to_xml(current_tree)

        # Skip if XML unchanged (frame coalescing)
        if xml_content == self.last_frame_xml:
            print("    ⏭️  Skipping duplicate frame")
            return

        # Save frame to database
        frame_id = await self.db.frames.save(
            execution_id=self.execution_id,
            xml_content=xml_content,
            sequence_number=self.frame_id
        )

        self.last_frame_xml = xml_content
        print(f"    💾 Saved frame {frame_id} (sequence {self.frame_id})")

    async def _phase5_execute(self, changes: Dict[str, Any]) -> None:
        """
        Phase 5: Start runnable tasks for newly mounted nodes and handle completed tasks.

        - Starts execution for newly mounted runnable nodes
        - Processes completed tasks and fires event handlers
        - Applies state changes from event handlers
        """
        print("  🚀 Phase 5: Execute")

        # First, check for completed tasks and fire event handlers
        completed_tasks = []
        for task_id, task in list(self.task_futures.items()):
            if task.done():
                completed_tasks.append(task_id)

        if completed_tasks:
            print(f"    📋 Processing {len(completed_tasks)} completed tasks")

            # Collect all state changes from event handlers
            all_state_changes = []

            for task_id in completed_tasks:
                # Get the result
                result = self.task_results.get(task_id)
                if result:
                    # Execute event handlers and collect state changes
                    ctx = await self._phase1_state_snapshot(time.time())
                    state_changes = await self.event_system.handle_agent_completion(
                        node_id=task_id,
                        result=result,
                        ctx=ctx
                    )
                    all_state_changes.extend(state_changes)

                # Clean up
                self.running_tasks.discard(task_id)
                self.task_futures.pop(task_id, None)
                self.task_results.pop(task_id, None)

            # Apply all state changes from event handlers
            if all_state_changes:
                print(f"    💾 Applying {len(all_state_changes)} state changes from event handlers")
                # Queue changes to be applied in Phase 7
                self.sqlite_state.enqueue(all_state_changes)

        # Find runnable nodes in the mounted set
        runnable_nodes = self._find_runnable(changes.get("mounted", []))

        if runnable_nodes:
            print(f"    📋 Starting {len(runnable_nodes)} new runnable tasks")

            for node in runnable_nodes:
                node_id = node.key or f"{node.type}_{id(node)}"
                # Start execution for each runnable node
                task = asyncio.create_task(self._execute_node(node, node_id))
                self.task_futures[node_id] = task
                self.running_tasks.add(node_id)
        elif not completed_tasks:
            print("    📋 No runnable nodes to execute")

    async def _phase6_post_commit_effects(self, changes: Dict[str, Any]) -> None:
        """
        Phase 6: Run effects whose dependencies changed.

        M0: No-op since no effect system exists yet.
        Future versions will handle cleanup, notifications, etc.
        """
        print("  ✨ Phase 6: Post-Commit Effects (M0: no-op)")

        # M0: No effect system implemented yet
        pass

    async def _phase7_state_flush(self) -> None:
        """
        Phase 7: Apply all queued state updates atomically.

        Commits any pending writes to both volatile and SQLite stores.
        """
        print("  🔄 Phase 7: State Update Flush")

        # Commit any pending writes
        if self.volatile_state.has_pending_writes():
            self.volatile_state.commit()
            print("    ✅ Flushed volatile state updates")

        if self.sqlite_state.has_pending_writes():
            self.sqlite_state.commit()
            print("    ✅ Flushed SQLite state updates")

    def _find_runnable(self, nodes: List[Node]) -> List[Node]:
        """Find all runnable nodes (ClaudeNode) in the given list."""
        from smithers_py.nodes import ClaudeNode

        runnable = []
        for node in nodes:
            if isinstance(node, ClaudeNode):
                runnable.append(node)
        return runnable

    async def _execute_node(self, node: Node, node_id: str) -> None:
        """Execute a runnable node and store its result."""
        from smithers_py.nodes import ClaudeNode

        if not isinstance(node, ClaudeNode):
            return

        try:
            print(f"    🤖 Executing Claude node {node_id}")

            # Execute through the Claude executor
            result = None
            async for event in self.claude_executor.execute(
                node_id=node_id,
                prompt=node.prompt,
                model=node.model,
                max_turns=node.max_turns
            ):
                if isinstance(event, StreamEvent):
                    # Handle streaming events
                    if node.on_progress and event.kind == "token":
                        # Call progress handler with token
                        if asyncio.iscoroutinefunction(node.on_progress):
                            await node.on_progress(event.payload.get("text", ""))
                        else:
                            node.on_progress(event.payload.get("text", ""))
                elif isinstance(event, AgentResult):
                    # Final result
                    result = event

            # Store result for event handling in next frame
            if result:
                self.task_results[node_id] = result
                print(f"    ✅ Claude node {node_id} completed with status: {result.status}")

        except Exception as e:
            print(f"    ❌ Claude node {node_id} failed: {e}")
            # Create error result for event handling
            self.task_results[node_id] = AgentResult(
                run_id=str(uuid.uuid4()),
                node_id=node_id,
                status=TaskStatus.ERROR,
                model=node.model,
                started_at=datetime.now(),
                ended_at=datetime.now(),
                error=e,
                error_message=str(e),
                error_type=type(e).__name__
            )