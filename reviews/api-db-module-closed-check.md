# API Inconsistency: Database Closed State Handling

## Files Involved
- `src/db/steps.ts` - checks `rdb.isClosed` in some methods
- `src/db/phases.ts` - does NOT check `rdb.isClosed`
- `src/db/agents.ts` - checks `rdb.isClosed` in some methods
- `src/db/tasks.ts` - checks `rdb.isClosed` in all methods
- `src/db/execution.ts` - does NOT check `rdb.isClosed`

## Inconsistency Description

Some DB modules check `rdb.isClosed` before operations, others don't:

### With isClosed checks (steps.ts):
```typescript
start: (name?: string): string => {
  if (rdb.isClosed) {
    return uuid()  // Returns dummy ID
  }
  // ... actual implementation
}

complete: (id: string, ...) => {
  if (rdb.isClosed) return  // Silent no-op
  // ...
}
```

### Without isClosed checks (phases.ts):
```typescript
start: (name: string, iteration: number = 0): string => {
  const currentExecutionId = getCurrentExecutionId()
  if (!currentExecutionId) throw new Error('No active execution')
  // No isClosed check - will throw if DB closed
}
```

### Inconsistent within same module (agents.ts):
```typescript
start: (...) => {
  if (rdb.isClosed) { return uuid() }  // Has check
  // ...
}

// But execution.ts never checks
```

## Suggested Standardization

1. **All write operations** should check `isClosed` and return early:
```typescript
complete: (id: string) => {
  if (rdb.isClosed) return
  // ...
}
```

2. **All read operations** should check and return safe default:
```typescript
current: (): Phase | null => {
  if (rdb.isClosed) return null
  // ...
}

list: (): Phase[] => {
  if (rdb.isClosed) return []
  // ...
}
```

3. **Start operations** returning IDs should return dummy UUID:
```typescript
start: (...): string => {
  if (rdb.isClosed) return uuid()
  // ...
}
```

Apply uniformly to: `execution.ts`, `phases.ts`, `steps.ts`, `agents.ts`, `tasks.ts`, `tools.ts`, `human.ts`, `vcs.ts`, `artifacts.ts`
