#!/bin/bash
#
# Ralph Loop - Continuous productionization agent for Smithers
#
# This script runs Claude Code in a loop to incrementally build,
# test, document, and productionize the Smithers framework.
#
# Usage: ./bash/ralph.sh
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

ITERATION=0

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}  Smithers Ralph Loop - Starting ${NC}"
echo -e "${BLUE}================================${NC}"
echo ""
echo "Project directory: $PROJECT_DIR"
echo "Press Ctrl+C to stop the loop"
echo ""

while true; do
    ITERATION=$((ITERATION + 1))

    echo -e "${GREEN}================================${NC}"
    echo -e "${GREEN}  Ralph Loop - Iteration $ITERATION${NC}"
    echo -e "${GREEN}================================${NC}"
    echo ""
    echo -e "${YELLOW}Reading prompt from bash/ralph-prompt.md...${NC}"

    # Read prompt fresh each iteration so updates are picked up
    if [[ -f "$PROJECT_DIR/bash/ralph-prompt.md" ]]; then
        RALPH_PROMPT=$(cat "$PROJECT_DIR/bash/ralph-prompt.md")
    else
        echo -e "${YELLOW}Warning: ralph-prompt.md not found, using fallback${NC}"
        RALPH_PROMPT="You are a senior software engineer. Read SPEC.md and continue productionizing Smithers."
    fi

    echo -e "${YELLOW}Starting Claude Code...${NC}"
    echo ""

    # Run Claude Code with the prompt
    # -p: print mode (non-interactive)
    # --dangerously-skip-permissions: bypass permission prompts for autonomous operation
    # Disable set -e temporarily to capture exit code without aborting
    set +e
    claude -p --dangerously-skip-permissions "$RALPH_PROMPT"
    EXIT_CODE=$?
    set -e

    echo ""
    echo -e "${BLUE}--------------------------------${NC}"
    echo -e "${BLUE}Iteration $ITERATION complete (exit code: $EXIT_CODE)${NC}"
    echo -e "${BLUE}--------------------------------${NC}"
    echo ""

    # Brief pause between iterations
    echo "Pausing 5 seconds before next iteration..."
    echo "Press Ctrl+C to stop"
    sleep 5
done
