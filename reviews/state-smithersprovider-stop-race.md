# State Issue: Stale Closure in SmithersProvider Timeout

## Location
- **File:** `src/components/SmithersProvider.tsx`
- **Lines:** 410-420

## Issue
The global timeout callback captures `stopRequested` in closure, but uses it asynchronously:

```typescript
if (props.globalTimeout) {
  timeoutIdRef.current = setTimeout(() => {
    if (!stopRequested) {  // ⚠️ Stale closure - always reads initial value
      const message = `Global timeout of ${props.globalTimeout}ms exceeded`
      props.db.state.set('stop_requested', {
        reason: message,
        timestamp: Date.now(),
        executionId: props.executionId,
      })
      props.onStopRequested?.(message)
    }
  }, props.globalTimeout)
}
```

## Problem
- `stopRequested` is captured at mount time (always `false` initially)
- Even if stop is requested before timeout fires, the callback sees stale `false`
- Could set stop_requested twice or after already stopped

## Suggested Fix

Read directly from DB inside the callback:

```typescript
if (props.globalTimeout) {
  timeoutIdRef.current = setTimeout(() => {
    // Query fresh from DB instead of stale closure
    const current = props.db.state.get<{ reason: string }>('stop_requested')
    if (!current) {
      const message = `Global timeout of ${props.globalTimeout}ms exceeded`
      props.db.state.set('stop_requested', {
        reason: message,
        timestamp: Date.now(),
        executionId: props.executionId,
      })
      props.onStopRequested?.(message)
    }
  }, props.globalTimeout)
}
```

## Also Applies To
- Lines 425-427: `checkIntervalIdRef.current = setInterval(async () => { if (stopRequested) ... })`
  - Same stale closure issue

## Severity
Medium - Could cause double-stop or incorrect behavior when stop is requested externally.
