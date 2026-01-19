# Type Safety Issue: Unsafe type assertions for stop condition values

## Files & Lines

- `src/components/SmithersProvider.tsx:448` - `condition.value as number`
- `src/components/SmithersProvider.tsx:453` - `condition.value as number`
- `src/components/SmithersProvider.tsx:458` - `condition.value as number`

## Issue

The `GlobalStopCondition.value` is typed as `number | string | undefined`, but these lines cast directly to `number` without validation. If `value` is a string or undefined, runtime errors or incorrect comparisons will occur.

## Suggested Fix

Add type guards or validation:

```typescript
case 'total_tokens':
  if (typeof condition.value === 'number') {
    shouldStop = context.totalTokens >= condition.value
    message = message || `Token limit ${condition.value} exceeded`
  }
  break

case 'total_agents':
  if (typeof condition.value === 'number') {
    shouldStop = context.totalAgents >= condition.value
    message = message || `Agent limit ${condition.value} exceeded`
  }
  break

case 'total_time':
  if (typeof condition.value === 'number') {
    shouldStop = context.elapsedTimeMs >= condition.value
    message = message || `Time limit ${condition.value}ms exceeded`
  }
  break
```

Or refine the `GlobalStopCondition` type to be a discriminated union:

```typescript
export type GlobalStopCondition = 
  | { type: 'total_tokens'; value: number; message?: string }
  | { type: 'total_agents'; value: number; message?: string }
  | { type: 'total_time'; value: number; message?: string }
  | { type: 'report_severity'; message?: string }
  | { type: 'ci_failure'; message?: string }
  | { type: 'custom'; fn: (context: OrchestrationContext) => boolean | Promise<boolean>; message?: string }
```
