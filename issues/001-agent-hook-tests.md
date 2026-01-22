# ISSUE-001: Add Tests for Agent Hooks

**Priority:** HIGH  
**Effort:** L (1-2 days)  
**Category:** Test Coverage  
**Status:** In Progress

## Progress

Unit tests added for agent hooks and adapters:

| File | LOC | Tests |
|------|-----|-------|
| `src/hooks/useClaude.ts` | 20 | ✅ 22 tests |
| `src/hooks/useAmp.ts` | 20 | ✅ 21 tests |
| `src/hooks/useCodex.ts` | 20 | ✅ 37 tests |
| `src/hooks/useAgentRunner.ts` | 240 | ✅ 32 tests |
| `src/hooks/useReview.ts` | ~100 | ✅ 37 tests |
| `src/hooks/useSmithersSubagent.ts` | ~150 | ✅ 39 tests |

Adapter tests (already existed):
- `src/hooks/adapters/claude.test.ts` - ✅ 
- `src/hooks/adapters/amp.test.ts` - ✅
- `src/hooks/adapters/codex.test.ts` - ✅

## Remaining Work

- [ ] E2E tests with real CLI (requires mocking or API key)
- [x] Tests for useReview and useSmithersSubagent
- [ ] Full integration tests with SmithersProvider context

## Original Problem

The core agent hooks have **zero test coverage**:

These are the most critical hooks in the system - they execute all agent work.

## Required Tests

### 1. Unit Tests (Mocked CLI)

```typescript
// src/hooks/useClaude.test.ts

describe('useClaude', () => {
  // Execution gating
  test('does not execute when executionEnabled=false')
  test('does not execute when executionScope.enabled=false')
  test('does not execute when isStopRequested()=true')
  test('executes once per ralphCount change')
  
  // Status tracking
  test('status transitions: pending → running → complete')
  test('status transitions: pending → running → error on failure')
  
  // DB integration
  test('creates task on execution start')
  test('completes task on execution end')
  test('records agent in db.agents')
  test('records stream events when enabled')
  
  // Middleware
  test('applies provider middleware')
  test('applies props middleware')
  test('applies retry middleware on failure')
  test('applies validation middleware when validate prop set')
  
  // Result handling
  test('calls onFinished with result on success')
  test('calls onError with error on failure')
  test('parses structured output from JSON')
  
  // Tail log
  test('throttles tail log updates')
  test('flushes remaining content on completion')
  test('respects tailLogCount limit')
})
```

### 2. E2E Tests (Real CLI)

```typescript
// src/hooks/useClaude.e2e.test.ts

describe('useClaude E2E', () => {
  test('executes real Claude CLI and returns result', async () => {
    // Skip if ANTHROPIC_API_KEY not set
    // Actually run Claude with simple prompt
    // Verify output is non-empty
  })
  
  test('handles CLI timeout', async () => {
    // Set very short timeout
    // Verify error handling
  })
  
  test('retries on transient failure', async () => {
    // Trigger retry scenario
    // Verify retry count
  })
})
```

### 3. Boundary Conditions

```typescript
describe('useClaude boundary conditions', () => {
  test('maxRetries=0 throws on first failure')
  test('maxTurns=1 limits CLI turns')
  test('timeout=100ms triggers timeout error')
  test('empty prompt executes successfully')
  test('very long prompt (100KB) handles correctly')
})
```

### 4. Error Cases

```typescript
describe('useClaude error handling', () => {
  test('handles CLI not found error')
  test('handles invalid API key error')
  test('handles network timeout')
  test('handles malformed CLI output')
  test('handles JSON parse failure in structured output')
  test('handles middleware throwing')
})
```

## Acceptance Criteria

- [x] All 3 agent hooks have unit tests
- [ ] Each hook has E2E test (skippable without API key)
- [ ] Boundary conditions tested
- [ ] Error cases tested
- [ ] Line coverage > 90%

## Implementation Notes

1. Mock `executeClaudeCLI` for unit tests
2. Use real CLI for E2E (check for API key)
3. Create shared test utilities for agent hook testing
4. Consider testing after agent unification (fewer tests needed)
