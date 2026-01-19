# API Inconsistency: VCS Function Error Return Patterns

## Files Involved
- `src/utils/vcs/git.ts`
- `src/utils/vcs/jj.ts`

## Inconsistency Description

VCS functions have inconsistent approaches for handling failure states:

### Pattern 1: Throw on error
```typescript
// git.ts:13
export async function git(...args: string[]): Promise<CommandResult> {
  try {
    const result = await Bun.$`git ${args}`.quiet()
    return { stdout, stderr }
  } catch (error: any) {
    throw new Error(`git ${args.join(' ')} failed: ${error.stderr?.toString() || error.message}`)
  }
}
```

### Pattern 2: Return null on error
```typescript
// git.ts:102
export async function getGitNotes(ref: string = 'HEAD'): Promise<string | null> {
  try {
    const result = await Bun.$`git notes --ref ${SMITHERS_NOTES_REF} show ${ref}`.text()
    return result.trim()
  } catch {
    return null  // Silent failure
  }
}

// git.ts:134
export async function getCurrentBranch(): Promise<string | null> {
  try {
    const result = await Bun.$`git branch --show-current`.text()
    return result.trim() || null
  } catch {
    return null
  }
}
```

### Pattern 3: Return boolean on error
```typescript
// git.ts:122
export async function isGitRepo(): Promise<boolean> {
  try {
    await Bun.$`git rev-parse --git-dir`.quiet()
    return true
  } catch {
    return false
  }
}
```

### Pattern 4: Throw with context (jj.ts)
```typescript
// jj.ts:17
} catch (error: any) {
  throw new Error(`jj ${args.join(' ')} failed: ${error.stderr?.toString() || error.message}`)
}
```

## Suggested Standardization

Define semantic categories:

1. **Query functions** (existence checks) → return `boolean`
   - `isGitRepo()`, `branchExists()`, `worktreeExists()`, `hasGitNotes()`

2. **Lookup functions** (optional data) → return `T | null`
   - `getGitNotes()`, `getCurrentBranch()`

3. **Command functions** (mutations) → throw on failure
   - `git()`, `addGitNotes()`, `addWorktree()`, `removeWorktree()`

4. **Data retrieval** (required data) → throw on failure
   - `getCommitHash()`, `getCommitInfo()`, `getDiffStats()`, `getGitStatus()`

Document pattern in code:
```typescript
/**
 * Get git notes for a commit.
 * @returns Notes content or null if no notes exist (not an error)
 */
export async function getGitNotes(ref = 'HEAD'): Promise<string | null>

/**
 * Get commit information.
 * @throws Error if ref doesn't exist or git command fails
 */
export async function getCommitInfo(ref = 'HEAD'): Promise<CommitInfo>
```
