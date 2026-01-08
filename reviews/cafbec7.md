# Review: cafbec7

**Commit:** cafbec799035fdf362411bbe55d1d771e6060dde
**Message:** docs: add comprehensive Worktree component design
**Date:** 2026-01-08 04:08:20 UTC

## Feedback

- `docs/worktree-design.md`: Branch behavior is internally inconsistent. API says `branch` can “create or use,” but the lifecycle uses `git worktree add -b <branch> <base>` (create only) and error handling claims “Branch already exists” as a hard error. Clarify whether existing branches are allowed and adjust the command/error text accordingly.
- `docs/worktree-design.md`: The “without branch (detached HEAD)” path is misleading: `git worktree add <path> <base>` only yields detached HEAD if `<base>` is a commit-ish; if it’s a branch name it checks out that branch. Update wording to avoid promising detached HEAD for any `<base>`.
