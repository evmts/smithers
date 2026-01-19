# Bug: Substatus Race Condition in Smithers.tsx

## File
[src/components/Smithers.tsx](file:///Users/williamcory/smithers/src/components/Smithers.tsx#L201-L208)

## Issue
Substatus is set to 'planning' immediately after agent start, but `executeSmithers` is called which does its own planning internally. The substatus never actually reflects the real planning phase.

## Code Flow
```typescript
// L201: Set 'planning' substatus
setSubstatus(agentId, 'planning')
// ...
// L207-208: Immediately set to 'executing' before executeSmithers
if (subagentIdRef.current) {
  setSubstatus(subagentIdRef.current, 'executing')
}
const smithersResult = await executeSmithers({...})
```

## Problem
1. `setSubstatus(id, 'planning')` at L201
2. A few lines later, before `executeSmithers` does anything, `setSubstatus(id, 'executing')` at L208
3. The 'planning' status is visible for ~milliseconds
4. Real planning happens INSIDE `executeSmithers.generateSmithersScript()` but substatus is already 'executing'

## Suggested Fix
Pass an `onPlanningComplete` callback to `executeSmithers`:
```typescript
const smithersResult = await executeSmithers({
  // ...
  onPlanningStart: () => {
    if (subagentIdRef.current) setSubstatus(subagentIdRef.current, 'planning')
  },
  onExecutionStart: () => {
    if (subagentIdRef.current) setSubstatus(subagentIdRef.current, 'executing')
  },
})
```
