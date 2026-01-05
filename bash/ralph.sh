#!/bin/bash
#
# Ralph Loop - Continuous productionization agent for Plue
#
# This script runs Claude Code in a loop to incrementally build,
# test, document, and productionize the Plue framework.
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
echo -e "${BLUE}  Plue Ralph Loop - Starting    ${NC}"
echo -e "${BLUE}================================${NC}"
echo ""
echo "Project directory: $PROJECT_DIR"
echo "Press Ctrl+C to stop the loop"
echo ""

# The prompt that guides each iteration
# Note: read returns 1 at EOF, so we use || true to prevent set -e from aborting
read -r -d '' RALPH_PROMPT << 'PROMPT_EOF' || true
You are a senior software engineer working on Plue, a React-based framework for composable AI agent prompts. Your goal is to incrementally productionize this project to shipping quality.

## Your Mission

Complete and polish Plue until it's ready for public release on npm. Work methodically, one task at a time, with a focus on quality over speed.

## Project Context

Read these files to understand the project:
- SPEC.md - Full product specification
- README.md - Current documentation
- CLAUDE.md - Development guidelines
- docs/ - Detailed documentation
- src/ - Source code
- evals/ - Test files

## Priority Order

Work through these areas in order of importance:

### 1. Core Implementation (Highest Priority)
- Implement the React reconciler (PluDom) - see docs/pludom-design.md
- Make renderPlan() actually render JSX to XML
- Implement executePlan() with the Ralph Wiggum loop
- Connect to Claude Code SDK for actual LLM calls
- Implement MCP server auto-connection for tools

### 2. Testing & Quality
- Write comprehensive unit tests for all components
- Write integration tests for the CLI
- Ensure all evals pass
- Add error handling and edge case coverage
- Target >80% code coverage
- Fix any TypeScript errors (run `bun run typecheck`)

### 3. Documentation (Mintlify)
- Set up Mintlify configuration (mint.json)
- Create docs structure: getting-started, concepts, api-reference, examples
- Write clear, example-rich documentation
- Add code snippets that actually work
- Include troubleshooting guide

### 4. Publishing Infrastructure
- Set up changesets (@changesets/cli)
- Create GitHub Actions workflow for:
  - Running tests on PR
  - Publishing to npm on release
  - Deploying Mintlify docs
- Configure package.json for npm publishing
- Add CHANGELOG.md

### 5. Polish & DX
- Improve error messages
- Add helpful CLI output
- Create project templates
- Write CONTRIBUTING.md
- Add LICENSE file

## Working Guidelines

1. **One Task at a Time**: Pick the highest priority incomplete task and finish it before moving on.

2. **Test Everything**: Write tests as you implement. Don't move on until tests pass.

3. **Document as You Go**: Update docs when you add/change APIs.

4. **Commit Atomically**: Make small, focused commits with descriptive messages.

5. **Check Your Work**: After implementing something, verify it works:
   - Run `bun test` for unit tests
   - Run `bun run typecheck` for type errors
   - Test CLI commands manually if needed

6. **Read Before Writing**: Always read existing code before modifying it.

7. **Follow Patterns**: Match the existing code style and patterns.

## What to Do Now

1. First, assess the current state:
   - What's implemented vs stubbed?
   - What tests exist and are they passing?
   - What's the most critical missing piece?

2. Then pick ONE specific task and complete it fully.

3. Commit your changes with a clear message.

4. Report what you accomplished and what should be done next.

## Quality Checklist

Before considering any task complete:
- [ ] Code compiles without errors
- [ ] Tests pass
- [ ] TypeScript types are correct (no `any` in public API)
- [ ] Code is documented with JSDoc
- [ ] Changes are committed

Remember: Ship quality code. It's better to do one thing well than many things poorly.
PROMPT_EOF

while true; do
    ITERATION=$((ITERATION + 1))

    echo -e "${GREEN}================================${NC}"
    echo -e "${GREEN}  Ralph Loop - Iteration $ITERATION${NC}"
    echo -e "${GREEN}================================${NC}"
    echo ""
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
