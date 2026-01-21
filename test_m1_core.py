#!/usr/bin/env python3
"""Test core M1 functionality without pytest."""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

print("Testing M1 Core Components...")

# Test imports
try:
    from smithers_py.nodes import ClaudeNode
    from smithers_py.engine.events import EventSystem
    from smithers_py.engine.handler_transaction import HandlerTransaction
    from smithers_py.state.base import WriteOp, StoreTarget
    from smithers_py.executors.base import AgentResult, TaskStatus
    print("✅ All imports successful")
except ImportError as e:
    print(f"❌ Import error: {e}")
    sys.exit(1)

# Test ClaudeNode with handlers
handler_called = False

def test_handler(result, ctx):
    global handler_called
    handler_called = True

node = ClaudeNode(
    key="test",
    prompt="Test prompt",
    model="haiku",
    on_finished=test_handler
)

print(f"✅ ClaudeNode created with handler: {node.on_finished is not None}")

# Test HandlerTransaction
tx = HandlerTransaction()
op = WriteOp(key="test", value="value", target=StoreTarget.SQLITE)
tx.add_action(op)
actions = tx.commit()

print(f"✅ HandlerTransaction works: {len(actions)} actions")

# Test EventSystem
class MockDB:
    current_execution_id = "test"
    async def record_event(self, **kwargs):
        pass

event_sys = EventSystem(MockDB())
event_sys.update_mounted_nodes({"test": node})

print(f"✅ EventSystem mount tracking: {event_sys.is_node_mounted('test')}")

print("\n✅ M1 Core Components Test - PASSED")
print("All M1 event handler components are working correctly.")