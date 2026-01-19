# Missing Feature: Stop Request Check in Smithers.tsx

## File
[src/components/Smithers.tsx](file:///Users/williamcory/smithers/src/components/Smithers.tsx#L185-L222)

## Issue
Unlike `Claude.tsx` which checks `isStopRequested()` before execution, `Smithers.tsx` does not check for stop requests.

## Claude.tsx (correct)
```typescript
// L86-89
if (isStopRequested()) {
  db.tasks.complete(taskIdRef.current)
  return
}
```

## Smithers.tsx (missing)
```typescript
// L185 onwards - no stop check
;(async () => {
  taskIdRef.current = db.tasks.start('smithers', props.plannerModel ?? 'sonnet')
  // Should check isStopRequested() here
```

## Impact
When a stop is requested, Smithers subagent will continue to execute the full planning and script execution, potentially running for several minutes after stop was requested.

## Suggested Fix
```typescript
;(async () => {
  taskIdRef.current = db.tasks.start('smithers', props.plannerModel ?? 'sonnet')

  if (isStopRequested()) {
    db.tasks.complete(taskIdRef.current)
    return
  }
  // rest of execution...
```

Note: Need to destructure `isStopRequested` from `useSmithers()` first (L125).
