#!/usr/bin/env python3
"""Run node tests directly using pytest."""

import subprocess
import sys

# Run pytest on the node tests
result = subprocess.run([
    sys.executable, "-m", "pytest",
    "smithers_py/nodes/test_nodes.py",
    "-v",
    "--tb=short"
], capture_output=True, text=True)

print(result.stdout)
print(result.stderr)
sys.exit(result.returncode)