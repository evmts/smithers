# Worktree PR Finalize

Orchestrates getting all worktree PRs into a mergeable state and merged.

## Workflow

Each worktree goes through these phases:

```
┌─────────────┐   ┌────────┐   ┌────────┐   ┌──────┐   ┌──────┐   ┌───────┐
│ Stack Check │──▶│ Rebase │──▶│ Review │──▶│ Push │──▶│ Poll │──▶│ Merge │
└─────────────┘   └────────┘   └────────┘   └──────┘   └──────┘   └───────┘
```

### Phases

1. **Stack Check** - Use `gh pr view` to determine if this PR's base is another PR (stacked). If base PR isn't merged, wait.

2. **Rebase** - `git fetch origin main && git rebase origin/main`. Handle conflicts with Claude.

3. **Review** - Self-review via `git diff origin/main...HEAD`, then fetch/address GH review comments via `gh pr view --json reviews`.

4. **Push** - Final rebase + `git push --force-with-lease`. Ensures linear history.

5. **Poll** - Loop on `gh pr view --json mergeable,statusCheckRollup` until CI passes and PR is mergeable.

6. **Merge** - `gh pr merge --squash --delete-branch`. Done.

## Usage

```bash
# Finalize all worktrees in parallel
bun examples/worktree-pr-finalize/index.tsx

# Sequential with merge commits
bun examples/worktree-pr-finalize/index.tsx --sequential --merge-method merge

# Single worktree
bun examples/worktree-pr-finalize/index.tsx --worktree fix-auth-bug
```

## Architecture

```
WorktreePRFinalizeOrchestrator
├── Discovers all worktrees in .worktrees/
├── Spawns WorktreePRFinalize for each (parallel or sequential)
└── Aggregates results

WorktreePRFinalize (per worktree)
├── StackCheckPhase
├── RebasePhase  
├── ReviewPhase
├── PushPhase
├── PollPhase
└── MergePhase
```

## State Management

All state in SQLite via `db.state` with keys like:
- `worktree-finalize:${name}:pr` - PR info
- `worktree-finalize:${name}:stacked` - Stack dependency info
- `worktree-finalize:${name}:rebase` - Rebase result
- `worktree-finalize:${name}:push` - Push result
- `worktree-finalize:${name}:merge` - Merge result

## GH CLI Commands Used

```bash
# Get PR for branch
gh pr list --head issue/worktree-name --json number,title,...

# Check if stacked
gh pr view 123 --json baseRefName

# Get reviews
gh pr view 123 --json reviews

# Reply to review
gh pr review 123 --comment -b "response"

# Check CI status
gh pr view 123 --json mergeable,mergeStateStatus,statusCheckRollup

# Merge
gh pr merge 123 --squash --delete-branch
```

## Key Patterns Demonstrated

- **Parallel orchestration** - Each worktree runs independently
- **Phase-based workflow** - Sequential phases with skip conditions
- **SQLite state** - No useState, all state in db.state
- **GH CLI integration** - All GitHub operations via gh cli
- **Claude integration** - Conflict resolution, self-review, review handling
