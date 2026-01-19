# Review: SmithersProvider.tsx - Stale Closure in Timeout Handler

## File
[src/components/SmithersProvider.tsx](file:///Users/williamcory/smithers/src/components/SmithersProvider.tsx#L409-L420)

## Issue Description
The global timeout handler captures `stopRequested` from the closure at mount time, not the current value:

```tsx
if (props.globalTimeout) {
  timeoutIdRef.current = setTimeout(() => {
    if (!stopRequested) {  // <-- This is the value at mount time, not current
      const message = `Global timeout of ${props.globalTimeout}ms exceeded`
      props.db.state.set('stop_requested', { ... })
      props.onStopRequested?.(message)
    }
  }, props.globalTimeout)
}
```

Since `stopRequested` comes from a reactive query, the value inside the timeout callback will always be the initial value (`undefined` or `false`), not the current value when the timeout fires.

## Suggested Fix
Check the database directly inside the timeout:

```tsx
if (props.globalTimeout) {
  timeoutIdRef.current = setTimeout(() => {
    const currentStopRequested = props.db.state.get('stop_requested')
    if (!currentStopRequested) {
      const message = `Global timeout of ${props.globalTimeout}ms exceeded`
      props.db.state.set('stop_requested', { ... })
      props.onStopRequested?.(message)
    }
  }, props.globalTimeout)
}
```
