# ISSUE-004: Add Boundary Condition Tests

**Priority:** MEDIUM  
**Effort:** M (4-8 hours)  
**Category:** Test Coverage

## Problem

Many edge cases and boundary conditions are not tested. These are often where bugs hide.

## Required Boundary Tests

### 1. Agent Hooks

```typescript
describe('useClaude boundary conditions', () => {
  test('maxRetries=0 fails immediately on error')
  test('maxRetries=100 eventually succeeds or exhausts')
  test('maxTurns=1 limits to single turn')
  test('maxTurns=0 is handled gracefully')
  test('timeout=1 triggers immediate timeout')
  test('timeout=0 means no timeout')
  test('empty string prompt executes')
  test('100KB prompt handles correctly')
  test('prompt with only whitespace')
  test('prompt with unicode/emoji')
  test('prompt with null bytes')
})
```

### 2. Phase/Step

```typescript
describe('Phase boundary conditions', () => {
  test('empty phase (no children) completes')
  test('phase with 100 steps handles correctly')
  test('deeply nested phases (10 levels)')
  test('phase name with special characters')
  test('phase name empty string')
  test('skipIf returns truthy non-boolean')
  test('skipIf returns Promise')
})

describe('Step boundary conditions', () => {
  test('empty step (no children) completes')
  test('step with 50 parallel tasks')
  test('step name undefined')
  test('step with async children that never resolve')
})
```

### 3. Ralph/While Loop

```typescript
describe('Ralph boundary conditions', () => {
  test('maxIterations=0 never runs')
  test('maxIterations=1 runs exactly once')
  test('maxIterations=1000 handles correctly')
  test('condition always returns false - runs 0 times')
  test('condition always returns true - hits max')
  test('condition flips after N iterations')
  test('condition throws error')
  test('condition returns Promise<boolean>')
})
```

### 4. Database

```typescript
describe('DB boundary conditions', () => {
  test('state.set with MAX_SAFE_INTEGER')
  test('state.set with negative numbers')
  test('state.set with empty string key')
  test('state.set with 1MB value')
  test('state.set with deeply nested object (100 levels)')
  test('state.set with circular reference throws')
  test('state.set with undefined value')
  test('state.set with null value')
  
  test('agents.start with empty prompt')
  test('agents.start with 100KB prompt')
  test('agents.complete with null result')
  
  test('query with no results returns empty array')
  test('query with 10000 results handles correctly')
})
```

### 5. Middleware

```typescript
describe('Middleware boundary conditions', () => {
  test('empty middleware array')
  test('single middleware')
  test('20 middleware in chain')
  test('middleware that returns undefined')
  test('middleware that modifies options in place')
  test('async middleware chain')
  
  test('retry with baseDelayMs=0')
  test('retry with exponential backoff overflow')
  test('retry with jitter at max value')
})
```

### 6. Streaming/Parsing

```typescript
describe('Stream parsing boundary conditions', () => {
  test('empty stream')
  test('single character chunks')
  test('1MB single chunk')
  test('chunk ends mid-JSON')
  test('chunk ends mid-unicode character')
  test('malformed JSON recovery')
  test('nested JSON 50 levels deep')
  test('JSON with all escaped characters')
})
```

### 7. SmithersProvider

```typescript
describe('SmithersProvider boundary conditions', () => {
  test('executionId empty string')
  test('executionId with special characters')
  test('globalTimeout=0')
  test('globalTimeout=1 (immediate)')
  test('maxIterations=0')
  test('stopConditions empty array')
  test('10 stopConditions')
  test('nested SmithersProviders')
})
```

## Acceptance Criteria

- [ ] Each module has boundary condition tests
- [ ] Edge cases for numbers (0, 1, MAX, negative)
- [ ] Edge cases for strings (empty, unicode, very long)
- [ ] Edge cases for arrays (empty, single, many)
- [ ] Edge cases for async (immediate, never resolving)
