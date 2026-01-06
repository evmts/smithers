# Review: b6d3bcf

**Commit:** b6d3bcff291686691e2f03ecce7d2e62878ad81b
**Message:** fix: address Codex security review for Worktree component
**Date:** 2026-01-06 23:49:30 UTC

## Feedback

- `src/core/execute.ts:1150` The new `validateBranchName` is overly restrictive (no dots), so common branch names like `release/1.2.3` or `feature/foo.bar` now hard-fail. Consider delegating to `git check-ref-format --branch` or expanding the regex to allow dots while still blocking `..`, `@{`, etc.
- `src/core/execute.ts:1217` You pass `branch` as a positional arg without `--`. If a branch name starts with `-`, Git will treat it as an option. Even if you keep regex validation, add `--` before branch args (e.g., `['worktree','add',absolutePath,'--',branch]`) or explicitly reject names starting with `-` to avoid option injection.
