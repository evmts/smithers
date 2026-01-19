# State Issue: Race Condition in Step.tsx Completion Detection

## Location
- **File:** `src/components/Step.tsx`
- **Lines:** 325-337

## Issue
Uses a 100ms timeout to "ensure child tasks have registered" before completing:

```typescript
useEffect(() => {
  if (!hasStartedRef.current || hasCompletedRef.current || childRunningTaskCount !== 0) {
    return
  }
  // Small delay to ensure child tasks have actually registered
  // This prevents completing before children even start
  const timeoutId = setTimeout(() => {
    if (hasStartedRef.current && !hasCompletedRef.current) {
      completeStep()
    }
  }, 100)
  return () => clearTimeout(timeoutId)
}, [childRunningTaskCount, completeStep])
```

## Problem
- **Race condition:** 100ms may not be enough on slow systems or with many parallel tasks
- **Arbitrary delay:** Magic number with no guarantee of correctness
- **False positives:** Could complete before children actually start if they take >100ms to mount

## Suggested Fix

Use a more robust approach - track step lifecycle explicitly:

```typescript
// In Step.tsx, add explicit child registration tracking

// 1. Add a state key for "children started"
const childrenStartedKey = `step:${stepIdRef.current}:children_started`

// 2. Query it reactively
const { data: childrenStarted } = useQueryValue<boolean>(
  reactiveDb,
  "SELECT value FROM state WHERE key = ?",
  [childrenStartedKey]
)

// 3. Children signal when they start via StepContext
// Add to StepContext: signalChildStarted: () => void

// 4. Complete only when:
//    - childrenStarted is true (at least one child registered)
//    - childRunningTaskCount is 0 (all children done)
useEffect(() => {
  if (!hasStartedRef.current || hasCompletedRef.current) return
  if (!childrenStarted || childRunningTaskCount !== 0) return
  
  completeStep()
}, [childrenStarted, childRunningTaskCount, completeStep])
```

Alternative: Use a counter for expected vs completed children.

## Severity
Medium - Could cause premature step completion in edge cases.
