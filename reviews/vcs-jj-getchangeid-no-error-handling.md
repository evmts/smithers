# getJJChangeId Missing Error Handling

## File
`src/utils/vcs/jj.ts` L25-28

## Issue
No try/catch. If ref doesn't exist or jj isn't initialized, throws raw error.

```typescript
export async function getJJChangeId(ref: string = '@'): Promise<string> {
  const result = await Bun.$`jj log -r ${ref} --no-graph -T change_id`.text()  // Can throw
  return result.trim()
}
```

## Suggested Fix

```typescript
export async function getJJChangeId(ref: string = '@'): Promise<string> {
  try {
    const result = await Bun.$`jj log -r ${ref} --no-graph -T change_id`.text()
    return result.trim()
  } catch (error: any) {
    throw new Error(`Failed to get JJ change ID for '${ref}': ${error.stderr?.toString() || error.message}`)
  }
}
```
