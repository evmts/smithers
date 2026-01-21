#!/usr/bin/env python3
"""Quick test of ClaudeNode initialization"""

from smithers_py.nodes import ClaudeNode

# Test basic initialization
node = ClaudeNode(model="sonnet", prompt="Test")
print(f"✓ ClaudeNode created: model={node.model}, prompt={node.prompt}")

# Test with callbacks
def on_finish(result):
    print(f"Finished: {result}")

node2 = ClaudeNode(
    model="opus",
    prompt="Complex task",
    on_finished=on_finish
)
print(f"✓ ClaudeNode with callback created")

# Test that callback is accessible
assert node2.on_finished is on_finish
print(f"✓ Callback is accessible: {node2.on_finished}")

# Test serialization excludes callbacks
data = node2.model_dump()
assert "on_finished" not in data
assert "handlers" not in data
print(f"✓ Serialization excludes callbacks")

print("\nAll ClaudeNode tests passed!")