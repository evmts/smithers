#!/bin/bash
# Run a Smithers agent with Tauri desktop visualization
#
# Usage: ./scripts/run-with-tauri.sh [agent-file]
# Example: ./scripts/run-with-tauri.sh packages/smithers/evals/signal-agent.tsx

set -e

AGENT_FILE="${1:-packages/smithers/evals/signal-agent.tsx}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$ROOT_DIR"

# Convert to absolute path if relative (and clean up double slashes)
if [[ ! "$AGENT_FILE" = /* ]]; then
  AGENT_FILE="$ROOT_DIR/$AGENT_FILE"
fi
AGENT_FILE=$(echo "$AGENT_FILE" | sed 's|/\./|/|g')

echo "================================================"
echo "  Smithers Agent Runner with Tauri Visualization"
echo "================================================"
echo ""
echo "Starting Tauri desktop app (this may take a moment to compile)..."
echo ""

# Start Tauri in foreground-ish mode so we can see output, but backgrounded
cd apps/tauri-app
pnpm dev:tauri &
TAURI_PID=$!
cd "$ROOT_DIR"

# Wait for Tauri WebSocket server to be ready (longer timeout for first compile)
echo "Waiting for Tauri WebSocket server (port 9876)..."
READY=false
for i in {1..120}; do
  if nc -z 127.0.0.1 9876 2>/dev/null; then
    echo "Tauri WebSocket server ready!"
    READY=true
    break
  fi
  # Show progress every 5 seconds
  if [ $((i % 10)) -eq 0 ]; then
    echo "  Still waiting... (${i}s)"
  fi
  sleep 1
done

if [ "$READY" = false ]; then
  echo "Warning: Tauri didn't start in time. Running agent anyway..."
fi

# Run the agent
echo ""
echo "Running agent: $AGENT_FILE"
echo ""

pnpm agent -y "$AGENT_FILE"

# Keep Tauri open
echo ""
echo "================================================"
echo "Agent complete! Tauri is still running."
echo "Press Ctrl+C to close Tauri and exit."
echo "================================================"

# Wait for Tauri process (or user interrupt)
wait $TAURI_PID 2>/dev/null || true
