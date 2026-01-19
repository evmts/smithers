# JJ Commit Returns Wrong Change ID

## File
`src/utils/vcs/jj.ts` L50-59

## Issue
After `jj commit`, `@` points to the NEW empty working copy, not the commit that was just created. The function returns the wrong `changeId`.

```typescript
export async function jjCommit(message: string): Promise<JJCommitResult> {
  await Bun.$`jj commit -m ${message}`.quiet()
  
  // BUG: @ is now the NEW working copy, not the committed change
  const commitHash = await Bun.$`jj log -r @ --no-graph -T commit_id`.text()
  const changeId = await getJJChangeId('@')
  
  return { commitHash, changeId }
}
```

## Suggested Fix
Use `@-` to reference the parent (the commit just created):

```typescript
export async function jjCommit(message: string): Promise<JJCommitResult> {
  await Bun.$`jj commit -m ${message}`.quiet()
  
  // @- is the commit we just created (parent of new working copy)
  const commitHash = await Bun.$`jj log -r @- --no-graph -T commit_id`.text().then(s => s.trim())
  const changeId = await getJJChangeId('@-')
  
  return { commitHash, changeId }
}
```
