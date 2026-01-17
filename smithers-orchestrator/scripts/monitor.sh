#!/usr/bin/env bash
#
# Smithers Workflow Monitoring Script
#
# Usage: bash monitor.sh <workflow-file>
# Example: bash monitor.sh .smithers/main.tsx

set -euo pipefail

WORKFLOW_FILE="${1:-.smithers/main.tsx}"
CHECK_INTERVAL=1

if [[ ! -f "$WORKFLOW_FILE" ]]; then
  echo "❌ Workflow file not found: $WORKFLOW_FILE"
  exit 1
fi

echo "🔍 Monitoring Smithers workflow: $WORKFLOW_FILE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Get workflow directory
WORKFLOW_DIR=$(dirname "$WORKFLOW_FILE")

# Check if node_modules exists
if [[ ! -d "$WORKFLOW_DIR/node_modules" ]]; then
  echo "⚠️  Dependencies not installed. Run:"
  echo "   cd $WORKFLOW_DIR && bun install smithers zustand"
  echo ""
fi

# Extract workflow name from file
WORKFLOW_NAME=$(basename "$WORKFLOW_FILE" .tsx)

# Create log file
LOG_FILE="/tmp/smithers-${WORKFLOW_NAME}-$(date +%s).log"

echo "📋 Workflow: $WORKFLOW_NAME"
echo "📁 Directory: $WORKFLOW_DIR"
echo "📝 Log file: $LOG_FILE"
echo ""
echo "Starting execution..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Execute workflow and capture output
(cd "$WORKFLOW_DIR" && bun run "$WORKFLOW_FILE" 2>&1 | tee "$LOG_FILE") &
WORKFLOW_PID=$!

# Monitor execution
ITERATION=0
LAST_LINE=""

while kill -0 $WORKFLOW_PID 2>/dev/null; do
  sleep $CHECK_INTERVAL
  ITERATION=$((ITERATION + 1))

  # Get latest log line
  if [[ -f "$LOG_FILE" ]]; then
    CURRENT_LINE=$(tail -1 "$LOG_FILE" 2>/dev/null || echo "")

    if [[ "$CURRENT_LINE" != "$LAST_LINE" ]]; then
      LAST_LINE="$CURRENT_LINE"

      # Parse for phase changes
      if echo "$CURRENT_LINE" | grep -q "phase complete\|Phase:"; then
        echo "  ✓ $CURRENT_LINE"
      fi

      # Parse for errors
      if echo "$CURRENT_LINE" | grep -qi "error\|failed"; then
        echo "  ✗ $CURRENT_LINE"
      fi
    fi
  fi

  # Show progress indicator
  if ((ITERATION % 5 == 0)); then
    echo "  ⏳ Running... (${ITERATION}s elapsed)"
  fi
done

# Wait for process to complete
wait $WORKFLOW_PID
EXIT_CODE=$?

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [[ $EXIT_CODE -eq 0 ]]; then
  echo "✅ Workflow completed successfully"
else
  echo "❌ Workflow failed with exit code: $EXIT_CODE"
fi

echo ""
echo "📊 Summary:"
echo "   Duration: ${ITERATION}s"
echo "   Log file: $LOG_FILE"
echo ""

# Show final stats
if [[ -f "$LOG_FILE" ]]; then
  PHASE_COUNT=$(grep -c "phase complete" "$LOG_FILE" 2>/dev/null || echo "0")
  ERROR_COUNT=$(grep -ci "error" "$LOG_FILE" 2>/dev/null || echo "0")

  echo "   Phases completed: $PHASE_COUNT"
  echo "   Errors encountered: $ERROR_COUNT"
  echo ""
fi

# Offer to show full log
if [[ $EXIT_CODE -ne 0 ]]; then
  echo "💡 To view full log:"
  echo "   cat $LOG_FILE"
  echo ""
fi

exit $EXIT_CODE
