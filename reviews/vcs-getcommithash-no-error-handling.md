# getCommitHash Missing Error Handling

## File
`src/utils/vcs/git.ts` L28-31

## Issue
No try/catch. If ref doesn't exist, throws raw Bun.$ error instead of helpful message.

```typescript
export async function getCommitHash(ref: string = 'HEAD'): Promise<string> {
  const result = await Bun.$`git rev-parse ${ref}`.text()  // Can throw
  return result.trim()
}
```

## Suggested Fix

```typescript
export async function getCommitHash(ref: string = 'HEAD'): Promise<string> {
  try {
    const result = await Bun.$`git rev-parse ${ref}`.text()
    return result.trim()
  } catch (error: any) {
    throw new Error(`Failed to resolve ref '${ref}': ${error.stderr?.toString() || error.message}`)
  }
}
```
