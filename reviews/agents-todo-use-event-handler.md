# TODO: Replace useEffect with Event Handler

## File
[src/components/Claude.tsx](file:///Users/williamcory/smithers/src/components/Claude.tsx#L80-L81)

## Issue
Line 80: `// TODO: should be handled by an event handler not a useEffect`

The execution logic is triggered via `useEffectOnValueChange` which is a side-effect pattern. This makes the code harder to test and reason about.

## Current Pattern
```typescript
useEffectOnValueChange(executionKey, () => {
  if (!shouldExecute) return
  ;(async () => {
    // 200+ lines of execution logic
  })()
})
```

## Suggested Fix
Refactor to use an event-driven pattern with explicit triggers:
```typescript
// Option 1: Use a callback passed to a controller hook
const { triggerExecution } = useAgentController({
  onExecute: async (options) => {
    // execution logic
  }
})

// Option 2: Extract to a separate executor function
const executeAgent = useCallback(async () => {
  // execution logic
}, [deps])

// Trigger explicitly when conditions change
useMount(() => {
  if (shouldExecute) executeAgent()
})
```

This also enables easier testing by allowing direct invocation of the executor.
