#!/usr/bin/env python3
"""Run all smithers_py tests."""

import subprocess
import sys
import os

os.chdir("smithers_py")

# Run pytest on all test files
result = subprocess.run([
    sys.executable, "-m", "pytest",
    ".",  # Run all tests in smithers_py directory
    "-v", "--tb=short"
], capture_output=True, text=True)

print(result.stdout)
if result.stderr:
    print("STDERR:", result.stderr)
print(f"\nReturn code: {result.returncode}")

# Exit with same code as pytest
sys.exit(result.returncode)