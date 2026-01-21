#!/usr/bin/env python3
"""Run MCP resources tests"""

import subprocess
import sys

# Run pytest on MCP tests
print("Running MCP Resources tests...")
result = subprocess.run(
    [sys.executable, "-m", "pytest", "smithers_py/mcp/test_resources.py", "-v", "--tb=short"],
    capture_output=True,
    text=True
)

print(result.stdout)
if result.stderr:
    print("STDERR:", result.stderr)

# Show summary
if result.returncode == 0:
    print("\n✓ All tests passed!")
else:
    print("\n✗ Tests failed!")
    sys.exit(1)