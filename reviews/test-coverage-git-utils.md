# Test Coverage Gap: Git Utilities

## Source Files Missing Tests

| File | Lines | Complexity |
|------|-------|------------|
| `src/utils/vcs/git.ts` | 268 | High |

Note: `git.worktree.test.ts` exists but only tests worktree functions. Core git operations untested.

## What Should Be Tested

### Core Operations
- `git()` - command execution wrapper, error handling
- `getCommitHash()` - ref parsing
- `getCommitInfo()` - hash, author, message extraction
- `getDiffStats()` - file counting, insertion/deletion parsing
- `getGitStatus()` - status parsing integration

### Git Notes (Smithers-specific)
- `addGitNotes()` - append vs add mode, force flag
- `getGitNotes()` - returns null when no notes
- `hasGitNotes()` - boolean check

### Repository Detection
- `isGitRepo()` - true in repo, false outside
- `getCurrentBranch()` - branch name, null for detached

### Worktree Operations (partially tested)
- `parseWorktreeList()` - porcelain output parsing
- `listWorktrees()` - command execution
- `addWorktree()` - branch creation flag handling
- `removeWorktree()` - force flag
- `branchExists()` - ref verification
- `worktreeExists()` - path matching

## Priority

**HIGH** - Git operations are critical for VCS integration. Errors here cause data loss or corrupt repos.

## Test Approach

```typescript
// Use Bun.$ mock or actual temp git repo
import { $ } from 'bun'

beforeEach(async () => {
  await $`git init /tmp/test-repo`.quiet()
})

test('getCommitHash returns HEAD sha', async () => {
  const hash = await getCommitHash('HEAD')
  expect(hash).toMatch(/^[a-f0-9]{40}$/)
})

test('getDiffStats parses numstat output', async () => {
  const stats = await getDiffStats('HEAD~1')
  expect(stats.files).toBeInstanceOf(Array)
  expect(typeof stats.insertions).toBe('number')
})
```

## Edge Cases Not Covered

- Binary file diffs (numstat returns `-` for binary)
- Merge commits with multiple parents
- Empty repository (no commits)
- Non-existent refs
- Detached HEAD state
- Notes ref not initialized
