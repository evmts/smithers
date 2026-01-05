# Review: ee19ac9

**Commit:** ee19ac96f2aa760861f2f8182f7ab5e38637d06e
**Message:** 🐛 fix: use stable node paths for execution state tracking
**Date:** 2026-01-05 23:39:22 UTC

## Feedback

- b/src/core/execute.ts:352: `restoreExecutionState` now only looks up by `nodePath`, so any previously persisted state keyed by `contentHash` won’t restore after upgrade. If external storage spans versions, add a fallback lookup (old `contentHash` key) or a migration path.
- b/src/core/execute.ts:406: `safeStringify` collapses any non‑JSON‑stringifiable object to `"[unstringifiable:object]"`, which can make different props hash identically and incorrectly reuse stale execution. Consider a cycle‑safe stringifier that preserves structure (e.g., replacer with seen set) or incorporate error details into the hash.
