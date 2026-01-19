# Review: Step.tsx - Swallowed Error in useEffectOnValueChange

## File
[src/components/Step.tsx](file:///Users/williamcory/smithers/src/components/Step.tsx#L220-L259)

## Issue Description
When the step activation async block catches an error (line 247), it logs and calls `db.steps.fail()` and `db.tasks.complete()`, but the error is not propagated or exposed to the component's error state. The component doesn't have an error status to reflect this.

```tsx
} catch (error) {
  console.error(`[Step] Error starting step:`, error)

  if (stepIdRef.current) {
    db.steps.fail(stepIdRef.current)
  }

  if (taskIdRef.current) {
    db.tasks.complete(taskIdRef.current)
  }
  // Error is swallowed here - no props.onError callback or error state update
}
```

## Suggested Fix
Add error callback prop and error state:

```tsx
export interface StepProps {
  // ... existing props
  onError?: (error: Error) => void
}

// In the catch block:
} catch (error) {
  const errorObj = error instanceof Error ? error : new Error(String(error))
  console.error(`[Step] Error starting step:`, errorObj)
  
  if (stepIdRef.current) {
    db.steps.fail(stepIdRef.current)
  }
  if (taskIdRef.current) {
    db.tasks.complete(taskIdRef.current)
  }
  
  props.onError?.(errorObj)
}
```
