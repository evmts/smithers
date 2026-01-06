# Manual Tests

These tests verify Smithers functionality with real Claude API calls. They are not part of the automated test suite because they require an API key and make real API calls.

## Prerequisites

1. Set your Anthropic API key:
   ```bash
   export ANTHROPIC_API_KEY=your-key-here
   ```

2. Ensure you have built the project:
   ```bash
   bun run build
   ```

## Running Tests

Each test can be run independently:

```bash
# Test 1: Basic text generation
bun run manual-tests/01-basic-execution.tsx

# Test 2: Tool calling
bun run manual-tests/02-with-tools.tsx

# Test 3: Multi-phase agent with state management
bun run manual-tests/03-multi-phase.tsx
```

## What Each Test Verifies

### 01-basic-execution.tsx
- Claude API client initialization
- Simple text generation
- Basic execution flow

### 02-with-tools.tsx
- Tool definition and registration
- Tool calling loop
- Multiple tool invocations in one execution

### 03-multi-phase.tsx
- Ralph Wiggum loop (re-rendering on state change)
- State management with Zustand
- Phase transitions
- Multiple frames of execution

## Troubleshooting

If tests fail, check:

1. **API Key**: Ensure `ANTHROPIC_API_KEY` is set and valid
2. **Build**: Run `bun run build` if you've made changes
3. **Dependencies**: Run `bun install` to ensure all deps are installed
4. **Rate Limits**: Wait a few seconds between test runs to avoid rate limiting

## Expected Behavior

Each test should:
- Print clear progress messages
- Show the XML plan before execution
- Display tool calls (if applicable)
- Show frame-by-frame execution progress
- Report final results and metrics
- Exit with status 0 on success

If you see `✅ Test passed`, the test completed successfully.
If you see `❌ Test failed`, check the error message for details.
