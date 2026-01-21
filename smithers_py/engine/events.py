"""Event handling system for smithers-py.

Manages event handler execution with proper isolation and error handling.
Event handlers only run in the Execute phase and their state changes are
batched and flushed deterministically.
"""

import asyncio
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional, Set
from dataclasses import dataclass
import traceback

from ..nodes import Node, ClaudeNode
from ..executors.base import AgentResult, TaskStatus
from ..state.base import WriteOp, StoreTarget
from .handler_transaction import HandlerTransaction


@dataclass
class EventRecord:
    """Record of an event handler execution for audit logging."""
    node_id: str
    handler_name: str
    trigger: str  # What triggered the event (e.g., "task_complete", "task_error")
    timestamp: datetime
    success: bool
    error: Optional[str] = None
    state_changes: List[WriteOp] = None

    def __post_init__(self):
        if self.state_changes is None:
            self.state_changes = []


class EventSystem:
    """Manages event handler execution and state transitions.

    Ensures:
    - Event handlers only fire for mounted nodes
    - Handler execution is atomic (all-or-nothing state changes)
    - Proper error isolation
    - Audit trail of all handler executions
    """

    def __init__(self, db):
        self.db = db
        self.pending_events: List[EventRecord] = []
        self.mounted_nodes: Dict[str, Node] = {}  # Updated by reconciler

    def update_mounted_nodes(self, mounted: Dict[str, Node]) -> None:
        """Update the set of currently mounted nodes.

        Called by the reconciler after each frame.
        """
        self.mounted_nodes = mounted.copy()

    def is_node_mounted(self, node_id: str) -> bool:
        """Check if a node is currently mounted."""
        return node_id in self.mounted_nodes

    async def handle_agent_completion(
        self,
        node_id: str,
        result: AgentResult,
        ctx: Any  # Context object
    ) -> List[WriteOp]:
        """Handle agent completion events (success or error).

        Returns list of state write operations to be applied.
        """
        # Check if node is still mounted (prevent stale results)
        if not self.is_node_mounted(node_id):
            print(f"⚠️ Ignoring completion event for unmounted node: {node_id}")
            return []

        node = self.mounted_nodes[node_id]

        # Only ClaudeNode supports event handlers currently
        if not isinstance(node, ClaudeNode):
            return []

        # Determine which handler to call
        if result.status == TaskStatus.DONE and node.on_finished:
            return await self._execute_handler(
                node_id=node_id,
                handler=node.on_finished,
                handler_name="onFinished",
                trigger="task_complete",
                result=result,
                ctx=ctx
            )
        elif result.status == TaskStatus.ERROR and node.on_error:
            return await self._execute_handler(
                node_id=node_id,
                handler=node.on_error,
                handler_name="onError",
                trigger="task_error",
                result=result.error or Exception(result.error_message),
                ctx=ctx
            )

        return []

    async def _execute_handler(
        self,
        node_id: str,
        handler: Callable,
        handler_name: str,
        trigger: str,
        result: Any,
        ctx: Any
    ) -> List[WriteOp]:
        """Execute a single event handler with transaction semantics.

        Returns list of state changes if successful, empty list on error.
        """
        print(f"  🎯 Executing {handler_name} for node {node_id}")

        # Create transaction for atomic state changes
        transaction = HandlerTransaction()

        # Create a wrapped context that intercepts state.set calls
        class TransactionalContext:
            def __init__(self, base_ctx, tx):
                self._base = base_ctx
                self._tx = tx

            @property
            def state(self):
                """Return a wrapped state accessor."""
                class StateWrapper:
                    def __init__(self, base_state, tx):
                        self._base = base_state
                        self._tx = tx

                    def get(self, key: str):
                        return self._base.get(key)

                    def set(self, key: str, value: Any, trigger: Optional[str] = None):
                        # Queue in transaction instead of direct write
                        op = WriteOp(
                            key=key,
                            value=value,
                            trigger=trigger or f"{handler_name}:{node_id}",
                            target=StoreTarget.SQLITE
                        )
                        self._tx.add_action(op)

                return StateWrapper(self._base.state, self._tx)

            @property
            def v(self):
                """Return a wrapped volatile state accessor."""
                class VolatileWrapper:
                    def __init__(self, base_v, tx):
                        self._base = base_v
                        self._tx = tx

                    def get(self, key: str):
                        return self._base.get(key)

                    def set(self, key: str, value: Any):
                        # Queue in transaction
                        op = WriteOp(
                            key=key,  # No prefix needed, StoreTarget handles routing
                            value=value,
                            trigger=f"{handler_name}:{node_id}",
                            target=StoreTarget.VOLATILE
                        )
                        self._tx.add_action(op)

                return VolatileWrapper(self._base.v, self._tx)

            # Delegate other attributes
            def __getattr__(self, name):
                return getattr(self._base, name)

        wrapped_ctx = TransactionalContext(ctx, transaction)

        # Execute handler
        event_record = EventRecord(
            node_id=node_id,
            handler_name=handler_name,
            trigger=trigger,
            timestamp=datetime.now(),
            success=False
        )

        try:
            # Call the handler with result and wrapped context
            if asyncio.iscoroutinefunction(handler):
                await handler(result, wrapped_ctx)
            else:
                handler(result, wrapped_ctx)

            # Success - commit transaction
            actions = transaction.commit()
            event_record.success = True
            event_record.state_changes = actions

            print(f"    ✅ {handler_name} completed with {len(actions)} state changes")

            # Record event for audit
            await self._record_event(event_record)

            return actions

        except Exception as e:
            # Handler failed - rollback
            transaction.rollback()
            event_record.error = f"{type(e).__name__}: {str(e)}\n{traceback.format_exc()}"

            print(f"    ❌ {handler_name} failed: {e}")

            # Record failed event for audit
            await self._record_event(event_record)

            # Return empty list - no state changes
            return []

    async def _record_event(self, event: EventRecord) -> None:
        """Record event execution in database for audit trail."""
        # Store in events table
        event_data = {
            "node_id": event.node_id,
            "handler_name": event.handler_name,
            "trigger": event.trigger,
            "success": event.success,
            "error": event.error,
            "state_changes": [
                {
                    "key": op.key,
                    "value": op.value,
                    "trigger": op.trigger
                }
                for op in event.state_changes
            ] if event.state_changes else []
        }

        await self.db.record_event(
            execution_id=self.db.current_execution_id,
            source="event_handler",
            node_id=event.node_id,
            event_type=f"handler_{event.handler_name}",
            payload_json=event_data
        )

    def clear_stale_handlers(self, unmounted_node_ids: Set[str]) -> None:
        """Clear any pending events for unmounted nodes."""
        # This ensures we don't execute handlers for nodes that were unmounted
        # Would be used if we queue events for batch processing
        pass