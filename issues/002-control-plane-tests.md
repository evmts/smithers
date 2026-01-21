# ISSUE-002: Add Tests for Control Plane

**Priority:** HIGH  
**Effort:** M (4-8 hours)  
**Category:** Test Coverage

## Problem

The entire `src/control-plane/` directory has **zero tests**:

| File | Purpose | Tests |
|------|---------|-------|
| `discover.ts` | Find .smithers files | ❌ None |
| `runner.ts` | Execute orchestrations | ❌ None |
| `glob.ts` | File pattern matching | ❌ None |
| `grep.ts` | Content search | ❌ None |
| `status.ts` | Status tracking | ❌ None |

This is the CLI entry point for running orchestrations.

## Required Tests

### 1. discover.ts

```typescript
describe('discover', () => {
  test('finds .smithers directory in cwd')
  test('finds .smithers directory in parent')
  test('returns null when no .smithers found')
  test('finds main.tsx in .smithers')
  test('handles symlinks correctly')
  test('respects max depth limit')
})
```

### 2. runner.ts

```typescript
describe('runner', () => {
  // Execution
  test('executes TypeScript orchestration file')
  test('passes environment variables')
  test('captures stdout/stderr')
  test('returns exit code')
  
  // Error handling
  test('handles file not found')
  test('handles syntax error in orchestration')
  test('handles runtime error in orchestration')
  test('handles timeout')
  
  // Integration
  test('creates database for execution')
  test('resumes incomplete execution')
})
```

### 3. glob.ts

```typescript
describe('glob', () => {
  test('matches *.tsx files')
  test('matches **/*.tsx recursively')
  test('excludes node_modules by default')
  test('handles no matches gracefully')
  test('handles permission denied')
})
```

### 4. grep.ts

```typescript
describe('grep', () => {
  test('finds pattern in file')
  test('returns line numbers')
  test('handles regex patterns')
  test('handles binary files gracefully')
  test('respects max results limit')
})
```

### 5. status.ts

```typescript
describe('status', () => {
  test('reads execution status from DB')
  test('returns pending/running/completed/failed')
  test('includes agent count')
  test('includes token usage')
})
```

## E2E Tests

```typescript
// test/control-plane/runner.e2e.test.ts

describe('control-plane E2E', () => {
  test('runs hello-world.tsx end-to-end', async () => {
    // Create temp directory with .smithers/main.tsx
    // Run via runner
    // Verify execution completed
    // Verify DB has execution record
  })
  
  test('handles orchestration that throws', async () => {
    // Create orchestration that throws
    // Verify error captured
    // Verify exit code non-zero
  })
})
```

## Acceptance Criteria

- [ ] All control-plane files have unit tests
- [ ] E2E test for full orchestration run
- [ ] Error cases covered
- [ ] Line coverage > 90%
