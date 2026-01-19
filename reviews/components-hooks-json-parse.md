# Review: Hooks - Missing Error Handling on JSON.parse

## Files
- [src/components/Hooks/OnCIFailure.tsx](file:///Users/williamcory/smithers/src/components/Hooks/OnCIFailure.tsx#L131-L133)
- [src/components/Hooks/PostCommit.tsx](file:///Users/williamcory/smithers/src/components/Hooks/PostCommit.tsx#L94-L96)

## Issue Description
Both hook components parse JSON from database state without error handling:

**OnCIFailure.tsx:132**
```tsx
const state: CIFailureState = stateJson ? JSON.parse(stateJson) : DEFAULT_CI_STATE
```

**PostCommit.tsx:95**
```tsx
const state: PostCommitState = stateJson ? JSON.parse(stateJson) : DEFAULT_STATE
```

If the database contains corrupted state JSON, these will crash.

## Suggested Fix
Create a shared helper and use it:

```tsx
function safeParseState<T>(json: string | null | undefined, defaultValue: T): T {
  if (!json) return defaultValue
  try {
    return JSON.parse(json)
  } catch {
    console.warn('[Hook] Failed to parse state JSON, using default')
    return defaultValue
  }
}

// Usage:
const state = safeParseState(stateJson, DEFAULT_CI_STATE)
```
