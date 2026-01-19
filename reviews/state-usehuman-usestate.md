# State Issue: useState in useHuman.ts

## Location
- **File:** `src/hooks/useHuman.ts`
- **Lines:** 47

## Issue
Uses `useState` for `requestId` state in orchestration code. Per CLAUDE.md, orchestration state should use SQLite + useQueryValue.

```typescript
const [requestId, setRequestId] = useState<string | null>(null)
```

## Problem
- State is lost on component remount/restart
- Not persisted across sessions
- Inconsistent with the SQLite-backed state pattern used elsewhere

## Suggested Fix

Store requestId in `db.state` and use `useQueryValue`:

```typescript
export function useHuman(): UseHumanResult {
  const { db, reactiveDb } = useSmithers()
  const hookId = useRef(crypto.randomUUID()).current
  const stateKey = `human:${hookId}:requestId`
  
  // Read requestId from SQLite reactively
  const { data: requestId } = useQueryValue<string>(
    reactiveDb,
    "SELECT value FROM state WHERE key = ?",
    [stateKey]
  )

  // Track the promise resolver so we can call it when DB updates
  const resolveRef = useRef<((value: any) => void) | null>(null)

  const ask = useCallback(async <T = any>(prompt: string, options?: AskOptions) => {
    return new Promise<T>((resolve) => {
      resolveRef.current = resolve as (value: any) => void
      
      const id = db.human.request(
        options?.options ? 'select' : 'confirmation',
        prompt,
        options?.options
      )
      
      // Store in SQLite instead of useState
      db.state.set(stateKey, id, 'human_request_created')
    })
  }, [db, stateKey])
  
  // ... rest unchanged
}
```

## Severity
Medium - Affects persistence and resumability of human interactions.
