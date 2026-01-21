#!/usr/bin/env python3
"""Test imports for M1 verification."""

import sys
import os

# Add current directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    print("Testing M1 imports...")

    # Test basic imports
    from smithers_py.nodes import ClaudeNode
    print("✓ ClaudeNode import successful")

    from smithers_py.engine.events import EventSystem
    print("✓ EventSystem import successful")

    from smithers_py.engine.handler_transaction import HandlerTransaction
    print("✓ HandlerTransaction import successful")

    from smithers_py.state.base import WriteOp, StoreTarget
    print("✓ WriteOp, StoreTarget import successful")

    from smithers_py.executors.base import AgentResult, TaskStatus
    print("✓ AgentResult, TaskStatus import successful")

    # Test instantiation
    node = ClaudeNode(
        key="test",
        prompt="Test prompt",
        model="haiku",
        on_finished=lambda r, c: print("Handler called")
    )
    print("✓ ClaudeNode instantiation successful")
    print(f"  - on_finished handler: {node.on_finished is not None}")
    print(f"  - handlers.on_finished: {node.handlers.on_finished is not None}")

    print("\n✅ All M1 imports successful!")

except Exception as e:
    print(f"\n❌ Import error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)