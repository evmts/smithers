# Review: Git/Commit.tsx - Missing Error Handling on JSON.parse

## File
[src/components/Git/Commit.tsx](file:///Users/williamcory/smithers/src/components/Git/Commit.tsx#L76-L78)

## Issue Description
`JSON.parse` is called without try-catch on database state:

```tsx
const { status, result, error }: CommitState = opState
  ? JSON.parse(opState)
  : { status: 'pending', result: null, error: null }
```

## Suggested Fix
Add try-catch wrapper:

```tsx
const defaultState = { status: 'pending' as const, result: null, error: null }
const { status, result, error }: CommitState = (() => {
  if (!opState) return defaultState
  try {
    return JSON.parse(opState)
  } catch {
    console.warn('[Commit] Failed to parse operation state')
    return defaultState
  }
})()
```

**Note:** Same issue exists in [Git/Notes.tsx](file:///Users/williamcory/smithers/src/components/Git/Notes.tsx#L46-L49).
