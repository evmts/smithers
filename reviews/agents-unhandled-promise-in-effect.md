# Bug: Unhandled Promise Rejection in useEffect

## Files
- [src/components/Claude.tsx](file:///Users/williamcory/smithers/src/components/Claude.tsx#L83-L294)
- [src/components/Smithers.tsx](file:///Users/williamcory/smithers/src/components/Smithers.tsx#L185-L284)

## Issue
The async IIFE inside `useEffectOnValueChange` doesn't have a top-level `.catch()`. If an uncaught error occurs outside the try/catch block, it becomes an unhandled promise rejection.

## Problematic Pattern
```typescript
useEffectOnValueChange(executionKey, () => {
  if (!shouldExecute) return
  ;(async () => {
    // If any error escapes the try/catch, it's unhandled
    taskIdRef.current = db.tasks.start(...) // could throw
    try {
      // ...
    } catch (err) {
      // ...
    } finally {
      // finally block errors are also unhandled
      await logWriter.flushStream(logFilename) // could throw
    }
  })()  // <-- no .catch()
})
```

## Bug Scenario
1. `db.tasks.start()` throws before entering try block
2. OR `logWriter.flushStream()` throws in finally block
3. Promise rejects with no handler
4. Node logs unhandled rejection, component state becomes inconsistent

## Suggested Fix
```typescript
useEffectOnValueChange(executionKey, () => {
  if (!shouldExecute) return
  ;(async () => {
    try {
      taskIdRef.current = db.tasks.start(...)
      // ...
    } catch (err) {
      // handle all errors
    } finally {
      try {
        await logWriter.flushStream(logFilename)
      } catch {
        // ignore cleanup errors
      }
      if (taskIdRef.current) {
        db.tasks.complete(taskIdRef.current)
      }
    }
  })().catch(err => {
    console.error('Agent execution failed:', err)
    props.onError?.(err instanceof Error ? err : new Error(String(err)))
  })
})
```
