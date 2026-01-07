# Review: fb9ab99

**Commit:** fb9ab99f39e0fc79373d2b861801c4c210714b40
**Message:** fix: allow re-execution of Claude nodes after worktree is fixed
**Date:** 2026-01-07 00:07:15 UTC

## Feedback

- `src/core/execute.ts:1372` — removing `contentHash` here doesn’t actually allow re-execution on the next frame because `saveExecutionState` always fills it back in (`src/core/execute.ts:858`), and `restoreExecutionState` restores the errored state when hashes match. When the worktree is fixed, the node still has error+contentHash and won’t be requeued. Consider skipping `contentHash` (or skipping restore) for this specific “blocked by worktree” error, or explicitly clearing that saved state when the worktree error is gone.
