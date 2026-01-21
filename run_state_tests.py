#!/usr/bin/env python3
"""Run state store tests."""

import subprocess
import sys

# Run pytest on the state test file
result = subprocess.run([
    sys.executable, "-m", "pytest",
    "smithers_py/state/test_stores.py",
    "-v", "--tb=short"
], capture_output=True, text=True)

print(result.stdout)
if result.stderr:
    print("STDERR:", result.stderr)
print(f"Return code: {result.returncode}")