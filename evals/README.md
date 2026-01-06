# Smithers Evals (Tests)

Automated tests for the Smithers framework using Bun's test runner.

## Running Tests

```bash
# Run all tests
bun test

# Run a specific test file
bun test evals/hello-world.test.tsx

# Run with verbose output
bun test --verbose

# Watch mode
bun test --watch
```

## Test Structure

```
evals/
├── setup.ts                    # Enable mock mode for all tests
├── fixtures/                   # Test fixtures
│   └── props-agent.tsx         # Fixture for props testing
│
├── hello-world.test.tsx        # Basic rendering and execution
├── multi-agent.test.tsx        # Nested agents and coordination
├── multi-phase.test.tsx        # Ralph loop with state transitions
├── code-review.test.tsx        # Tool integration and MCP
├── all-features.test.tsx       # Comprehensive feature test
├── stop-component.test.tsx     # Stop component behavior
├── human-component.test.tsx    # Human approval component
├── error-recovery.test.tsx     # Error handling patterns
├── subagent-scheduling.test.tsx# Parallel execution
├── props.test.tsx              # CLI props handling
├── execute-options.test.tsx    # ExecuteOptions API
├── config.test.ts              # Configuration loading
└── cli.test.ts                 # CLI integration tests
```

## Mock Mode

All tests run in mock mode (no real API calls):

```typescript
// setup.ts
process.env.SMITHERS_MOCK_MODE = 'true'
```

Mock mode returns intelligent responses based on prompt content:
- Detects JSON format requests
- Returns appropriate mock structures
- Simulates failures for testing error paths

## Test Categories

### Basic Functionality

**`hello-world.test.tsx`**
- Render Claude component to XML
- Basic execution
- Simple output validation

**`multi-phase.test.tsx`**
- Zustand state management
- Ralph Wiggum loop transitions
- Phase-based workflows

### Component Testing

**`stop-component.test.tsx`**
- `<Stop>` component halts execution
- Reason prop handling
- Loop termination behavior

**`human-component.test.tsx`**
- `<Human>` approval workflow
- onApprove/onReject callbacks
- Auto-approve in tests

### Advanced Features

**`multi-agent.test.tsx`**
- Nested agent structures
- State coordination
- Multiple Claude nodes

**`subagent-scheduling.test.tsx`**
- Parallel execution with `<Subagent>`
- Execution ordering
- Concurrent state updates

**`code-review.test.tsx`**
- Tool definitions
- MCP server integration
- Structured output

**`all-features.test.tsx`**
- Comprehensive integration test
- All components together
- Complex workflows

### Error Handling

**`error-recovery.test.tsx`**
- onError callbacks
- Graceful degradation
- Error context preservation

### Configuration

**`config.test.ts`**
- Config file loading
- Option merging
- CLI precedence

**`cli.test.ts`**
- Command parsing
- File loading
- Props handling

## Writing Tests

### Basic Test Pattern

```typescript
import { describe, test, expect } from 'bun:test'
import './setup.ts'
import { renderPlan, executePlan, Claude } from '../src/index.js'

describe('feature', () => {
  test('renders correctly', async () => {
    const xml = await renderPlan(<Claude>Test</Claude>)
    expect(xml).toContain('<claude>')
  })

  test('executes correctly', async () => {
    const result = await executePlan(<Claude>Test</Claude>)
    expect(result.output).toBeDefined()
  })
})
```

### Testing State Transitions

```typescript
import { create } from 'zustand'

test('handles state transitions', async () => {
  const useStore = create((set) => ({
    phase: 'start',
    setPhase: (phase) => set({ phase }),
  }))

  function Agent() {
    const { phase, setPhase } = useStore()
    if (phase === 'start') {
      return <Claude onFinished={() => setPhase('done')}>Start</Claude>
    }
    return null
  }

  const result = await executePlan(<Agent />)
  expect(useStore.getState().phase).toBe('done')
})
```

### Testing Error Handling

```typescript
test('handles errors gracefully', async () => {
  let errorCaught = null

  function Agent() {
    return (
      <Claude onError={(e) => { errorCaught = e }}>
        This will fail intentionally
      </Claude>
    )
  }

  await executePlan(<Agent />)
  expect(errorCaught).toBeDefined()
})
```

## Fixtures

Test fixtures live in `fixtures/`:

```typescript
// fixtures/props-agent.tsx
export default function Agent({ message }) {
  return <Claude>{message}</Claude>
}
```

Used in tests:

```typescript
const element = await loadAgentFile('./evals/fixtures/props-agent.tsx')
```

## Coverage

To check which features are tested:

```bash
# Run tests with coverage
bun test --coverage
```

Key areas to maintain coverage:
- All component types render correctly
- State transitions in Ralph loop
- Error propagation
- MCP tool integration
- CLI commands
