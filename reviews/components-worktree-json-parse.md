# Review: Worktree.tsx - Missing Error Handling on JSON.parse

## File
[src/components/Worktree.tsx](file:///Users/williamcory/smithers/src/components/Worktree.tsx#L36-L38)

## Issue Description
`JSON.parse` is called without try-catch on database data:

```tsx
const state: WorktreeState = storedState
  ? JSON.parse(storedState)
  : { status: 'pending', path: null, error: null }
```

If the database contains malformed JSON, this will crash the component.

## Suggested Fix
Add try-catch wrapper:

```tsx
const state: WorktreeState = (() => {
  const defaultState = { status: 'pending' as const, path: null, error: null }
  if (!storedState) return defaultState
  try {
    return JSON.parse(storedState)
  } catch {
    console.warn('[Worktree] Failed to parse stored state')
    return defaultState
  }
})()
```
