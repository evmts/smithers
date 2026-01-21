#!/usr/bin/env python3
"""Simple test to verify M1 event handler functionality."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'smithers_py'))

try:
    # Test imports
    from smithers_py.nodes import ClaudeNode
    from smithers_py.engine.events import EventSystem
    from smithers_py.engine.handler_transaction import HandlerTransaction
    from smithers_py.state.base import WriteOp, StoreTarget
    print("✅ All M1 imports successful")

    # Test ClaudeNode with event handlers
    def test_handler(result, ctx):
        print("Handler called")

    node = ClaudeNode(
        key="test",
        prompt="Test prompt",
        model="haiku",
        on_finished=test_handler
    )

    assert node.on_finished is not None
    assert node.handlers.on_finished is not None
    print("✅ ClaudeNode event handler assignment works")

    # Test HandlerTransaction
    tx = HandlerTransaction()
    op = WriteOp(key="test", value="value", target=StoreTarget.SQLITE)
    tx.add_action(op)
    actions = tx.commit()
    assert len(actions) == 1
    assert actions[0].key == "test"
    print("✅ HandlerTransaction works")

    # Test EventSystem basic instantiation
    class MockDB:
        def __init__(self):
            self.current_execution_id = "test_exec"

        async def record_event(self, **kwargs):
            pass

    event_sys = EventSystem(MockDB())
    event_sys.update_mounted_nodes({"test": node})
    assert event_sys.is_node_mounted("test")
    assert not event_sys.is_node_mounted("unmounted")
    print("✅ EventSystem mount tracking works")

    print("\n✅ All M1 event handler basic tests passed!")

except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)