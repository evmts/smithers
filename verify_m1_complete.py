#!/usr/bin/env python3
"""M1 Verification - Complete test suite for M1 event handlers."""

import sys
import os
import subprocess

# Add smithers to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

print("=" * 70)
print("M1 VERIFICATION - Event Handler System")
print("=" * 70)

# Track overall status
all_passed = True

def run_test(description, test_func):
    """Run a test and track results."""
    global all_passed
    try:
        print(f"\n{description}...")
        test_func()
        print(f"✅ {description} - PASSED")
    except Exception as e:
        all_passed = False
        print(f"❌ {description} - FAILED")
        print(f"   Error: {e}")
        import traceback
        traceback.print_exc()

# Test 1: Import verification
def test_imports():
    """Verify all M1 modules can be imported."""
    from smithers_py.nodes import ClaudeNode
    from smithers_py.engine.events import EventSystem
    from smithers_py.engine.handler_transaction import HandlerTransaction
    from smithers_py.state.base import WriteOp, StoreTarget
    from smithers_py.executors.base import AgentResult, TaskStatus

# Test 2: ClaudeNode event handlers
def test_claude_node_handlers():
    """Verify ClaudeNode supports event handlers."""
    from smithers_py.nodes import ClaudeNode

    def on_finished(result, ctx):
        pass

    def on_error(error, ctx):
        pass

    # Test construction with handlers
    node = ClaudeNode(
        key="test",
        prompt="Test",
        model="haiku",
        on_finished=on_finished,
        on_error=on_error
    )

    assert node.on_finished is not None
    assert node.handlers.on_finished is not None
    assert node.on_error is not None
    assert node.handlers.on_error is not None

# Test 3: Handler transaction
def test_handler_transaction():
    """Verify transaction semantics work."""
    from smithers_py.engine.handler_transaction import HandlerTransaction
    from smithers_py.state.base import WriteOp, StoreTarget

    tx = HandlerTransaction()

    # Add actions
    op1 = WriteOp(key="test1", value="val1", target=StoreTarget.SQLITE)
    op2 = WriteOp(key="test2", value="val2", target=StoreTarget.VOLATILE)

    tx.add_action(op1)
    tx.add_action(op2)

    # Commit and verify
    actions = tx.commit()
    assert len(actions) == 2
    assert actions[0].key == "test1"
    assert actions[1].key == "test2"

# Test 4: EventSystem mount tracking
def test_event_system():
    """Verify EventSystem tracks mounted nodes."""
    from smithers_py.engine.events import EventSystem
    from smithers_py.nodes import ClaudeNode

    class MockDB:
        def __init__(self):
            self.current_execution_id = "test"

        async def record_event(self, **kwargs):
            pass

    event_sys = EventSystem(MockDB())

    # Test mount tracking
    node = ClaudeNode(key="test_node", prompt="Test", model="haiku")
    event_sys.update_mounted_nodes({"test_node": node})

    assert event_sys.is_node_mounted("test_node")
    assert not event_sys.is_node_mounted("unmounted_node")

# Test 5: Run pytest tests
def test_pytest_suite():
    """Run the full pytest test suite."""
    print("\nRunning pytest test suite...")

    # Run pytest on smithers_py directory
    cmd = [sys.executable, "-m", "pytest", "smithers_py/", "-v", "--tb=short"]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)

        # Show output
        if result.stdout:
            print(result.stdout)
        if result.stderr:
            print(result.stderr)

        # Check for success
        if result.returncode != 0:
            raise Exception(f"pytest failed with exit code {result.returncode}")

        # Parse output for results
        output_lines = result.stdout.split('\n')
        for line in output_lines:
            if "passed" in line and ("failed" in line or "error" in line):
                # Extract test counts
                print(f"\nTest Results: {line}")
                if "0 failed" not in line or "0 errors" not in line:
                    raise Exception("Some tests failed")

    except subprocess.TimeoutExpired:
        raise Exception("pytest timed out after 60 seconds")
    except FileNotFoundError:
        raise Exception(f"pytest not found. Python executable: {sys.executable}")

# Run all tests
run_test("Import verification", test_imports)
run_test("ClaudeNode event handlers", test_claude_node_handlers)
run_test("Handler transaction", test_handler_transaction)
run_test("EventSystem mount tracking", test_event_system)
run_test("Full pytest suite", test_pytest_suite)

# Final summary
print("\n" + "=" * 70)
if all_passed:
    print("✅ M1 VERIFICATION COMPLETE - ALL TESTS PASSED")
    print("The smithers_py M1 milestone (event handlers) is fully implemented.")
else:
    print("❌ M1 VERIFICATION FAILED - Some tests did not pass")
    print("Please fix the issues above before proceeding.")

print("=" * 70)

sys.exit(0 if all_passed else 1)