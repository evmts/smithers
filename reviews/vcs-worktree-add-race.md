# addWorktree Race Condition with Branch Creation

## File
`src/utils/vcs/git.ts` L190-220

## Issue
No atomicity check. If two processes call `addWorktree` with same branch + `createBranch: true`, one will fail with confusing error. Should check `branchExists` first.

Also, the args building has subtle bug: when `createBranch=true` without `base`, it pushes `-b branch worktreePath` but no target ref, which works but is implicit about using HEAD.

## Suggested Fix

```typescript
export async function addWorktree(
  worktreePath: string,
  branch: string,
  options?: {
    base?: string
    createBranch?: boolean
    cwd?: string
  }
): Promise<void> {
  // Pre-check to give better error message
  if (options?.createBranch) {
    const exists = await branchExists(branch, options.cwd)
    if (exists) {
      throw new Error(`Branch '${branch}' already exists. Cannot create worktree with -b flag.`)
    }
  }
  
  const args: string[] = []

  if (options?.cwd) {
    args.push('-C', options.cwd)
  }

  args.push('worktree', 'add')

  if (options?.createBranch) {
    args.push('-b', branch, worktreePath, options.base ?? 'HEAD')
  } else {
    args.push(worktreePath, branch)
  }

  await Bun.$`git ${args}`.quiet()
}
```
