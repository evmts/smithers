# getCommitInfo Missing Error Handling

## File
`src/utils/vcs/git.ts` L36-46

## Issue
`getCommitInfo` makes 3 sequential shell calls without try/catch. If any fail (e.g., invalid ref), error message is unhelpful compared to other functions that wrap errors.

```typescript
export async function getCommitInfo(ref: string = 'HEAD'): Promise<CommitInfo> {
  const hash = await Bun.$`git rev-parse ${ref}`.text()  // Can throw
  const author = await Bun.$`git log -1 --format=%an ${ref}`.text()  // Can throw
  const message = await Bun.$`git log -1 --format=%s ${ref}`.text()  // Can throw
  // ...
}
```

Compare to `git()` function which wraps errors with context.

## Suggested Fix

```typescript
export async function getCommitInfo(ref: string = 'HEAD'): Promise<CommitInfo> {
  try {
    const hash = await Bun.$`git rev-parse ${ref}`.text()
    const author = await Bun.$`git log -1 --format=%an ${ref}`.text()
    const message = await Bun.$`git log -1 --format=%s ${ref}`.text()

    return {
      hash: hash.trim(),
      author: author.trim(),
      message: message.trim(),
    }
  } catch (error: any) {
    throw new Error(`Failed to get commit info for ${ref}: ${error.stderr?.toString() || error.message}`)
  }
}
```
