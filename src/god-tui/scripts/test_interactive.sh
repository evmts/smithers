#!/bin/bash
# Test script for god-agent interactive mode
# Uses GOD_TUI_DEBUG=1 to enable logging

set -e

cd "$(dirname "$0")/.."

echo "Building god-agent..."
zig build

echo "Testing print mode..."
# Test that print mode works (doesn't require TTY)
echo "Testing basic print mode response..."
GOD_TUI_DEBUG=1 ./zig-out/bin/god-agent -p "Say hello in one word" 2>&1 | head -20

echo ""
echo "Print mode test completed."
echo ""

# Check if debug log was created
if [ -f ".god-tui-debug.log" ]; then
    echo "Debug log contents:"
    cat .god-tui-debug.log
    rm .god-tui-debug.log
fi

echo ""
echo "Tests completed successfully!"
