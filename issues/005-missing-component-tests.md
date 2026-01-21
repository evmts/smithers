# ISSUE-005: Add Missing Component Tests

**Priority:** MEDIUM  
**Effort:** M (4-8 hours)  
**Category:** Test Coverage

## Problem

14 components have no tests:

| Component | Purpose | Priority |
|-----------|---------|----------|
| `ExecutionScope.tsx` | Execution gating | HIGH |
| `WorktreeProvider.tsx` | Worktree context | MEDIUM |
| `Codex.tsx` | Codex agent | MEDIUM |
| `ClaudeApi.tsx` | Claude API agent | MEDIUM |
| `Subagent.tsx` | Subagent spawning | MEDIUM |
| `Task.tsx` | Task wrapper | MEDIUM |
| `Each.tsx` | Iterator | LOW |
| `If.tsx` | Conditional | LOW |
| `Stop.tsx` | Stop signal | LOW |
| `Persona.tsx` | System prompt | LOW |
| `Constraints.tsx` | Constraints | LOW |
| `PhaseContext.tsx` | Phase context | LOW |
| `StepContext.tsx` | Step context | LOW |
| `ExecutionContext.tsx` | Execution context | LOW |

## Required Tests

### ExecutionScope.tsx (HIGH)

```typescript
describe('ExecutionScope', () => {
  test('provides enabled=true by default')
  test('provides enabled=false when disabled')
  test('provides scopeId')
  test('child scope inherits parent scopeId')
  test('useExecutionScope returns context')
  test('useExecutionEffect runs when enabled')
  test('useExecutionEffect skips when disabled')
})
```

### WorktreeProvider.tsx (MEDIUM)

```typescript
describe('WorktreeProvider', () => {
  test('provides worktree context to children')
  test('useWorktree returns null outside provider')
  test('cwd is accessible')
  test('branch is accessible')
  test('isWorktree flag is set')
})
```

### Codex.tsx (MEDIUM)

```typescript
describe('Codex', () => {
  test('renders with default props')
  test('renders with model prop')
  test('renders status attribute')
  test('renders children as prompt')
  test('renders tail log messages')
  test('calls onFinished on completion')
  test('calls onError on failure')
})
```

### ClaudeApi.tsx (MEDIUM)

```typescript
describe('ClaudeApi', () => {
  test('renders with API mode')
  test('uses Anthropic SDK directly')
  test('handles streaming response')
  test('handles non-streaming response')
})
```

### Subagent.tsx (MEDIUM)

```typescript
describe('Subagent', () => {
  test('spawns child orchestration')
  test('passes props to child')
  test('waits for child completion')
  test('handles child error')
})
```

### Task.tsx (MEDIUM)

```typescript
describe('Task', () => {
  test('wraps children in task context')
  test('registers task with db.tasks')
  test('completes task on unmount')
  test('fails task on error')
})
```

### Each.tsx (LOW)

```typescript
describe('Each', () => {
  test('renders nothing for empty array')
  test('renders child for each item')
  test('passes item and index to render')
  test('handles async items')
})
```

### If.tsx (LOW)

```typescript
describe('If', () => {
  test('renders children when condition true')
  test('renders nothing when condition false')
  test('renders else when condition false')
  test('handles async condition')
})
```

### Stop.tsx (LOW)

```typescript
describe('Stop', () => {
  test('signals stop to SmithersProvider')
  test('includes reason in stop signal')
  test('renders stop element in XML')
})
```

## Acceptance Criteria

- [ ] All 14 components have basic tests
- [ ] HIGH priority components have comprehensive tests
- [ ] Error cases covered for each component
- [ ] Integration with SmithersProvider tested
