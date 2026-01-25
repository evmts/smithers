# ISSUE-003: Add Real E2E Tests (No Mocks)

**Priority:** HIGH  
**Effort:** L (1-2 days)  
**Category:** Test Coverage  
**Status:** In Progress

## Progress

Agent execution E2E tests added in `src/components/agents/claude-cli/e2e.test.ts`:

| Test | Status |
|------|--------|
| Claude executes simple prompt and returns result | ✅ (skips without API key) |
| Claude handles structured JSON output | ✅ (skips without API key) |
| Claude respects maxTurns=1 limit | ✅ (skips without API key) |
| Claude tracks token usage | ✅ (skips without API key) |
| Claude returns durationMs | ✅ (skips without API key) |
| handles very short timeout gracefully | ✅ |
| handles empty prompt | ✅ |

## Remaining Work

- [ ] Full workflow E2E test (Phase → Step → Claude)
- [ ] VCS integration tests (Git/JJ)
- [ ] CI configuration with secrets

## Problem

Current E2E tests in `evals/` use `SMITHERS_MOCK_MODE` which prevents actual CLI execution. We need real E2E tests that:

1. Actually execute agent CLIs
2. Test real error scenarios
3. Verify full workflow completion
4. Test retry/recovery behavior

## Required E2E Tests

### 1. Agent Execution

```typescript
// test/e2e/agent-execution.test.ts

describe('Agent Execution E2E', () => {
  // Skip if no API key
  const skipIfNoKey = process.env.ANTHROPIC_API_KEY ? test : test.skip
  
  skipIfNoKey('Claude executes simple prompt', async () => {
    const result = await executeClaudeCLI({
      prompt: 'Reply with exactly: HELLO',
      maxTurns: 1,
    })
    expect(result.output).toContain('HELLO')
  })
  
  skipIfNoKey('Claude handles structured output', async () => {
    const result = await executeClaudeCLI({
      prompt: 'Return JSON: {"status": "ok"}',
      outputFormat: 'json',
    })
    expect(result.structured).toEqual({ status: 'ok' })
  })
  
  skipIfNoKey('Claude respects maxTurns', async () => {
    const result = await executeClaudeCLI({
      prompt: 'Count to 100, one number per turn',
      maxTurns: 3,
    })
    expect(result.turnsUsed).toBeLessThanOrEqual(3)
  })
})
```

### 2. Full Workflow

```typescript
// test/e2e/workflow-complete.test.ts

describe('Workflow E2E', () => {
  skipIfNoKey('Phase → Step → Claude workflow', async () => {
    const db = createSmithersDB({ path: ':memory:' })
    const executionId = db.execution.start('E2E Test', 'test.tsx')
    
    await root.mount(
      <SmithersProvider db={db} executionId={executionId}>
        <Ralph id="test" condition={() => true} maxIterations={2}>
          <Phase name="test">
            <Step name="action">
              <Claude maxTurns={1}>Say hello</Claude>
            </Step>
          </Phase>
        </Ralph>
      </SmithersProvider>
    )
    
    // Verify execution completed
    const execution = db.execution.current()
    expect(execution.status).toBe('completed')
    expect(execution.total_agents).toBeGreaterThan(0)
  })
})
```

### 3. Error Recovery

```typescript
// test/e2e/error-recovery.test.ts

describe('Error Recovery E2E', () => {
  test('retries on transient error', async () => {
    let attempts = 0
    
    const middleware = {
      wrapExecute: async ({ doExecute }) => {
        attempts++
        if (attempts < 3) {
          throw new Error('Transient failure')
        }
        return doExecute()
      }
    }
    
    // Verify retry happened
    expect(attempts).toBe(3)
  })
  
  test('handles CLI timeout gracefully', async () => {
    const result = await executeClaudeCLI({
      prompt: 'Do something slow',
      timeout: 100, // Very short
    })
    
    expect(result.stopReason).toBe('timeout')
  })
})
```

### 4. VCS Integration

```typescript
// test/e2e/vcs-integration.test.ts

describe('VCS Integration E2E', () => {
  test('Git commit after step', async () => {
    // Create temp git repo
    // Run orchestration with commitAfter
    // Verify commit was created
  })
  
  test('JJ snapshot before/after step', async () => {
    // Create temp jj repo
    // Run orchestration with snapshotBefore/After
    // Verify snapshots exist
  })
})
```

## Test Structure

```
test/
├── e2e/
│   ├── setup.ts                 # E2E test utilities
│   ├── agent-execution.test.ts  # Real CLI tests
│   ├── workflow-complete.test.ts # Full workflow
│   ├── error-recovery.test.ts   # Error scenarios
│   └── vcs-integration.test.ts  # Git/JJ tests
├── integration.test.ts          # Existing
└── orchestration-semantics.test.tsx
```

## CI Configuration

```yaml
# Run E2E tests separately with API keys
e2e-tests:
  runs-on: ubuntu-latest
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
  steps:
    - run: bun test test/e2e/
```

## Acceptance Criteria

- [x] At least 5 real E2E tests (no mocks) - 7 tests in e2e.test.ts
- [x] Tests skip gracefully without API key
- [ ] Full workflow test passes
- [x] Error recovery tested - timeout and empty prompt
- [ ] CI runs E2E tests (with secrets)
