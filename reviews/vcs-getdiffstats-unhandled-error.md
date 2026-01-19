# getDiffStats Missing Error Handling

## File
`src/utils/vcs/git.ts` L51-71

## Issue
`getDiffStats` has no try/catch. Fails silently with unhelpful error if:
- Repo has no commits (`HEAD~1` fails)
- Invalid ref provided

```typescript
export async function getDiffStats(ref?: string): Promise<DiffStats> {
  const args = ref ? `${ref}...HEAD` : 'HEAD~1'
  const result = await Bun.$`git diff --numstat ${args}`.text()  // Can throw
  // ...
}
```

## Suggested Fix

```typescript
export async function getDiffStats(ref?: string): Promise<DiffStats> {
  const args = ref ? `${ref}...HEAD` : 'HEAD~1'
  
  try {
    const result = await Bun.$`git diff --numstat ${args}`.text()
    // ... rest of parsing
  } catch (error: any) {
    throw new Error(`Failed to get diff stats for ${args}: ${error.stderr?.toString() || error.message}`)
  }
}
```
